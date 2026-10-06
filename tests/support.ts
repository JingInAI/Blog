import { setTimeout as delay } from 'node:timers/promises';
import { toSummary } from '@blog/contracts';
import type { ContentRecord, ContentResult, ContentSource, DisplayConfig, PersonalStoragePort, SourceRuntimeFactory, ViewModel } from '@blog/contracts';
import { BlogController } from '@blog/render-core';
export const record = (id = 'a', body = '作者提供的正文'): ContentRecord => ({ schemaVersion: 1, id, publication: 'published', title: `标题 ${id}`, body: { format: 'markdown', value: body } });
export const config = (ids = ['a'], themeId = 'minimal-list'): DisplayConfig => ({ version: 1, contentIds: ids, themeId, themeVersion: 1, themeOptions: { density: 'comfortable', showTags: true } });
export const result = (item = record()): ContentResult => ({ item, diagnostics: [], resourceContext: { kind: 'http', sourceId: 'test', resourceBaseUrl: 'https://api.test/assets/' } });
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (e: unknown) => void } { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
export function memoryStorage(value: string | null = null): PersonalStoragePort & { value: string | null; writes: number; removes: number; reads: number } {
  const storage = { value, writes: 0, removes: 0, reads: 0, read() { ++storage.reads; return storage.value; }, write(_key: string, v: string) { ++storage.writes; storage.value = v; }, remove() { ++storage.removes; storage.value = null; } }; return storage;
}
export function source(overrides: Partial<ContentSource> = {}): ContentSource {
  return { async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'test' } }; }, async list() { return { items: [toSummary(record('a')), toSummary(record('b'))], diagnostics: [] }; }, async get(id) { return result(record(id)); }, ...overrides };
}
export function factory(s = source()): SourceRuntimeFactory { return { identity: { kind: 'http', sourceId: 'test' }, async initialize() { return { kind: 'http', sourceId: 'test', sourceInstanceId: crypto.randomUUID(), source: s }; } }; }
export function controller(overrides: Partial<ConstructorParameters<typeof BlogController>[0]> = {}): { app: BlogController; storage: ReturnType<typeof memoryStorage> } {
  const storage = memoryStorage();
  const app = new BlogController({ frameworkId: 'react', siteId: 'test-site', factory: factory(), storage, sessionUrl: { removeShare: expected => ({ ...expected, search: '' }) }, shareBaseUrl: 'https://site.test/Blog/', initialLocation: { target: { kind: 'home' }, search: '' }, ...overrides });
  return { app, storage };
}
export async function until(app: BlogController, predicate: (m: ViewModel) => boolean): Promise<ViewModel> {
  for (let n = 0; n < 100; n++) { const model = app.getModel(); if (predicate(model)) return model; await delay(5); }
  throw new Error('Timed out: ' + JSON.stringify(app.getModel()));
}
export const shareSearch = (c: DisplayConfig): string => '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'test', config: c }));
