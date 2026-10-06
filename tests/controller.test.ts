import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BootstrapError, ContentSourceError, StorageError, UrlUpdateError, toSummary } from '@blog/contracts';
import type { ContentResult, DeploymentProbeEvent, DeploymentProbePort, ItemState, SourceRuntime, SourceRuntimeFactory, ViewModel } from '@blog/contracts';
import { config, controller, deferred, factory, memoryStorage, record, result, shareSearch, source, until } from './support.ts';
const pageReady = (m: ViewModel): boolean => m.kind === 'page' && m.page.items.every(i => i.status !== 'loading');
const currentConfig = (m: ViewModel) => m.kind === 'page' ? m.page.config : m.kind === 'detail' ? m.config : undefined;
test('T05: no implicit theme/content, ordered selection, empty selection and invalid/no-op edits', async () => {
  let gets = 0; const { app, storage } = controller({ factory: factory(source({ async get(id) { ++gets; return result(record(id)); } })) });
  app.start(); await until(app, m => m.kind === 'configure'); assert.equal(storage.writes, 0);
  app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} }); await until(app, pageReady); assert.deepEqual(currentConfig(app.getModel())?.contentIds, []);
  app.dispatch({ type: 'set-content', ids: ['b', 'a'] }); await until(app, pageReady);
  const model = app.getModel(); assert.equal(model.kind, 'page'); if (model.kind === 'page') assert.deepEqual(model.page.items.map(i => i.id), ['b', 'a']);
  const writes = storage.writes; app.requestShare(); app.dispatch({ type: 'set-content', ids: ['b', 'a'] }); app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: { showTags: true, density: 'comfortable' } });
  assert.equal(storage.writes, writes); assert.equal(gets, 2); assert.equal(app.getModel().operations.share.status, 'success');
  app.dispatch({ type: 'set-content', ids: ['a', 'a'] }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['b', 'a']);
  app.dispatch({ type: 'set-content', ids: [] }); assert.equal(app.getModel().kind, 'page'); app.destroy();
});
test('T08: shared edits are memory-only; A→B→A clears dirty; saving persists and exits sharing', async () => {
  const { app, storage } = controller({ initialLocation: { target: { kind: 'home' }, search: shareSearch(config()) } });
  app.start(); await until(app, pageReady); assert.equal(storage.reads, 0);
  app.dispatch({ type: 'set-content', ids: ['b'] }); assert.equal(app.getModel().configuration.dirty, true); assert.equal(storage.writes, 0);
  app.dispatch({ type: 'set-content', ids: ['a'] }); assert.equal(app.getModel().configuration.dirty, false);
  app.saveSharedConfig(); assert.equal(storage.writes, 1); assert.equal(app.getModel().configuration.persistence, 'auto'); assert.equal(app.getModel().shareInput.status, 'absent'); app.destroy();
});
test('T08: invalid share blocks personal/default fallback but supports a legitimate explicit draft', async () => {
  const storage = memoryStorage(JSON.stringify(config())); const { app } = controller({ storage, authorDefault: config(['b']), initialLocation: { target: { kind: 'detail', id: 'a' }, search: '?share=bad' } });
  app.start(); await until(app, m => m.kind === 'configure'); assert.equal(storage.reads, 0); assert.equal(app.getModel().shareInput.status, 'invalid');
  app.dispatch({ type: 'set-theme', themeId: 'card-grid', options: {} }); await until(app, m => m.kind === 'detail' && m.item.status === 'ready');
  assert.deepEqual(currentConfig(app.getModel())?.contentIds, []); assert.equal(app.getModel().configuration.dirty, true); assert.equal(storage.writes, 0); assert.equal(app.getModel().shareInput.status, 'invalid');
  app.saveSharedConfig(); assert.equal(app.getModel().shareInput.status, 'absent'); assert.equal(app.getModel().navigation.target.kind, 'detail'); app.destroy();
});
test('T08: initial storage read error permits explicit author default, while explicit recovery preserves session', async () => {
  const storage = memoryStorage(); storage.read = () => { throw new StorageError('storage-read-failed'); };
  const { app } = controller({ storage, authorDefault: config() }); app.start(); await until(app, pageReady);
  assert.equal(app.getModel().personalRead.status, 'error'); assert.equal(app.getModel().configuration.origin, 'author-default'); assert.equal(storage.writes, 0); app.destroy();
  const { app: shared } = controller({ storage, initialLocation: { target: { kind: 'home' }, search: shareSearch(config(['b'])) } }); shared.start(); await until(shared, pageReady);
  shared.dispatch({ type: 'use-personal-config' }); assert.deepEqual(currentConfig(shared.getModel())?.contentIds, ['b']); assert.equal(shared.getModel().configuration.persistence, 'explicit'); assert.equal(shared.getModel().operations.recovery.status, 'error'); shared.destroy();
});
test('T08: corrupt personal record stays untouched; author values never fill article metadata', async () => {
  const storage = memoryStorage('broken'); const { app } = controller({ storage, authorDefault: config(), factory: factory(source({ async getSite() { return { info: { schemaVersion: 1, author: '站点作者' }, diagnostics: [], source: { kind: 'http', sourceId: 'test' } }; } })) });
  app.start(); await until(app, m => pageReady(m) && m.site.status === 'ready'); assert.equal(storage.value, 'broken'); assert.equal(app.getModel().personalRead.status, 'invalid');
  const model = app.getModel(); if (model.kind === 'page' && model.page.items[0].status === 'ready') assert.equal(model.page.items[0].content.author, undefined);
  app.dispatch({ type: 'use-personal-config' }); assert.equal(app.getModel().kind, 'configure'); assert.equal(storage.value, 'broken'); app.destroy();
});
test('T08: failed writes keep baseline and record; save partial admits committed storage without exiting share', async () => {
  const storage = memoryStorage('old'); const { app } = controller({ storage, initialLocation: { target: { kind: 'home' }, search: shareSearch(config()) }, sessionUrl: { removeShare() { throw new UrlUpdateError(); } } });
  app.start(); await until(app, pageReady); app.dispatch({ type: 'set-content', ids: ['b'] }); app.saveSharedConfig();
  const model = app.getModel(); assert.equal(model.operations.save.status, 'partial'); assert.equal(model.configuration.dirty, false); assert.equal(model.configuration.saveStatus, 'saved'); assert.equal(model.configuration.persistence, 'explicit'); assert.equal(model.shareInput.status, 'valid'); assert.deepEqual(JSON.parse(storage.value!).contentIds, ['b']);
  storage.write = () => { throw new StorageError('storage-write-failed'); }; app.dispatch({ type: 'set-content', ids: ['a'] }); app.saveSharedConfig(); assert.equal(app.getModel().configuration.dirty, true); assert.deepEqual(JSON.parse(storage.value!).contentIds, ['b']);
  app.dispatch({ type: 'set-content', ids: ['b'] }); app.saveSharedConfig(); assert.equal(app.getModel().configuration.dirty, false); assert.equal(app.getModel().configuration.saveStatus, 'failed'); app.destroy();
});
test('T08: reset remove failure is unchanged; remove success/URL failure is partial and does not roll back', async () => {
  const storage = memoryStorage(JSON.stringify(config())); const originalRemove = storage.remove;
  storage.remove = () => { throw new StorageError('storage-remove-failed'); };
  let failUrl = true; const { app } = controller({ storage, authorDefault: config(['b']), initialLocation: { target: { kind: 'home' }, search: shareSearch(config()) }, sessionUrl: { removeShare(expected) { if (failUrl) throw new UrlUpdateError(); return { ...expected, search: '' }; } } });
  app.start(); await until(app, pageReady); const before = app.getModel().configuration;
  app.dispatch({ type: 'reset-to-author-default' }); assert.deepEqual(app.getModel().configuration, before); assert.ok(storage.value);
  storage.remove = originalRemove; app.dispatch({ type: 'reset-to-author-default' }); assert.equal(storage.value, null); assert.equal(app.getModel().operations.reset.status, 'partial'); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['a']); assert.equal(app.getModel().configuration.persistence, 'explicit');
  failUrl = false; app.dispatch({ type: 'reset-to-author-default' }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['b']); assert.equal(app.getModel().configuration.origin, 'author-default'); assert.equal(storage.value, null); assert.equal(app.getModel().configuration.dirty, false); app.destroy();
});
test('T08: use-author is non-writing, invalid defaults and failed URL update preserve current session', async () => {
  const storage = memoryStorage(JSON.stringify(config())); const { app } = controller({ storage, authorDefault: { invalid: true }, initialLocation: { target: { kind: 'home' }, search: shareSearch(config(['b'])) } });
  app.start(); await until(app, pageReady); app.dispatch({ type: 'use-author-default-config' }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['b']); assert.equal(app.getModel().operations.recovery.status, 'error'); assert.equal(storage.removes, 0); app.destroy();
  const { app: other } = controller({ storage, authorDefault: config(), initialLocation: { target: { kind: 'home' }, search: shareSearch(config(['b'])) }, sessionUrl: { removeShare() { throw new UrlUpdateError(); } } }); other.start(); await until(other, pageReady); other.dispatch({ type: 'use-author-default-config' }); assert.deepEqual(currentConfig(other.getModel())?.contentIds, ['b']); assert.equal(other.getModel().configuration.persistence, 'explicit'); assert.equal(storage.writes, 0); other.destroy();
});
test('T06/T12: navigation preserves unsaved drafts, same-target share changes initialize once, internal cleanup stays committed', async () => {
  const storage = memoryStorage(JSON.stringify(config(['b']))); const { app } = controller({ storage, authorDefault: config(), initialLocation: { target: { kind: 'detail', id: 'a' }, search: shareSearch(config()) } });
  app.start(); await until(app, m => m.kind === 'detail' && m.item.status === 'ready'); app.dispatch({ type: 'set-content', ids: [] });
  app.setLocation({ target: { kind: 'detail', id: 'b' }, search: shareSearch(config()) }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, []); assert.equal(app.getModel().configuration.dirty, true);
  const revision = app.getModel().navigation.routeRevision; app.setLocation({ target: { kind: 'detail', id: 'b' }, search: shareSearch(config(['b'], 'card-grid')) }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['b']); assert.equal(app.getModel().navigation.routeRevision, revision);
  app.setLocation({ target: { kind: 'detail', id: 'b' }, search: '?share=bad' }); assert.equal(app.getModel().kind, 'configure');
  app.dispatch({ type: 'use-author-default-config' }); app.setLocation({ target: { kind: 'detail', id: 'b' }, search: '' }); assert.deepEqual(currentConfig(app.getModel())?.contentIds, ['a']); assert.equal(app.getModel().configuration.origin, 'author-default'); app.destroy();
});
test('T06: stale detail A and source/site results cannot overwrite B or a switched runtime', async () => {
  const a = deferred<ContentResult>(); const site = deferred<Awaited<ReturnType<ReturnType<typeof source>['getSite']>>>();
  const { app } = controller({ authorDefault: config([]), initialLocation: { target: { kind: 'detail', id: 'a' }, search: '' }, factory: factory(source({ get: id => id === 'a' ? a.promise : Promise.resolve(result(record(id))), getSite: () => site.promise })) });
  app.start(); await until(app, m => m.kind === 'detail'); app.setNavigation({ kind: 'detail', id: 'b' }); await until(app, m => m.kind === 'detail' && m.item.id === 'b' && m.item.status === 'ready');
  a.resolve(result(record('a'))); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(app.getModel().kind, 'detail'); const m = app.getModel(); if (m.kind === 'detail') assert.equal(m.item.id, 'b');
  app.changeSource(factory()); await until(app, m => m.site.status === 'ready'); site.resolve({ info: { schemaVersion: 1, title: '旧站点' }, diagnostics: [], source: { kind: 'http', sourceId: 'test' } }); await new Promise(resolve => setTimeout(resolve, 5)); const current = app.getModel(); if (current.site.status === 'ready') assert.equal(current.site.info.title, undefined); app.destroy();
});
test('T07: failed page retains snapshot and diagnostics; refresh replaces together; repeated/cross-page IDs fail', async () => {
  let calls = 0; const { app } = controller({ factory: factory(source({ async list(q) {
    ++calls; const summary = toSummary(record(q.cursor ? 'b' : 'a'));
    if (calls === 2) throw new ContentSourceError('network');
    return { items: [summary], diagnostics: [{ code: 'unknown-api-field', fieldPath: calls === 1 ? 'old.extra' : 'new.extra' }], ...(q.cursor ? {} : { nextCursor: 'p2' }) };
  } })) });
  app.start(); await until(app, m => m.kind === 'configure' && m.catalog.status === 'ready'); app.dispatch({ type: 'load-more-catalog' });
  await until(app, m => m.kind === 'configure' && m.catalog.status === 'ready' && m.catalog.paging.status === 'error');
  let m = app.getModel(); if (m.kind === 'configure') { assert.equal(m.catalog.snapshot.items.length, 1); assert.equal(m.catalog.snapshot.diagnostics[0].fieldPath, 'old.extra'); }
  app.dispatch({ type: 'retry-catalog-page' }); await until(app, m => m.kind === 'configure' && m.catalog.snapshot.items.length === 2); app.dispatch({ type: 'retry-catalog' });
  await until(app, m => m.kind === 'configure' && m.catalog.status === 'ready' && m.catalog.snapshot.items.length === 1); m = app.getModel(); if (m.kind === 'configure') assert.deepEqual(m.catalog.snapshot.diagnostics.map(d => d.fieldPath), ['new.extra']); app.destroy();
});
test('T04/T13c: shell precedes source initialization, retry coalesces, and late runtimes are disposed', async () => {
  let attempts = 0; const pending = deferred<SourceRuntime>();
  const runtimeFactory: SourceRuntimeFactory = { identity: { kind: 'http', sourceId: 'test' }, initialize() { if (++attempts === 1) return Promise.reject(new BootstrapError({ kind: 'request', error: { code: 'network', retryable: true } })); return pending.promise; } };
  const { app } = controller({ factory: runtimeFactory }); assert.equal(app.getModel().kind, 'bootstrap'); app.start(); await until(app, m => m.kind === 'bootstrap' && m.bootstrap.status === 'error');
  app.dispatch({ type: 'retry-bootstrap' }); app.dispatch({ type: 'retry-bootstrap' }); assert.equal(attempts, 2);
  app.changeSource(factory()); await until(app, m => m.kind === 'configure'); let disposed = 0;
  pending.resolve({ kind: 'static', sourceId: 'test', sourceInstanceId: 'old', buildId: 'old', source: source(), deploymentProbe: { check: () => Promise.reject(), subscribe: () => () => {}, dispose() { ++disposed; } } });
  await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(disposed, 1); assert.equal(app.getModel().kind, 'configure'); app.destroy();
});
test('T09b/T13c: idle/start/first-terminal/retry/detach scopes and sticky deployment failure survive theme changes', async () => {
  let listener: ((e: DeploymentProbeEvent) => void) | undefined; let checks = 0;
  const probe: DeploymentProbePort = { subscribe(fn) { listener = fn; return () => { listener = undefined; }; }, async check() { ++checks; return { sourceInstanceId: 'static', sessionBuildId: 'v1', probeGeneration: 1, observation: { kind: 'same', observedBuildId: 'v1' } }; }, dispose() {} };
  const s = source({ async get(id) { return { item: record(id, '![作者描述](https://site.test/photo.png)'), diagnostics: [], resourceContext: { kind: 'static', sourceId: 'test', buildId: 'v1', assetsByReference: {} } }; }, async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'static', sourceId: 'test', buildId: 'v1' } }; } });
  const f: SourceRuntimeFactory = { identity: { kind: 'static', sourceId: 'test', expectedBuildId: 'v1' }, async initialize() { return { kind: 'static', sourceId: 'test', sourceInstanceId: 'static', buildId: 'v1', source: s, deploymentProbe: probe }; } };
  const { app } = controller({ factory: f, authorDefault: config() }); app.start(); await until(app, pageReady);
  const item = (): Extract<ItemState, { status: 'ready' }> => { const m = app.getModel(); assert.equal(m.kind, 'page'); return (m as Extract<ViewModel, { kind: 'page' }>).page.items[0] as Extract<ItemState, { status: 'ready' }>; };
  const dispatch = (type: 'start-resource' | 'resource-loaded' | 'resource-load-failed' | 'detach-resource') => { const r = item().resources[0]; app.dispatch({ type, id: 'a', resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision }); };
  assert.equal(item().resourceStatus, 'idle'); dispatch('start-resource'); assert.equal(item().resources[0].attemptRevision, 1); dispatch('resource-load-failed'); assert.equal(item().resourceStatus, 'degraded'); assert.equal(checks, 1);
  const failed = item().resources[0]; app.dispatch({ type: 'retry-resource', id: 'a', resourceKey: failed.key, resourceRevision: failed.resourceRevision }); dispatch('resource-loaded'); assert.equal(item().resourceStatus, 'ready'); dispatch('resource-load-failed'); assert.equal(item().resourceStatus, 'ready');
  dispatch('detach-resource'); const detached = item().resources[0]; app.dispatch({ type: 'resource-loaded', id: 'a', resourceKey: detached.key, resourceRevision: detached.resourceRevision, attemptRevision: detached.attemptRevision - 1 }); assert.equal(item().resourceStatus, 'idle');
  dispatch('start-resource'); dispatch('resource-load-failed');
  listener!({ phase: 'started', sourceInstanceId: 'static', sessionBuildId: 'v1', probeGeneration: 2 }); listener!({ phase: 'finished', result: { sourceInstanceId: 'static', sessionBuildId: 'v1', probeGeneration: 2, observation: { kind: 'different', observedBuildId: 'v2' } } });
  assert.equal(item().resources[0].state.status, 'error'); const old = item().resources[0]; app.dispatch({ type: 'set-theme', themeId: 'card-grid', options: {} }); assert.notEqual(item().resources[0].resourceRevision, old.resourceRevision);
  app.dispatch({ type: 'resource-load-failed', id: 'a', resourceKey: old.key, resourceRevision: old.resourceRevision, attemptRevision: old.attemptRevision }); assert.equal(checks, 2);
  dispatch('start-resource'); const locked = item().resources[0]; assert.equal(locked.state.status, 'error'); if (locked.state.status === 'error') assert.equal(locked.state.error.retryable, false);
  listener!({ phase: 'finished', result: { sourceInstanceId: 'static', sessionBuildId: 'v1', probeGeneration: 1, observation: { kind: 'same', observedBuildId: 'v1' } } }); assert.equal(app.getModel().deployment.status, 'changed'); app.destroy();
});
test('T11: a future renderer uses registered themes and rejects unsupported choices without framework core changes', async () => {
  const registration = { id: 'text', label: '文字', version: 1, frameworkIds: ['custom'], options: [], defaults: {}, validate: () => [] };
  const { app } = controller({ frameworkId: 'custom', registry: [registration] }); app.start(); await until(app, m => m.kind === 'configure');
  app.dispatch({ type: 'set-theme', themeId: 'text', options: {} }); assert.equal(currentConfig(app.getModel())?.themeId, 'text'); app.dispatch({ type: 'set-theme', themeId: 'card-grid', options: {} }); assert.equal(currentConfig(app.getModel())?.themeId, 'text'); app.destroy();
});
