import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseJson, toSummary } from '@blog/contracts';
import type { DeploymentProbePort, DisplayEvent, ItemState, SourceRuntimeFactory, ViewModel } from '@blog/contracts';
import { createShareUrl, parseShare } from '@blog/render-core';
import { createStaticFactory, HttpContentSource } from '@blog/content-source';
import { choices, normalizeConfig } from '@blog/theme-contracts';
import type { ThemeRegistration } from '@blog/theme-contracts';
import { buildContent, parsePost } from '../scripts/build-content/index.ts';
import { loadConfig } from '../scripts/config.ts';
import { config, controller, factory, memoryStorage, record, source, until } from './support.ts';

const json = (value: unknown): Response => new Response(JSON.stringify(value));
test('input fidelity: share bases reject empty query and fragment delimiters', () => {
  for (const base of ['https://site.test/Blog/?', 'https://site.test/Blog/#']) assert.throws(() => createShareUrl(base, 'test', config(), { kind: 'home' }, 'react'), /url-unavailable/);
});
test('input fidelity: custom list endpoints replace reserved query parameters and preserve unrelated values', async () => {
  const urls: URL[] = [];
  const data = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/', endpoints: { list: 'contents?ids=old&ids=older&cursor=stale&limit=99&locale=%E4%B8%AD' } }, async url => { urls.push(new URL(String(url))); return json({ schemaVersion: 1, items: [] }); });
  await data.list({ limit: 2 }); await data.list({ ids: ['a', 'b'] }); await data.list({ cursor: 'new', limit: 3 });
  assert.deepEqual(urls.map(url => [...url.searchParams.entries()]), [[['locale', '中'], ['limit', '2']], [['locale', '中'], ['ids', 'a'], ['ids', 'b']], [['locale', '中'], ['limit', '3'], ['cursor', 'new']]]);
});
test('input fidelity: an API page cannot exceed the requested limit or be accepted partially', async () => {
  const data = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => json({ schemaVersion: 1, items: [toSummary(record('a')), toSummary(record('b'))] }));
  await assert.rejects(data.list({ limit: 1 }), /invalid-response/);
  assert.equal((await data.list({ limit: 2 })).items.length, 2);
});
for (const kind of ['http', 'static'] as const) test(`input fidelity: ${kind} empty-ID fast paths respect an already cancelled signal`, async () => {
  let calls = 0;
  const runtime = kind === 'http' ? await factory(new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => { ++calls; return json({}); })).initialize() : await createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/', fetch: async url => {
    ++calls; return String(url).endsWith('current.json') ? json({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' }) : json({ schemaVersion: 1, buildId: 'v1', siteUrl: 'content/v1/site.json', catalogUrl: 'content/v1/catalog.json', contents: {} });
  } }).initialize();
  const count = calls, abort = new AbortController(); abort.abort();
  try { await assert.rejects(runtime.source.list({ ids: [] }, abort.signal), error => error instanceof Error && error.name === 'AbortError'); assert.equal(calls, count); assert.deepEqual(await runtime.source.list({ ids: [] }), { items: [], diagnostics: [] }); }
  finally { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); }
});
test('input fidelity: a theme validator cannot rewrite a value after descriptor validation', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'size', label: 'size', kind: 'number', required: true }], defaults: {}, validate(options) { options.size = 'invented'; return []; } };
  assert.throws(() => normalizeConfig({ ...config([], 'test'), themeOptions: { size: 2 } }, 'react', [theme]));
});
for (const origin of ['input', 'defaults'] as const) test(`input fidelity: nested validator mutation cannot change ${origin} objects`, () => {
  const authored = { tone: 'author' }, expected = structuredClone(authored);
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'palette', label: 'palette', kind: 'enum', required: true, choices: [structuredClone(authored)] }], defaults: origin === 'defaults' ? { palette: authored } : {}, validate(options) { (options.palette as { tone: string }).tone = 'invented'; return []; } };
  assert.throws(() => normalizeConfig({ ...config([], 'test'), themeOptions: origin === 'input' ? { palette: authored } : {} }, 'react', [theme]));
  assert.deepEqual(authored, expected);
});
test('input fidelity: queued display events retain their submission snapshot', async () => {
  const { app } = controller(); let submitted = false;
  app.subscribe(model => {
    if (submitted || model.kind !== 'configure') return; submitted = true;
    const event: DisplayEvent = { type: 'set-theme', themeId: 'minimal-list', options: { density: 'comfortable', showTags: true } };
    app.dispatch(event); event.options.density = 'compact';
  });
  try { app.start(); const model = await until(app, value => value.kind === 'page'); assert.equal(model.kind === 'page' && model.page.config.themeOptions.density, 'comfortable'); }
  finally { app.destroy(); }
});
test('input fidelity: destroying on an image failure notification prevents subsequent probing', async () => {
  let checks = 0;
  const probe: DeploymentProbePort = { subscribe: () => () => {}, dispose() {}, async check() { ++checks; return { sourceInstanceId: 'test-instance', sessionBuildId: 'v1', probeGeneration: 1, observation: { kind: 'same', observedBuildId: 'v1' } }; } };
  const data = source({ async get(id) { return { item: record(id, '![作者说明](https://site.test/image.png)'), diagnostics: [], resourceContext: { kind: 'static', sourceId: 'test', buildId: 'v1', assetsByReference: {} } }; }, async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'static', sourceId: 'test', buildId: 'v1' } }; } });
  const runtimeFactory: SourceRuntimeFactory = { identity: { kind: 'static', sourceId: 'test', expectedBuildId: 'v1' }, async initialize() { return { kind: 'static', sourceId: 'test', sourceInstanceId: 'test-instance', buildId: 'v1', source: data, deploymentProbe: probe }; } };
  const { app } = controller({ factory: runtimeFactory, authorDefault: config() });
  try {
    app.start(); await until(app, model => model.kind === 'page' && model.page.items[0]?.status === 'ready');
    app.subscribe(model => { if (model.kind === 'page' && model.page.items[0].status === 'ready' && model.page.items[0].resourceStatus === 'degraded') app.destroy(); });
    const item = () => (app.getModel() as Extract<ViewModel, { kind: 'page' }>).page.items[0] as Extract<ItemState, { status: 'ready' }>;
    let resource = item().resources[0]; app.dispatch({ type: 'start-resource', id: 'a', resourceKey: resource.key, resourceRevision: resource.resourceRevision, attemptRevision: resource.attemptRevision });
    resource = item().resources[0]; app.dispatch({ type: 'resource-load-failed', id: 'a', resourceKey: resource.key, resourceRevision: resource.resourceRevision, attemptRevision: resource.attemptRevision });
    assert.equal(checks, 0);
  } finally { app.destroy(); }
});
test('input fidelity: duplicate and escape-equivalent frontmatter keys are rejected', () => {
  const meta = '{"schemaVersion":1,"id":"a","publication":"published","title":"first","ti\\u0074le":"second"}';
  assert.throws(() => parsePost('---\n' + meta + '\n---\n作者正文'), /invalid-json/);
});
test('input fidelity: duplicate site keys preserve the previous valid build', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-input-')), content = path.join(root, 'content'), output = path.join(root, 'output');
  try {
    await mkdir(content); await buildContent({ contentDir: content, outputDir: output }); const before = await readFile(path.join(output, 'content/current.json'), 'utf8');
    await writeFile(path.join(content, 'site.json'), '{"schemaVersion":1,"author":"first","author":"second"}');
    await assert.rejects(buildContent({ contentDir: content, outputDir: output }), /duplicate-key/);
    assert.equal(await readFile(path.join(output, 'content/current.json'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('input fidelity: duplicate nested application configuration keys are rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-input-')), file = path.join(root, 'config.json');
  try { await writeFile(file, '{"schemaVersion":1,"siteId":"test","basePath":"/","source":{"kind":"static","sourceId":"first","sourceId":"second"}}'); await assert.rejects(loadConfig(file), /duplicate-key/); }
  finally { await rm(root, { recursive: true, force: true }); }
});
const duplicateConfig = (): string => JSON.stringify(config(['a'])).replace('"contentIds":["a"]', '"contentIds":["b"],"contentIds":["a"]');
test('input fidelity: duplicate share fields do not silently choose the final selection', () => {
  const parsed = parseShare('?share=' + encodeURIComponent('{"sourceId":"test","config":' + duplicateConfig() + '}'), 'test', 'react');
  assert.deepEqual(parsed.state, { status: 'invalid', code: 'malformed' });
});
test('input fidelity: duplicate personal configuration stays invalid and remains stored', async () => {
  const raw = duplicateConfig(), storage = memoryStorage(raw), { app } = controller({ storage });
  try { app.start(); const model = await until(app, value => value.kind !== 'bootstrap'); assert.equal(model.kind, 'configure'); assert.equal(model.personalRead.status, 'invalid'); assert.equal(storage.value, raw); assert.equal(storage.writes, 0); }
  finally { app.destroy(); }
});
test('input fidelity: duplicate response fields reject the API article instead of overwriting facts', async () => {
  const body = '{"schemaVersion":1,"item":' + JSON.stringify(record()).replace('"title":"标题 a"', '"title":"第一条作者事实","title":"第二条作者事实"') + '}';
  const data = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => new Response(body));
  await assert.rejects(data.get('a'), /invalid-response/);
});
test('input fidelity: normalized object options do not alias caller input or theme defaults', () => {
  for (const origin of ['input', 'defaults']) {
    const authored = { tone: 'author' };
    const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'palette', label: 'palette', kind: 'enum', required: true, choices: [{ tone: 'author' }] }], defaults: origin === 'defaults' ? { palette: authored } : {}, validate: () => [] };
    const normalized = normalizeConfig({ ...config([], 'test'), themeOptions: origin === 'input' ? { palette: authored } : {} }, 'react', [theme]);
    (normalized.themeOptions.palette as { tone: string }).tone = 'changed'; assert.deepEqual(authored, { tone: 'author' });
  }
});
test('input fidelity: returned theme descriptors and defaults do not alias the registration', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'palette', label: 'palette', kind: 'enum', required: true, choices: [{ tone: 'author' }] }], defaults: { palette: { tone: 'author' } }, validate: () => [] };
  const before = structuredClone({ options: theme.options, defaults: theme.defaults });
  const output = choices('react', [theme])[0]; (output.defaults.palette as { tone: string }).tone = 'changed'; (output.options[0].choices![0] as { tone: string }).tone = 'changed';
  assert.deepEqual({ options: theme.options, defaults: theme.defaults }, before);
});
test('input fidelity: strict JSON preserves native grammar and distinct-object keys without recursion', () => {
  for (const text of ['null', 'true', '1.25e-3', '"作者\\\"正文"', '{"text":"{,}[]:\\\"","nested":[{"id":1},{"id":2}],"__proto__":{"value":1}}', '{"a":{"a":2},"b":{"a":3}}', '{"escaped\\u0061":"\\\\\\\""}']) assert.deepEqual(parseJson(text), JSON.parse(text));
  for (const text of ['', '{"a":1,}', '[1,]', '{a:1}', 'true false', '"bad\\x"']) assert.throws(() => parseJson(text), SyntaxError);
  const nested = '['.repeat(12000) + '0' + ']'.repeat(12000); assert.ok(Array.isArray(parseJson(nested)));
  for (const text of ['{"a":1,"a":1}', '[{"a":1,"\\u0061":2}]', '{"outer":{"x":1,"x":2}}', '{"__proto__":1,"__proto__":2}']) assert.throws(() => parseJson(text), /duplicate-key/);
});
test('input fidelity: read-only validators inspect nested options and normalization keeps authored values', () => {
  const authored = { tone: 'author' }; let inspections = 0;
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'palette', label: 'palette', kind: 'enum', required: true, choices: [authored] }], defaults: {}, validate(options) { ++inspections; assert.equal(Object.isFrozen(options), true); assert.equal(Object.isFrozen(options.palette), true); return []; } };
  const output = normalizeConfig({ ...config([], 'test'), themeOptions: { palette: authored } }, 'react', [theme]);
  assert.deepEqual(output.themeOptions, { palette: authored }); assert.equal(inspections, 1); assert.notEqual(output.themeOptions.palette, authored); assert.equal(Object.isFrozen(authored), false);
});
