import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UrlUpdateError } from '@blog/contracts';
import type { ContentResult, SourceRuntime } from '@blog/contracts';
import { config, controller, deferred, factory, result, shareSearch, source, until } from './support.ts';

test('T06/T08: changing source cleans sharing before bootstrap and clears old validation state', async () => {
  const pending = deferred<SourceRuntime>(); let cleanups = 0; const reads: string[] = [];
  const { app } = controller({ initialLocation: { target: { kind: 'detail', id: 'b' }, search: '?keep=1&' + shareSearch(config()).slice(1) },
    storage: { read(key) { reads.push(key); return JSON.stringify(config([])); }, write() { assert.fail('source switch must not write'); }, remove() { assert.fail('source switch must not remove'); } },
    sessionUrl: { removeShare(expected) { ++cleanups; return { ...expected, search: '?keep=1' }; } } });
  try {
    app.start(); await until(app, m => m.kind === 'detail' && m.item.status === 'ready');
    app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: { density: 'invalid' } });
    assert.ok(app.getModel().themeValidation.length);
    app.changeSource({ identity: { kind: 'http', sourceId: 'next' }, initialize: () => pending.promise });
    const boot = app.getModel(); assert.equal(boot.kind, 'bootstrap'); assert.equal(cleanups, 1);
    assert.deepEqual(boot.themeValidation, []); assert.equal(boot.shareInput.status, 'absent');
    pending.resolve({ kind: 'http', sourceId: 'next', sourceInstanceId: 'next-instance', source: {
      async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'next' } }; },
      async list() { return { items: [], diagnostics: [] }; },
      async get(id) { return { item: { schemaVersion: 1, id, publication: 'published', title: '新来源作者标题', body: { format: 'markdown', value: '新来源作者正文' } }, diagnostics: [], resourceContext: { kind: 'http', sourceId: 'next' } }; }
    } });
    const model = await until(app, m => m.kind === 'detail' && m.item.status === 'ready');
    assert.equal(model.configuration.origin, 'personal'); assert.equal(model.configuration.persistence, 'auto');
    assert.deepEqual(reads, ['blog:test-site:next:display:v1']);
    assert.deepEqual(model.navigation.target, { kind: 'detail', id: 'b' });
    app.setLocation({ target: { kind: 'detail', id: 'b' }, search: '?keep=1' });
    assert.equal(reads.length, 1);
  } finally { app.destroy(); }
});

test('T06/T08: failed URL cleanup preserves the active source, configuration and requests', async () => {
  let starts = 0; let activeSignal: AbortSignal | undefined; const content = deferred<ContentResult>();
  const { app } = controller({ initialLocation: { target: { kind: 'home' }, search: shareSearch(config()) },
    factory: factory(source({ get(_id, signal) { activeSignal = signal; return content.promise; } })),
    sessionUrl: { removeShare() { throw new UrlUpdateError(); } } });
  try {
    app.start(); await until(app, m => m.kind === 'page' && m.page.status === 'loading' && m.site.status === 'ready' && m.page.catalog.status === 'ready');
    const before = app.getModel();
    assert.throws(() => app.changeSource({ identity: { kind: 'http', sourceId: 'next' }, async initialize() { ++starts; throw new Error('must not start'); } }), UrlUpdateError);
    assert.equal(starts, 0); assert.deepEqual(app.getModel(), before);
    assert.ok(activeSignal); assert.equal(activeSignal.aborted, false);
    content.resolve(result()); await until(app, m => m.kind === 'page' && m.page.status === 'ready');
    app.requestShare(); assert.equal(app.getModel().operations.share.status, 'success');
  } finally { app.destroy(); }
});

test('T06: invalid source identity is rejected before URL cleanup or releasing the active runtime', async () => {
  let cleanups = 0; const { app } = controller({ authorDefault: config([]), sessionUrl: { removeShare(expected) { ++cleanups; return expected; } } });
  try {
    app.start(); await until(app, m => m.kind === 'page' && m.site.status === 'ready' && m.page.catalog.status === 'ready');
    const before = app.getModel();
    assert.throws(() => app.changeSource({ ...factory(), identity: { kind: 'http', sourceId: '../invalid' } }));
    assert.equal(cleanups, 0); assert.deepEqual(app.getModel(), before);
  } finally { app.destroy(); }
});

test('T04/T06: changing source before start does not initialize it early or twice', async () => {
  let starts = 0; const next = factory(); const { app } = controller();
  try {
    app.changeSource({ ...next, async initialize(signal) { ++starts; return next.initialize(signal); } });
    assert.equal(starts, 0); app.start(); await until(app, m => m.kind === 'configure');
    assert.equal(starts, 1); app.start(); assert.equal(starts, 1);
  } finally { app.destroy(); }
});

test('T08: delimiter-containing site/source identities cannot collide in personal storage', async () => {
  const values = new Map<string, string>(), reads: string[] = [];
  const storage = { read(key: string) { reads.push(key); return values.get(key) ?? null; }, write(key: string, value: string) { values.set(key, value); }, remove(key: string) { values.delete(key); } };
  const first = controller({ siteId: 'a:b', storage });
  const second = controller({ siteId: 'a', storage, factory: { identity: { kind: 'http', sourceId: 'b:test' }, async initialize() { return { kind: 'http', sourceId: 'b:test', sourceInstanceId: 'second-instance', source: source({ async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'b:test' } }; } }) }; } } });
  try {
    first.app.start(); await until(first.app, m => m.kind === 'configure');
    first.app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} });
    assert.equal(values.size, 1);
    second.app.start(); const next = await until(second.app, m => m.kind !== 'bootstrap');
    assert.equal(next.kind, 'configure'); assert.equal(new Set(reads).size, 2);
    assert.deepEqual(reads, ['blog:a%3Ab:test:display:v1', 'blog:a:b%3Atest:display:v1']);
  } finally { first.app.destroy(); second.app.destroy(); }
});
