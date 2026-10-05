import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BootstrapError, ContentSourceError, toSummary } from '@blog/contracts';
import { normalizeConfig, ThemeConfigError } from '@blog/theme-contracts';
import { parseShare, processBody } from '@blog/render-core';
import { config, controller, deferred, factory, record, source, until } from './support.ts';
test('T05/T10: required option without default stays a draft; legal full submission saves once', async () => {
  const registration = { id: 'minimal-list', label: '必填测试风格', version: 1, frameworkIds: ['react', 'vue'], options: [{ key: 'tone', label: '色调', kind: 'string' as const, required: true }], defaults: {}, validate: (options: Record<string, unknown>) => options.tone === 'green' ? [] : [{ key: 'tone', code: 'invalid-value' as const }] };
  const { app, storage } = controller({ registry: [registration] }); app.start(); await until(app, m => m.kind === 'configure');
  app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: {} }); assert.equal(app.getModel().kind, 'configure'); assert.ok(app.getModel().themeValidation.some(i => i.code === 'required')); assert.equal(storage.writes, 0);
  app.dispatch({ type: 'set-theme', themeId: 'minimal-list', options: { tone: 'green' } }); assert.equal(app.getModel().kind, 'page'); assert.equal(storage.writes, 1); app.destroy();
});
test('T08/T12: migration results are revalidated and normalized default expansion cannot bypass share size', () => {
  let calls = 0;
  const registration = { id: 'test', label: 'test', version: 2, frameworkIds: ['react'], options: [{ key: 'tone', label: 'tone', kind: 'string' as const, required: false }], defaults: { tone: 'x'.repeat(8200) }, validate: () => [], migrations: { 1: (value: ReturnType<typeof config>) => ({ ...value, themeVersion: 2, themeOptions: { tone: String(++calls) } }) } };
  const old = { ...config([], 'test'), themeOptions: {} }; assert.throws(() => normalizeConfig(old, 'react', [registration]), /non-deterministic/);
  const input = JSON.stringify({ sourceId: 'test', config: { ...old, themeVersion: 2 } }); const parsed = parseShare('?share=' + encodeURIComponent(input), 'test', 'react', [registration]);
  assert.deepEqual(parsed.state, { status: 'invalid', code: 'too-large' });
  assert.throws(() => normalizeConfig({ ...old, themeVersion: 2, themeOptions: { unknown: true } }, 'react', [registration]), ThemeConfigError);
});
test('T12: unrelated malformed parameter names stay unrelated and cannot prevent share recovery', () => {
  assert.deepEqual(parseShare('?other%FF=value', 'test', 'vue').state, { status: 'absent' });
  const raw = JSON.stringify({ sourceId: 'test', config: config() });
  assert.equal(parseShare('?other%FF=value&share=' + encodeURIComponent(raw), 'test', 'vue').state.status, 'valid');
});
test('T09a: footnote IDs are article-scoped and keep authored reference/definition content', () => {
  const one = processBody(record('a', '原文[^note]\n\n[^note]: 作者脚注'), { kind: 'http', sourceId: 'test' });
  const two = processBody(record('b', '原文[^note]\n\n[^note]: 作者脚注'), { kind: 'http', sourceId: 'test' });
  assert.ok(JSON.stringify(one).includes('fn-a-note')); assert.ok(JSON.stringify(two).includes('fn-b-note')); assert.ok(JSON.stringify(one).includes('作者脚注'));
});
test('T07: repeated cross-page cursor/ID fails without losing the complete first-page snapshot', async () => {
  for (const duplicate of ['id', 'cursor']) {
    const { app } = controller({ factory: factory(source({ async list(q) { return q.cursor ? { items: [toSummary(record(duplicate === 'id' ? 'a' : 'b'))], diagnostics: [], nextCursor: duplicate === 'cursor' ? 'p2' : 'p3' } : { items: [toSummary(record('a'))], diagnostics: [{ code: 'unknown-api-field', fieldPath: 'original' }], nextCursor: 'p2' }; } })) });
    app.start(); await until(app, m => m.kind === 'configure' && m.catalog.status === 'ready'); app.dispatch({ type: 'load-more-catalog' });
    const model = await until(app, m => m.kind === 'configure' && m.catalog.status === 'ready' && m.catalog.paging.status === 'error');
    if (model.kind === 'configure' && model.catalog.status === 'ready' && model.catalog.paging.status === 'error') { assert.equal(model.catalog.paging.error.code, 'invalid-response'); assert.deepEqual(model.catalog.snapshot.items.map(i => i.id), ['a']); assert.equal(model.catalog.snapshot.diagnostics[0].fieldPath, 'original'); }
    app.destroy();
  }
});
test('T04/T13c: version mismatch is sticky bootstrap and non-retryable; unload ignores pending work', async () => {
  let calls = 0; const { app } = controller({ factory: { identity: { kind: 'static', sourceId: 'test', expectedBuildId: 'v1' }, async initialize() { ++calls; throw new BootstrapError({ kind: 'version', expectedBuildId: 'v1', observedBuildId: 'v2' }); } } });
  app.start(); await until(app, m => m.kind === 'bootstrap' && m.bootstrap.status === 'error'); app.dispatch({ type: 'retry-bootstrap' }); assert.equal(calls, 1); assert.equal(app.getModel().deployment.status, 'changed'); app.destroy();
  const pending = deferred<Awaited<ReturnType<ReturnType<typeof source>['getSite']>>>(); let emitted = 0;
  const { app: other } = controller({ factory: factory(source({ getSite: () => pending.promise, async get() { throw new ContentSourceError('network'); } })), authorDefault: config() }); other.subscribe(() => ++emitted); other.start(); await until(other, m => m.kind === 'page'); other.destroy(); const before = emitted;
  pending.resolve({ info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'test' } }); await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(emitted, before);
});
