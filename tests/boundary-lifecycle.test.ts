import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DisplayEvent, HttpSourceOptions } from '@blog/contracts';
import { createHttpFactory, createStaticFactory, DeploymentProbe, HttpContentSource, requestJson } from '@blog/content-source';
import { buildContent } from '../scripts/build-content/index.ts';
import { loadConfig } from '../scripts/config.ts';
import { controller, deferred, record, until } from './support.ts';

const run = promisify(execFile), siteScript = path.resolve('scripts/site.ts'), tsxLoader = path.resolve('node_modules/tsx/dist/loader.mjs');
const json = (value: unknown): Response => new Response(JSON.stringify(value));
const post = (): string => { const { body, ...meta } = record(); return '---\n' + JSON.stringify(meta) + '\n---\n' + body.value; };
const invalidBytes = (text: string): Buffer => {
  const index = text.indexOf('INVALID_UTF8'); assert.ok(index >= 0);
  return Buffer.concat([Buffer.from(text.slice(0, index)), Buffer.from([0xc3, 0x28]), Buffer.from(text.slice(index + 'INVALID_UTF8'.length))]);
};
for (const location of ['post', 'site', 'config'] as const) test(`boundary lifecycle: malformed UTF-8 in ${location} fails without replacing authored bytes or output`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-boundary-')), content = path.join(root, 'content'), output = path.join(root, 'output');
  try {
    await mkdir(path.join(content, 'posts'), { recursive: true }); await writeFile(path.join(content, 'posts/article.md'), post());
    await buildContent({ contentDir: content, outputDir: output }); const before = await readFile(path.join(output, 'content/current.json'), 'utf8');
    const file = location === 'post' ? path.join(content, 'posts/article.md') : location === 'site' ? path.join(content, 'site.json') : path.join(root, 'config.json');
    const bytes = invalidBytes(location === 'post' ? post() + '\nINVALID_UTF8' : location === 'site' ? '{"schemaVersion":1,"author":"INVALID_UTF8"}' : '{"schemaVersion":1,"siteId":"INVALID_UTF8","source":{"kind":"static","sourceId":"test"},"basePath":"/"}');
    await writeFile(file, bytes);
    await assert.rejects(location === 'config' ? loadConfig(file) : buildContent({ contentDir: content, outputDir: output }), /invalid-utf8/);
    assert.deepEqual(await readFile(file), bytes); assert.equal(await readFile(path.join(output, 'content/current.json'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('boundary lifecycle: malformed UTF-8 API facts are invalid rather than replacement-character text', async () => {
  const bytes = invalidBytes(JSON.stringify({ schemaVersion: 1, item: { ...record(), title: 'INVALID_UTF8' } }));
  const source = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => new Response(new Uint8Array(bytes)));
  await assert.rejects(source.get('a'), /invalid-response/);
});
test('boundary lifecycle: direct HTTP sources capture identities and endpoint/resource configuration', async () => {
  const options: HttpSourceOptions = { sourceId: 'test', baseUrl: 'https://api.test/', resourceBaseUrl: 'https://assets.test/', endpoints: { detail: id => 'original/' + id } };
  const calls: string[] = [], data = new HttpContentSource(options, async url => { calls.push(String(url)); return json({ schemaVersion: 1, item: record() }); });
  options.sourceId = 'changed'; options.baseUrl = 'https://changed.test/'; options.resourceBaseUrl = 'https://changed-assets.test/'; options.endpoints!.detail = id => 'changed/' + id; options.timeoutMs = 0;
  const result = await data.get('a'); assert.deepEqual(calls, ['https://api.test/original/a']); assert.deepEqual(result.resourceContext, { kind: 'http', sourceId: 'test', resourceBaseUrl: 'https://assets.test/' });
});
test('boundary lifecycle: HTTP factories preserve creation configuration across later caller edits', async () => {
  const options: HttpSourceOptions = { sourceId: 'test', baseUrl: 'https://api.test/', endpoints: { site: 'original-site' } }, calls: string[] = [];
  const factory = createHttpFactory(options, async url => { calls.push(String(url)); return json({ schemaVersion: 1, site: { schemaVersion: 1 } }); });
  options.sourceId = 'changed'; options.baseUrl = 'https://changed.test/'; options.endpoints!.site = 'changed-site';
  const runtime = await factory.initialize(); assert.equal(runtime.sourceId, 'test'); assert.deepEqual((await runtime.source.getSite()).source, { kind: 'http', sourceId: 'test' }); assert.deepEqual(calls, ['https://api.test/original-site']); assert.equal(Object.isFrozen(factory.identity), true); assert.equal(Object.isFrozen(options), false);
});
test('boundary lifecycle: static factories preserve source and build identity while initialization awaits transport', async () => {
  const started = deferred<void>(), pending = deferred<Response>(); const calls: string[] = [];
  const options = { sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/', fetch: async (url: Parameters<typeof fetch>[0]): Promise<Response> => {
    calls.push(String(url)); if (String(url).endsWith('current.json')) { started.resolve(); return pending.promise; }
    return json({ schemaVersion: 1, buildId: 'v1', siteUrl: 'content/v1/site.json', catalogUrl: 'content/v1/catalog.json', contents: {} });
  } };
  const factory = createStaticFactory(options), initialization = factory.initialize(); await started.promise;
  options.sourceId = 'changed'; options.expectedBuildId = 'v2'; options.baseUrl = 'https://changed.test/'; options.fetch = async () => { throw new Error('changed transport'); };
  pending.resolve(json({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' }));
  const runtime = await initialization;
  try { assert.equal(runtime.sourceId, 'test'); assert.equal(runtime.kind === 'static' && runtime.buildId, 'v1'); assert.deepEqual(calls, ['https://site.test/content/current.json', 'https://site.test/content/v1/manifest.json']); assert.equal(Object.isFrozen(factory.identity), true); }
  finally { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); }
});
test('boundary lifecycle: probes capture session and instance identity while awaiting a pointer', async () => {
  const started = deferred<void>(), pending = deferred<Response>();
  const options = { sourceInstanceId: 'instance', buildId: 'v1', baseUrl: 'https://site.test/', fetch: async (): Promise<Response> => { started.resolve(); return pending.promise; } };
  const probe = new DeploymentProbe(options); const checking = probe.check(); await started.promise; options.sourceInstanceId = 'changed'; options.buildId = 'v2';
  pending.resolve(json({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' }));
  try { const result = await checking; assert.equal(result.sourceInstanceId, 'instance'); assert.equal(result.sessionBuildId, 'v1'); assert.deepEqual(result.observation, { kind: 'same', observedBuildId: 'v1' }); }
  finally { probe.dispose(); }
});
test('boundary lifecycle: direct requests reject explicit null timeouts before calling transport', async () => {
  let calls = 0;
  await assert.rejects(requestJson('https://api.test/', { timeoutMs: null, fetch: async () => { ++calls; return json({}); } } as unknown as Parameters<typeof requestJson>[1]), /invalid-response/); assert.equal(calls, 0);
});
test('boundary lifecycle: probes reject invalid timeout configuration at construction', () => {
  for (const timeoutMs of [null, 0, NaN, 500, 120001]) assert.throws(() => new DeploymentProbe({ sourceInstanceId: 'instance', buildId: 'v1', baseUrl: 'https://site.test/', timeoutMs } as unknown as ConstructorParameters<typeof DeploymentProbe>[0]), /invalid-response/);
});
test('boundary lifecycle: uncloneable queued theme input reports validation without breaking initialization', async () => {
  const { app } = controller(); let submitted = false;
  app.subscribe(model => {
    if (submitted || model.kind !== 'configure') return; submitted = true;
    assert.doesNotThrow(() => app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: { invalid: () => 'not JSON' } } as unknown as DisplayEvent));
  });
  try { app.start(); const model = await until(app, value => value.kind === 'configure' && value.site.status === 'ready' && value.themeValidation.length > 0); assert.equal(model.kind, 'configure'); }
  finally { app.destroy(); }
});
test('boundary lifecycle: an existing output file is refused and its exact bytes survive', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-boundary-')), content = path.join(root, 'content'), output = path.join(root, 'output');
  try { await mkdir(content); await writeFile(output, '作者已有文件'); await assert.rejects(buildContent({ contentDir: content, outputDir: output }), /invalid-output-directory/); assert.equal(await readFile(output, 'utf8'), '作者已有文件'); assert.deepEqual((await readdir(root)).sort(), ['content', 'output']); }
  finally { await rm(root, { recursive: true, force: true }); }
});
for (const framework of ['vue', 'react']) test(`boundary lifecycle: ${framework} CLI refuses a file output without modifying project documentation`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-boundary-')); const configFile = path.join(root, 'blog.config.json'), output = path.join(root, 'README.md');
  try {
    await mkdir(path.join(root, `apps/blog-${framework}`), { recursive: true }); await writeFile(path.join(root, `apps/blog-${framework}/index.html`), '<html><body>隔离的作者测试入口</body></html>'); await mkdir(path.join(root, 'content'));
    for (const kind of ['static', 'http']) {
      await writeFile(configFile, JSON.stringify({ schemaVersion: 1, siteId: 'test', source: { kind, sourceId: 'test', ...(kind === 'http' ? { baseUrl: 'https://api.test/' } : {}) }, basePath: '/' })); await writeFile(output, '作者已有项目说明');
      await assert.rejects(run(process.execPath, ['--import', tsxLoader, siteScript, 'build', framework], { cwd: root, env: { ...process.env, BLOG_CONFIG: configFile, BLOG_OUTPUT_DIR: output }, timeout: 30000 }), /invalid-output-directory/); assert.equal(await readFile(output, 'utf8'), '作者已有项目说明');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('boundary lifecycle: valid UTF-8 preserves authored replacement characters and leading network BOM compatibility', async () => {
  const item = record('a', '作者明确提供的 � 与中文 😀\uFEFF正文');
  for (const prefix of ['', '\uFEFF']) {
    const source = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => new Response(prefix + JSON.stringify({ schemaVersion: 1, item })));
    assert.deepEqual((await source.get('a')).item, item);
  }
});
test('boundary lifecycle: existing directory outputs can be replaced after complete validation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-boundary-')), content = path.join(root, 'content'), output = path.join(root, 'output');
  try {
    await mkdir(path.join(content, 'posts'), { recursive: true }); await writeFile(path.join(content, 'posts/article.md'), post());
    const first = await buildContent({ contentDir: content, outputDir: output });
    await writeFile(path.join(content, 'posts/article.md'), post() + '\n作者明确的新正文');
    const second = await buildContent({ contentDir: content, outputDir: output }); assert.notEqual(first.buildId, second.buildId);
    assert.equal(JSON.parse(await readFile(path.join(output, 'content/current.json'), 'utf8')).buildId, second.buildId);
    assert.deepEqual((await readdir(root)).sort(), ['content', 'output']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('boundary lifecycle: captured endpoint callbacks remain callable without freezing caller objects', async () => {
  let count = 0; const options: HttpSourceOptions = { sourceId: 'test', baseUrl: 'https://api.test/', endpoints: { detail(id) { ++count; return 'authored/' + id; } } };
  const before = { ...options.endpoints }, urls: string[] = [];
  const source = new HttpContentSource(options, async url => { urls.push(String(url)); return json({ schemaVersion: 1, item: record() }); });
  await source.get('a'); await source.get('a'); assert.equal(count, 2); assert.deepEqual(urls, ['https://api.test/authored/a', 'https://api.test/authored/a']); assert.deepEqual(options.endpoints, before); assert.equal(Object.isFrozen(options.endpoints), false);
});
