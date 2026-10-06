import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { BootstrapError } from '@blog/contracts';
import { confinedUrl, createStaticFactory, DeploymentProbe } from '@blog/content-source';
import type { FetchPort } from '@blog/content-source';
import { config, controller, factory, source, until } from './support.ts';

const json = (value: unknown): Response => new Response(JSON.stringify(value));
const invalidBootstrap = (error: unknown): boolean => error instanceof BootstrapError && error.failure.kind === 'request' && error.failure.error.code === 'invalid-response';
for (const field of ['manifest', 'site', 'catalog', 'body', 'image'] as const) {
  test(`version isolation: rejects a ${field} URL from another build before consuming it`, async () => {
    const calls: string[] = [];
    const fetchPort: FetchPort = async url => {
      const value = String(url); calls.push(value);
      if (value.endsWith('current.json')) return json({ schemaVersion: 1, buildId: 'v1', manifestUrl: `content/${field === 'manifest' ? 'v2' : 'v1'}/manifest.json` });
      return json({ schemaVersion: 1, buildId: 'v1', siteUrl: `content/${field === 'site' ? 'v2' : 'v1'}/site.json`, catalogUrl: `content/${field === 'catalog' ? 'v2' : 'v1'}/catalog.json`, contents: { a: { url: `content/${field === 'body' ? 'v2' : 'v1'}/a.json`, assetsByReference: { 'assets/photo.png': { publishedUrl: `content/${field === 'image' ? 'v2' : 'v1'}/assets/photo.png` } } } } });
    };
    await assert.rejects(createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: fetchPort }).initialize(), invalidBootstrap);
    assert.equal(calls.length, field === 'manifest' ? 1 : 2);
  });
}
test('version isolation: invalid build path identities fail before transport, including independent probes', async () => {
  let calls = 0; const fetchPort: FetchPort = async () => { ++calls; return json({}); };
  for (const buildId of ['.', '..', 'v1/v2', 'v1\\v2', 'v1\u0000']) {
    await assert.rejects(createStaticFactory({ sourceId: 'test', expectedBuildId: buildId, baseUrl: 'https://site.test/', fetch: fetchPort }).initialize(), invalidBootstrap);
    assert.throws(() => new DeploymentProbe({ sourceInstanceId: 'test', buildId, baseUrl: 'https://site.test/', fetch: fetchPort }));
  }
  assert.equal(calls, 0);
});
test('version isolation: artifact paths reject ambiguous escapes and even empty query or fragment delimiters', () => {
  const base = 'https://site.test/Blog/content/v1/';
  for (const ref of ['assets/%2Fprivate.png', 'assets/%5Cprivate.png', 'assets/%00.png', 'assets/%FF.png', 'assets/%2e%2e%2fprivate.png', 'assets\\photo.png', 'assets/photo.png?', 'assets/photo.png#', 'assets/\tphoto.png']) assert.throws(() => confinedUrl(ref, base), ref);
  assert.equal(confinedUrl('assets/%E4%BD%9C%E8%80%85%20%25%23.png', base), base + 'assets/%E4%BD%9C%E8%80%85%20%25%23.png');
});
test('lifecycle: source replacement during bootstrap notification initializes each factory once', async () => {
  let oldCalls = 0, newCalls = 0; let oldSignal: AbortSignal | undefined;
  const old = factory(), next = factory();
  const oldInitialize = old.initialize, newInitialize = next.initialize;
  old.initialize = signal => { ++oldCalls; oldSignal = signal; return oldInitialize(signal); };
  next.initialize = signal => { ++newCalls; return newInitialize(signal); };
  const { app } = controller({ factory: old }); let changed = false;
  app.subscribe(model => { if (!changed && model.kind === 'bootstrap') { changed = true; app.changeSource(next); } });
  try { app.start(); await until(app, model => model.kind === 'configure' && model.site.status === 'ready'); assert.equal(oldCalls, 1); assert.equal(newCalls, 1); assert.equal(oldSignal?.aborted, true); }
  finally { app.destroy(); }
});
test('lifecycle: all subscribers observe location revisions in order when an observer navigates', async () => {
  const { app } = controller(); let navigated = false; const revisions: number[] = [];
  app.subscribe(model => { if (model.kind === 'configure' && !navigated) { navigated = true; app.setNavigation({ kind: 'detail', id: 'b' }); } });
  app.subscribe(model => { revisions.push(model.navigation.routeRevision); });
  try { app.start(); await until(app, model => model.navigation.routeRevision === 1); await delay(5); assert.equal(revisions.at(-1), 1); assert.ok(revisions.every((revision, index) => index === 0 || revision >= revisions[index - 1]), JSON.stringify(revisions)); }
  finally { app.destroy(); }
});
for (const phase of ['bootstrap', 'configure', 'slot', 'site', 'catalog'] as const) {
  test(`lifecycle: destroying during ${phase} notification starts no cancelled work`, async () => {
    const calls: string[] = [];
    const underlying = source();
    const data = source({ getSite: signal => { calls.push('site'); return underlying.getSite(signal); }, list: (query, signal) => { calls.push('catalog'); return underlying.list(query, signal); }, get: (id, signal) => { calls.push('get:' + id); return underlying.get(id, signal); } });
    const runtimeFactory = factory(data), initialize = runtimeFactory.initialize;
    runtimeFactory.initialize = signal => { calls.push('initialize'); return initialize(signal); };
    const { app } = controller({ factory: runtimeFactory, ...(phase === 'slot' ? { authorDefault: config(['a', 'b']) } : {}) });
    let destroyed = false, configured = false;
    app.subscribe(model => {
      const previous = configured;
      if (model.kind === 'configure') configured = true;
      const target = phase === 'bootstrap' ? model.kind === 'bootstrap' : phase === 'configure' ? model.kind === 'configure' : phase === 'slot' ? model.kind === 'page' : phase === 'site' ? previous && model.site.status === 'loading' : false;
      // The catalog loading notification happens while the site's promise is pending.
      const catalogTarget = phase === 'catalog' && previous && calls.includes('site') && !calls.includes('catalog');
      if (!destroyed && (target || catalogTarget)) { destroyed = true; app.destroy(); }
    });
    try { app.start(); await delay(20); assert.equal(destroyed, true); assert.deepEqual(calls, phase === 'bootstrap' ? [] : phase === 'catalog' ? ['initialize', 'site'] : ['initialize']); }
    finally { app.destroy(); }
  });
}
test('version isolation: valid root/subpath builds retain explicitly mapped URLs and encoded filenames', async () => {
  for (const base of ['https://site.test/', 'https://site.test/Blog/']) for (const buildId of ['v1', '版本%+']) {
    const prefix = `content/${encodeURIComponent(buildId)}/`, calls: string[] = [];
    const fetchPort: FetchPort = async url => {
      calls.push(String(url));
      return String(url).endsWith('current.json') ? json({ schemaVersion: 1, buildId, manifestUrl: prefix + 'manifest-custom.json' }) : json({ schemaVersion: 1, buildId, siteUrl: prefix + 'site-custom.json', catalogUrl: prefix + 'catalog-custom.json', contents: { a: { url: prefix + 'body-custom.json', assetsByReference: { 'assets/authored.png': { publishedUrl: prefix + 'assets/%E4%BD%9C%E8%80%85%20%25%23.png' } } } } });
    };
    const runtime = await createStaticFactory({ sourceId: 'test', expectedBuildId: buildId, baseUrl: base, fetch: fetchPort }).initialize();
    try { assert.deepEqual(calls, [base + 'content/current.json', base + prefix + 'manifest-custom.json']); assert.equal(runtime.kind, 'static'); }
    finally { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); }
  }
});
test('version isolation: a malformed observed pointer cannot confirm deployment change or poison retries', async () => {
  let calls = 0;
  const probe = new DeploymentProbe({ sourceInstanceId: 'test', buildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: async () => json({ schemaVersion: 1, buildId: 'v2', manifestUrl: `content/${++calls === 1 ? 'v1' : 'v2'}/manifest.json` }) });
  try { assert.equal((await probe.check()).observation.kind, 'failed'); assert.deepEqual((await probe.check()).observation, { kind: 'different', observedBuildId: 'v2' }); assert.equal((await probe.check()).observation.kind, 'different'); assert.equal(calls, 2); }
  finally { probe.dispose(); }
});
