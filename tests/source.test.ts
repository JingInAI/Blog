import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ContentSourceError, BootstrapError } from '@blog/contracts';
import { createStaticFactory, DeploymentProbe, HttpContentSource, requestJson } from '@blog/content-source';
import type { FetchPort } from '@blog/content-source';
import { deferred, record } from './support.ts';
const response = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher = (fn: (url: string, init?: RequestInit) => Promise<Response> | Response): FetchPort => ((url, init) => fn(String(url), init)) as FetchPort;
test('T03: HTTP rejects wrong identity/draft/filter outside IDs and exposes only diagnostic paths', async () => {
  const options = { sourceId: 'test', baseUrl: 'https://api.test/' };
  const bad = new HttpContentSource(options, fetcher(() => response({ schemaVersion: 1, item: record('b') })));
  await assert.rejects(bad.get('a'), /invalid-response/);
  const draft = new HttpContentSource(options, fetcher(() => response({ schemaVersion: 1, item: { ...record(), publication: 'draft' } })));
  await assert.rejects(draft.get('a'), /invalid-response/);
  const good = new HttpContentSource(options, fetcher(() => response({ schemaVersion: 1, item: { ...record(), secret: 'never-show' }, extra: 'private' })));
  const item = await good.get('a'); assert.deepEqual(item.diagnostics.map(d => d.fieldPath), ['response.extra', 'item.secret']); assert.ok(!JSON.stringify(item).includes('never-show'));
  const { body: _body, ...summary } = record('b');
  const list = new HttpContentSource(options, fetcher(() => response({ schemaVersion: 1, items: [summary] })));
  await assert.rejects(list.list({ ids: ['a'] }), /invalid-response/); await assert.rejects(list.list({ ids: ['a', 'a'] }), /invalid-response/);
  assert.deepEqual(await list.list({ ids: [] }), { items: [], diagnostics: [] });
});
test('T03: HTTP resource base needs declared precedence and does not derive from detail URL', async () => {
  const fetch = fetcher(() => response({ schemaVersion: 1, item: record(), resourceBaseUrl: 'https://assets.test/' }));
  const options = { sourceId: 'test', baseUrl: 'https://api.test/', resourceBaseUrl: 'https://configured.test/' };
  await assert.rejects(new HttpContentSource(options, fetch).get('a'), /invalid-response/);
  assert.equal((await new HttpContentSource({ ...options, resourceBasePriority: 'response' }, fetch).get('a')).resourceContext.kind, 'http');
  const plain = await new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, fetcher(() => response({ schemaVersion: 1, item: record() }))).get('a');
  assert.deepEqual(plain.resourceContext, { kind: 'http', sourceId: 'test' });
});
test('T03: malformed cursors/duplicate IDs fail atomically; site information and diagnostics are independent', async () => {
  const { body: _body, ...summary } = record();
  for (const payload of [{ schemaVersion: 1, items: [summary, summary] }, { schemaVersion: 1, items: [summary], nextCursor: '' }, { schemaVersion: 1, items: [], nextCursor: 'cursor' }]) {
    const s = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, fetcher(() => response(payload)));
    await assert.rejects(s.list({ cursor: 'cursor' }), /invalid-response/);
  }
  const s = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, fetcher(() => response({ schemaVersion: 1, site: { schemaVersion: 1, author: '站点作者', extension: true } })));
  const site = await s.getSite(); assert.equal(site.info.author, '站点作者'); assert.deepEqual(site.diagnostics, [{ code: 'unknown-api-field', fieldPath: 'site.extension' }]);
});
test('T04: status/network/JSON/abort errors are fixed codes, and default credentials are omitted', async () => {
  for (const [status, code] of [[404, 'not-found'], [401, 'unauthorized'], [403, 'forbidden'], [429, 'unavailable'], [500, 'unavailable'], [400, 'invalid-response']] as const) {
    await assert.rejects(requestJson('https://api.test/', { fetch: fetcher(() => response({}, status)) }), e => e instanceof ContentSourceError && e.detail.code === code);
  }
  await assert.rejects(requestJson('https://api.test/', { fetch: fetcher(() => { throw new Error('sensitive'); }) }), /network/);
  await assert.rejects(requestJson('https://api.test/', { fetch: fetcher(() => new Response('bad json')) }), /invalid-response/);
  const abort = new AbortController(); abort.abort(); await assert.rejects(requestJson('https://api.test/', { signal: abort.signal }), e => e instanceof Error && e.name === 'AbortError');
  await requestJson('https://api.test/', { fetch: fetcher((_u, init) => { assert.equal(init?.credentials, 'omit'); assert.equal(init?.cache, 'no-store'); return response({}); }) });
});
test('T03/T04: controlled real HTTP service validates routes, CORS response, identity and timeout', async () => {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/site') res.end(JSON.stringify({ schemaVersion: 1, site: { schemaVersion: 1 } }));
    else if (req.url === '/api/contents/%E7%BC%96%E5%8F%B7%25%2B') res.end(JSON.stringify({ schemaVersion: 1, item: record('编号%+') }));
    else if (req.url === '/timeout') { /* Wait for client abort. */ }
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object'); const base = `http://127.0.0.1:${address.port}/`;
  try {
    const source = new HttpContentSource({ sourceId: 'test', baseUrl: base + 'api/' });
    assert.deepEqual((await source.getSite()).info, { schemaVersion: 1 }); assert.equal((await source.get('编号%+')).item.id, '编号%+');
    await assert.rejects(source.get('missing'), /not-found/); await assert.rejects(requestJson(base + 'timeout', { timeoutMs: 1000 }), /timeout/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
function staticFixture(): { fetch: FetchPort; setVersion: (value: string) => void; setMissing: (value: boolean) => void; counts: Map<string, number> } {
  let version = 'v1', missing = false; const counts = new Map<string, number>();
  const manifest = { schemaVersion: 1, buildId: 'v1', siteUrl: 'content/v1/site.json', catalogUrl: 'content/v1/catalog.json', contents: { a: { url: 'content/v1/a.json', assetsByReference: {} } } };
  return { counts, setVersion(v) { version = v; }, setMissing(v) { missing = v; }, fetch: fetcher(url => {
    const p = new URL(url).pathname; counts.set(p, (counts.get(p) ?? 0) + 1);
    if (p.endsWith('current.json')) return response({ schemaVersion: 1, buildId: version, manifestUrl: `content/${version}/manifest.json` });
    if (p.endsWith('manifest.json')) return response(manifest);
    if (missing) return response({}, 404);
    if (p.endsWith('site.json')) return response({ schemaVersion: 1, buildId: 'v1', site: { schemaVersion: 1 } });
    if (p.endsWith('catalog.json')) { const { body: _body, ...summary } = record(); return response({ schemaVersion: 1, buildId: 'v1', items: [summary] }); }
    return response({ schemaVersion: 1, buildId: 'v1', item: record() });
  }) };
}
test('T13b: static factory checks pointer/app/manifest and refuses out-of-base artifact URLs', async () => {
  const f = staticFixture(), factory = createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: f.fetch });
  const runtime = await factory.initialize(); assert.equal(runtime.kind, 'static'); if (runtime.kind === 'static') runtime.deploymentProbe.dispose();
  f.setVersion('v2'); await assert.rejects(factory.initialize(), e => e instanceof BootstrapError && e.failure.kind === 'version');
  for (const fetch of [fetcher(() => response({}, 404)), fetcher(() => new Response('bad')), fetcher(() => response({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'https://other.test/m.json' }))]) await assert.rejects(createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch }).initialize(), e => e instanceof BootstrapError && e.failure.kind === 'request' && e.failure.error.code === 'invalid-response');
});
test('T03/T13b: static cache separates site/body; missing files probe instead of pretending empty', async () => {
  const f = staticFixture(), runtime = await createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: f.fetch }).initialize();
  try {
    assert.deepEqual((await runtime.source.getSite()).info, { schemaVersion: 1 }); assert.equal((await runtime.source.get('a')).item.id, 'a');
    await runtime.source.getSite(); await runtime.source.get('a'); assert.equal(f.counts.get('/Blog/content/v1/site.json'), 1); assert.equal(f.counts.get('/Blog/content/v1/a.json'), 1);
    assert.deepEqual((await runtime.source.list({})).items.map(i => i.id), ['a']);
    await assert.rejects(runtime.source.get('absent'), /not-found/);
    f.setVersion('v2'); await assert.rejects(runtime.source.get('absent'), /deployment-changed/);
  } finally { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); }
  const f2 = staticFixture(), r2 = await createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: f2.fetch }).initialize(); f2.setMissing(true);
  try { await assert.rejects(r2.source.getSite(), /invalid-response/); await assert.rejects(r2.source.get('a'), /invalid-response/); } finally { if (r2.kind === 'static') r2.deploymentProbe.dispose(); }
});
test('T13b: probe coalesces callers, independent cancellation, and different version stays confirmed', async () => {
  const pending = deferred<Response>(); let calls = 0; const events: string[] = [];
  const probe = new DeploymentProbe({ sourceInstanceId: 'instance', buildId: 'v1', baseUrl: 'https://site.test/', fetch: fetcher(() => { ++calls; return pending.promise; }) });
  probe.subscribe(e => events.push(e.phase)); const abort = new AbortController();
  const one = probe.check(abort.signal), two = probe.check(); abort.abort(); await assert.rejects(one, e => e instanceof Error && e.name === 'AbortError');
  pending.resolve(response({ schemaVersion: 1, buildId: 'v2', manifestUrl: 'content/v2/manifest.json' }));
  assert.equal((await two).observation.kind, 'different'); assert.equal((await probe.check()).observation.kind, 'different'); assert.equal(calls, 1); assert.deepEqual(events, ['started', 'finished']); probe.dispose();
  await assert.rejects(probe.check(), e => e instanceof Error && e.name === 'AbortError');
});
