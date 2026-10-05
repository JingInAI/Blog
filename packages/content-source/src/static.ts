import { BootstrapError, ContentSourceError, abortError, contentError, contentRecord, contentSummary, freeze, isAbort, object, siteInfo, string, validId, validateQuery, compareIds } from '@blog/contracts';
import type { ContentSource, ContentQuery, ContentPage, ContentResult, SiteResult, Manifest, SourceRuntimeFactory, DeploymentProbePort } from '@blog/contracts';
import { requestJson, confinedUrl } from './request.ts';
import type { FetchPort } from './request.ts';
import { pointer, DeploymentProbe } from './probe.ts';
function manifest(value: unknown, base: string, expected: string): Manifest {
  const o = object(value, ['schemaVersion', 'buildId', 'siteUrl', 'catalogUrl', 'contents'], 'manifest');
  if (o.schemaVersion !== 1 || o.buildId !== expected) throw new ContentSourceError('invalid-response');
  const raw = object(o.contents, Object.keys((o.contents ?? {}) as object), 'manifest.contents');
  const contents = Object.fromEntries(Object.entries(raw).map(([id, entry]) => {
    validId(id); const e = object(entry, ['url', 'assetsByReference'], 'manifest.entry');
    const a = object(e.assetsByReference, Object.keys((e.assetsByReference ?? {}) as object), 'manifest.assets');
    const assetsByReference = Object.fromEntries(Object.entries(a).map(([ref, v]) => {
      const data = object(v, ['publishedUrl'], 'manifest.asset'); return [ref, { publishedUrl: confinedUrl(data.publishedUrl, base) }];
    }));
    return [id, { url: confinedUrl(e.url, base), assetsByReference }];
  }));
  return freeze({ schemaVersion: 1, buildId: expected, siteUrl: confinedUrl(o.siteUrl, base), catalogUrl: confinedUrl(o.catalogUrl, base), contents });
}
export class StaticContentSource implements ContentSource {
  private cache = new Map<string, unknown>();
  constructor(private readonly sourceId: string, private readonly data: Manifest, private readonly probe: DeploymentProbePort, private readonly fetchPort?: FetchPort) {}
  private async missing(signal?: AbortSignal, absentId = false): Promise<never> {
    const result = await this.probe.check(signal);
    throw new ContentSourceError(result.observation.kind === 'different' ? 'deployment-changed' : result.observation.kind === 'failed' ? 'unavailable' : absentId ? 'not-found' : 'invalid-response');
  }
  private async read<T>(key: string, url: string, parse: (v: unknown) => T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();
    if (this.cache.has(key)) return this.cache.get(key) as T;
    try {
      const raw = await requestJson(url, { signal, fetch: this.fetchPort });
      let parsed: T; try { parsed = freeze(parse(raw)); } catch { throw new ContentSourceError('invalid-response'); }
      if (signal?.aborted) throw abortError(); this.cache.set(key, parsed); return parsed;
    } catch (e) { if (e instanceof ContentSourceError && e.detail.code === 'not-found') return this.missing(signal); throw e; }
  }
  getSite(signal?: AbortSignal): Promise<SiteResult> {
    return this.read('site', this.data.siteUrl, raw => {
      const o = object(raw, ['schemaVersion', 'buildId', 'site'], 'site-file');
      if (o.schemaVersion !== 1 || o.buildId !== this.data.buildId) throw new Error('invalid-site');
      return { info: siteInfo(o.site), diagnostics: [], source: { kind: 'static', sourceId: this.sourceId, buildId: this.data.buildId } };
    }, signal);
  }
  async list(query: ContentQuery, signal?: AbortSignal): Promise<ContentPage> {
    let q: ContentQuery; try { q = validateQuery(query); } catch { throw new ContentSourceError('invalid-response'); }
    if (q.ids?.length === 0) return freeze({ items: [], diagnostics: [] });
    const items = await this.read('catalog', this.data.catalogUrl, raw => {
      const o = object(raw, ['schemaVersion', 'buildId', 'items'], 'catalog-file');
      if (o.schemaVersion !== 1 || o.buildId !== this.data.buildId || !Array.isArray(o.items)) throw new Error('invalid-catalog');
      const list = o.items.map(i => contentSummary(i, 'static')).sort((a, b) => compareIds(a.id, b.id));
      if (new Set(list.map(i => i.id)).size !== list.length || list.some(i => !Object.hasOwn(this.data.contents, i.id))) throw new Error('invalid-catalog');
      return list;
    }, signal);
    if (q.ids) return freeze({ items: items.filter(i => q.ids!.includes(i.id)), diagnostics: [] });
    const start = q.cursor === undefined ? 0 : Number(q.cursor);
    if (!Number.isInteger(start) || start < 0 || start >= items.length || (q.cursor !== undefined && String(start) !== q.cursor)) {
      if (q.cursor !== undefined) throw new ContentSourceError('invalid-response');
    }
    const end = start + q.limit!;
    return freeze({ items: items.slice(start, end), diagnostics: [], ...(end < items.length ? { nextCursor: String(end) } : {}) });
  }
  async get(id: string, signal?: AbortSignal): Promise<ContentResult> {
    try { validId(id); } catch { throw new ContentSourceError('invalid-response'); }
    if (!Object.hasOwn(this.data.contents, id)) return this.missing(signal, true);
    const entry = this.data.contents[id];
    return this.read(`body:${id}`, entry.url, raw => {
      const o = object(raw, ['schemaVersion', 'buildId', 'item'], 'body-file');
      if (o.schemaVersion !== 1 || o.buildId !== this.data.buildId) throw new Error('invalid-body');
      const item = contentRecord(o.item); if (item.id !== id || item.publication !== 'published') throw new Error('invalid-body');
      return { item, diagnostics: [], resourceContext: { kind: 'static', sourceId: this.sourceId, buildId: this.data.buildId, assetsByReference: entry.assetsByReference } };
    }, signal);
  }
}
export function createStaticFactory(options: { sourceId: string; expectedBuildId: string; baseUrl: string; fetch?: FetchPort }): SourceRuntimeFactory {
  return { identity: { kind: 'static', sourceId: options.sourceId, expectedBuildId: options.expectedBuildId }, async initialize(signal) {
    try {
      validId(options.sourceId); string(options.expectedBuildId, 'buildId', true);
      const current = pointer(await requestJson(new URL('content/current.json', options.baseUrl).href, { signal, fetch: options.fetch }), options.baseUrl);
      if (current.buildId !== options.expectedBuildId) throw new BootstrapError({ kind: 'version', expectedBuildId: options.expectedBuildId, observedBuildId: current.buildId });
      const data = manifest(await requestJson(current.manifestUrl, { signal, fetch: options.fetch }), options.baseUrl, current.buildId);
      if (signal?.aborted) throw abortError();
      const sourceInstanceId = crypto.randomUUID(), probe = new DeploymentProbe({ sourceInstanceId, buildId: data.buildId, baseUrl: options.baseUrl, fetch: options.fetch });
      return { kind: 'static', sourceId: options.sourceId, sourceInstanceId, buildId: data.buildId, source: new StaticContentSource(options.sourceId, data, probe, options.fetch), deploymentProbe: probe };
    } catch (e) {
      if (isAbort(e) || e instanceof BootstrapError) throw e;
      const detail = contentError(e);
      throw new BootstrapError({ kind: 'request', error: detail.code === 'not-found' || detail.code === 'deployment-changed' ? { code: 'invalid-response', retryable: false } : detail as Extract<import('@blog/contracts').BootstrapFailure, { kind: 'request' }>['error'] });
    }
  } };
}
