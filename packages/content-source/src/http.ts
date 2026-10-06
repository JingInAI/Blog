import { abortError, BootstrapError, ContentSourceError, contentRecord, contentSummary, directoryUrl, freeze, object, publicUrl, siteInfo, string, validateQuery, validId, isAbort } from '@blog/contracts';
import type { ContentSource, ContentQuery, ContentPage, ContentResult, SiteResult, HttpSourceOptions, SourceDiagnostic, SourceRuntimeFactory } from '@blog/contracts';
import { requestJson, requestTimeout } from './request.ts';
import type { FetchPort } from './request.ts';
function validated<T>(fn: () => T): T { try { return fn(); } catch (e) { if (e instanceof ContentSourceError) throw e; throw new ContentSourceError('invalid-response'); } }
function snapshotOptions(options: HttpSourceOptions): HttpSourceOptions {
  return Object.freeze({ ...options, ...(options.endpoints ? { endpoints: Object.freeze({ ...options.endpoints }) } : {}) });
}
export class HttpContentSource implements ContentSource {
  private readonly base: string;
  private readonly options: HttpSourceOptions;
  constructor(options: HttpSourceOptions, private readonly fetchPort?: FetchPort) {
    this.options = options = snapshotOptions(options);
    this.base = validated(() => {
      validId(options.sourceId); const base = directoryUrl(options.baseUrl);
      if (options.resourceBaseUrl !== undefined) publicUrl(options.resourceBaseUrl);
      if (options.resourceBasePriority !== undefined && options.resourceBasePriority !== 'config' && options.resourceBasePriority !== 'response') throw new ContentSourceError('invalid-response');
      return base;
    });
    requestTimeout(options.timeoutMs);
  }
  private request(path: string, signal?: AbortSignal): Promise<unknown> { return requestJson(new URL(path, this.base).href, { signal, fetch: this.fetchPort, timeoutMs: this.options.timeoutMs, policy: this.options.requestPolicy?.() }); }
  async getSite(signal?: AbortSignal): Promise<SiteResult> {
    const raw = await this.request(this.options.endpoints?.site ?? 'site', signal);
    return validated(() => {
      const diagnostics: SourceDiagnostic[] = [], o = object(raw, ['schemaVersion', 'site'], 'response', 'http', diagnostics);
      if (o.schemaVersion !== 1) throw new ContentSourceError('invalid-response');
      const info = siteInfo(o.site, 'http', diagnostics);
      return freeze({ info, diagnostics, source: { kind: 'http', sourceId: this.options.sourceId } });
    });
  }
  async list(query: ContentQuery, signal?: AbortSignal): Promise<ContentPage> {
    const q = validated(() => validateQuery(query));
    if (signal?.aborted) throw abortError();
    if (q.ids?.length === 0) return freeze({ items: [], diagnostics: [] });
    const url = new URL(this.options.endpoints?.list ?? 'contents', this.base);
    for (const key of ['ids', 'cursor', 'limit']) url.searchParams.delete(key);
    if (q.ids) q.ids.forEach(id => url.searchParams.append('ids', id));
    else { url.searchParams.set('limit', String(q.limit)); if (q.cursor !== undefined) url.searchParams.set('cursor', q.cursor); }
    const raw = await this.request(url.href, signal);
    return validated(() => {
      const diagnostics: SourceDiagnostic[] = [], o = object(raw, ['schemaVersion', 'items', 'nextCursor'], 'response', 'http', diagnostics);
      if (o.schemaVersion !== 1 || !Array.isArray(o.items)) throw new ContentSourceError('invalid-response');
      const items = Array.from(o.items, (item, i) => {
        const d: SourceDiagnostic[] = [], result = contentSummary(item, 'http', d);
        diagnostics.push(...d.map(x => ({ ...x, fieldPath: `response.items.${i}.${x.fieldPath.slice(5)}` }))); return result;
      });
      if (new Set(items.map(i => i.id)).size !== items.length || (q.ids ? items.some(i => !q.ids!.includes(i.id)) : items.length > q.limit!)) throw new ContentSourceError('invalid-response');
      const nextCursor = Object.hasOwn(o, 'nextCursor') ? string(o.nextCursor, 'response.nextCursor', true) : undefined;
      if (nextCursor !== undefined && (nextCursor === q.cursor || q.ids)) throw new ContentSourceError('invalid-response');
      return freeze({ items, diagnostics, ...(nextCursor === undefined ? {} : { nextCursor }) });
    });
  }
  async get(id: string, signal?: AbortSignal): Promise<ContentResult> {
    validated(() => validId(id));
    const raw = await this.request(this.options.endpoints?.detail?.(id) ?? `contents/${encodeURIComponent(id)}`, signal);
    return validated(() => {
      const diagnostics: SourceDiagnostic[] = [], o = object(raw, ['schemaVersion', 'item', 'resourceBaseUrl'], 'response', 'http', diagnostics);
      if (o.schemaVersion !== 1) throw new ContentSourceError('invalid-response');
      const item = contentRecord(o.item, 'http', diagnostics); if (item.id !== id) throw new ContentSourceError('invalid-response');
      const responseBase = Object.hasOwn(o, 'resourceBaseUrl') ? publicUrl(o.resourceBaseUrl) : undefined;
      const configBase = this.options.resourceBaseUrl;
      if (responseBase && configBase && responseBase !== configBase && !this.options.resourceBasePriority) throw new ContentSourceError('invalid-response');
      const base = this.options.resourceBasePriority === 'response' ? responseBase ?? configBase : configBase ?? responseBase;
      return freeze({ item, diagnostics, resourceContext: { kind: 'http', sourceId: this.options.sourceId, ...(base === undefined ? {} : { resourceBaseUrl: base }) } });
    });
  }
}
export function createHttpFactory(options: HttpSourceOptions, fetchPort?: FetchPort): SourceRuntimeFactory {
  options = snapshotOptions(options);
  return { identity: Object.freeze({ kind: 'http' as const, sourceId: options.sourceId }), async initialize(signal) {
    try {
      if (signal?.aborted) { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }
      return { kind: 'http', sourceId: options.sourceId, sourceInstanceId: crypto.randomUUID(), source: new HttpContentSource(options, fetchPort) };
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new BootstrapError({ kind: 'request', error: { code: 'invalid-response', retryable: false } });
    }
  } };
}
