import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, normalizeConfig, themeSelectionOptions } from '@blog/theme-contracts';
import type { ThemeRegistration } from '@blog/theme-contracts';
import { BlogController } from '@blog/render-core';
import { requestJson } from '@blog/content-source';
import { ContentSourceError } from '@blog/contracts';
import { config, factory, memoryStorage, source, until } from './support.ts';
test('presentation: migrations only execute explicitly registered own version entries', () => {
  let calls = 0;
  const migrate = (input: import('@blog/contracts').DisplayConfig) => { ++calls; return { ...input, themeVersion: 2 }; };
  const registration: ThemeRegistration = { id: 'test', label: 'test', version: 2, frameworkIds: ['react'], defaults: {}, options: [], validate: () => [], migrations: Object.create({ 1: migrate }) };
  const input = { ...config([], 'test'), themeOptions: {} };
  assert.throws(() => normalizeConfig(input, 'react', [registration]));
  assert.equal(calls, 0);
  const valid = normalizeConfig(input, 'react', [{ ...registration, migrations: { 1: migrate } }]);
  assert.equal(valid.themeVersion, 2); assert.equal(calls, 2);
});
test('presentation: JSON requests reject unsupported schemes and URL credentials before transport', async () => {
  let requests = 0;
  const fetchPort: typeof fetch = async () => { ++requests; return new Response('{"schemaVersion":1}'); };
  for (const url of ['data:application/json,%7B%7D', 'file:///tmp/content.json', 'ftp://api.test/content', 'https://reader:password@api.test/content']) {
    await assert.rejects(requestJson(url, { fetch: fetchPort }), error => error instanceof ContentSourceError && error.detail.code === 'invalid-response');
  }
  assert.equal(requests, 0);
  assert.deepEqual(await requestJson('https://api.test/content?format=json', { fetch: fetchPort }), { schemaVersion: 1 });
  assert.equal(requests, 1);
});

test('presentation: semantic duplicate enum choices fail at registration', () => {
  for (const values of [[{ a: 1, b: 2 }, { b: 2, a: 1 }], [[1, 2], [1, 2]], [null, null], [0, -0]]) {
    const registration: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['vue'], defaults: {}, validate: () => [],
      options: [{ key: 'value', label: 'value', kind: 'enum', required: false, choices: values }] };
    assert.throws(() => choices('vue', [registration]));
  }
});
test('presentation: selection defaults are independent deep copies', () => {
  const theme = choices('vue')[0];
  theme.defaults = { nested: { value: [1, 2] }, fontSize: 'normal' };
  const next = themeSelectionOptions(theme, undefined);
  (next.nested as { value: number[] }).value.push(3);
  assert.deepEqual(theme.defaults.nested, { value: [1, 2] });
});
test('presentation: incompatible enum values are not carried between theme descriptors', () => {
  const theme = choices('vue')[0];
  theme.defaults.fontSize = 'normal';
  const restricted = { ...theme, options: theme.options.map(option => option.key === 'fontSize' ? { ...option, choices: ['normal'] } : option) };
  assert.equal(themeSelectionOptions(restricted, { ...config(), themeOptions: { ...config().themeOptions, fontSize: 'largest' } }).fontSize, 'normal');
});
test('presentation: controller captures scalar options and author defaults without freezing caller data', async () => {
  const initial = config();
  const storage = memoryStorage();
  const writtenKeys: string[] = [], originalWrite = storage.write;
  storage.write = (key, value) => { writtenKeys.push(key); originalWrite(key, value); };
  const options = { frameworkId: 'react', siteId: 'original', factory: factory(), storage, authorDefault: initial,
    sessionUrl: { removeShare: (location: import('@blog/contracts').LocationInput) => location }, shareBaseUrl: 'https://site.test/', initialLocation: { target: { kind: 'home' as const }, search: '' } };
  const app = new BlogController(options);
  try {
    options.siteId = 'changed'; options.shareBaseUrl = 'https://changed.test/'; initial.contentIds.push('b');
    app.start(); await until(app, model => model.kind === 'page');
    const model = app.getModel(); assert.equal(model.kind, 'page');
    if (model.kind === 'page') assert.deepEqual(model.page.config.contentIds, ['a']);
    app.requestShare(); const result = app.getModel();
    assert.equal(result.operations.share.status, 'success');
    if (result.operations.share.status === 'success') assert.ok(result.operations.share.url.startsWith('https://site.test/'));
    app.dispatch({ type: 'set-content', ids: ['a', 'b'] });
    assert.deepEqual(writtenKeys, ['blog:original:test:display:v1']);
    assert.equal(Object.isFrozen(initial), false);
  } finally { app.destroy(); }
});
test('presentation: invalid author defaults remain errors and accessors are never evaluated', async () => {
  let reads = 0;
  const authored = Object.defineProperty(config(), 'themeOptions', { enumerable: true, get() { ++reads; return { density: 'comfortable', showTags: true }; } });
  const app = new BlogController({ frameworkId: 'react', siteId: 'original', factory: factory(), storage: memoryStorage(), authorDefault: authored,
    sessionUrl: { removeShare: location => location }, shareBaseUrl: 'https://site.test/', initialLocation: { target: { kind: 'home' }, search: '' } });
  try {
    app.start(); await until(app, model => model.kind === 'configure');
    const model = app.getModel(); assert.equal(model.kind, 'configure');
    if (model.kind === 'configure') assert.ok(model.notices.some(notice => notice.code === 'invalid-author-default'));
    assert.equal(reads, 0);
  } finally { app.destroy(); }
});
test('presentation: queued source changes retain the identity submitted by their caller', async () => {
  const records = new Map<string, string>();
  const app = new BlogController({ frameworkId: 'react', siteId: 'original', factory: factory(),
    storage: { read: key => records.get(key) ?? null, write: (key, value) => { records.set(key, value); }, remove: key => { records.delete(key); } },
    sessionUrl: { removeShare: location => location }, shareBaseUrl: 'https://site.test/', initialLocation: { target: { kind: 'home' }, search: '' } });
  const nextFactory = { identity: { kind: 'http' as const, sourceId: 'target' }, async initialize() {
    return { kind: 'http' as const, sourceId: 'target', sourceInstanceId: 'target-instance', source: source({ async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'target' } }; } }) };
  } };
  try {
    app.start(); await until(app, model => model.kind === 'configure');
    let submitted = false;
    const unsubscribe = app.subscribe(() => {
      if (submitted) return; submitted = true;
      app.changeSource(nextFactory); nextFactory.identity.sourceId = 'changed';
    });
    app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} });
    await until(app, model => model.kind === 'configure'); unsubscribe();
    app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} });
    app.requestShare(); const result = app.getModel(); assert.equal(result.operations.share.status, 'success');
    if (result.operations.share.status === 'success') assert.equal(JSON.parse(new URL(result.operations.share.url).searchParams.get('share')!).sourceId, 'target');
    assert.equal(Object.isFrozen(nextFactory.identity), false);
  } finally { app.destroy(); }
});
test('presentation: controller registry and factory identities are isolated from later caller mutations', async () => {
  const base = factory();
  const registry: ThemeRegistration[] = [{ id: 'minimal-list', label: 'original', version: 1, frameworkIds: ['react'],
    options: [{ key: 'density', label: 'density', kind: 'enum', required: false, choices: ['comfortable'] }], defaults: { density: 'comfortable' }, validate: () => [] }];
  const storage = memoryStorage();
  const app = new BlogController({ frameworkId: 'react', siteId: 'original', factory: base, registry, storage,
    sessionUrl: { removeShare: location => location }, shareBaseUrl: 'https://site.test/', initialLocation: { target: { kind: 'home' }, search: '' } });
  try {
    registry[0].label = 'changed'; registry[0].defaults.density = 'invalid';
    (base.identity as { sourceId: string }).sourceId = 'changed';
    assert.equal(app.getModel().themes[0].label, 'original');
    app.start(); await until(app, model => model.kind !== 'bootstrap');
    app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} });
    const model = app.getModel(); assert.equal(model.kind, 'page');
    if (model.kind === 'page') assert.equal(model.page.config.themeOptions.density, 'comfortable');
    assert.equal(Object.isFrozen(registry[0].defaults), false);
  } finally { app.destroy(); }
});
