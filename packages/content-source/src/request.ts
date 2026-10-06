import { abortError, ContentSourceError, decodeUtf8, directoryUrl, isAbort, parseJson, publicUrl, validId, ValidationError } from '@blog/contracts';
export type FetchPort = typeof fetch;
export function requestTimeout(value: unknown): number {
  const timeoutMs = value === undefined ? 15000 : value;
  if (typeof timeoutMs !== 'number' || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new ContentSourceError('invalid-response');
  return timeoutMs;
}
export async function requestJson(url: string, options: { signal?: AbortSignal; timeoutMs?: number; fetch?: FetchPort; policy?: RequestInit } = {}): Promise<unknown> {
  const timeoutMs = requestTimeout(options.timeoutMs);
  if (options.signal?.aborted) throw abortError();
  const abort = new AbortController(); let timedOut = false; let response: Response | undefined;
  const cancel = (): void => abort.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeoutMs);
  const checkCancellation = (): void => {
    if (options.signal?.aborted) throw abortError();
    if (timedOut) throw new ContentSourceError('timeout');
  };
  try {
    response = await (options.fetch ?? fetch)(url, { ...options.policy, credentials: options.policy?.credentials ?? 'omit', method: 'GET', cache: 'no-store', signal: abort.signal });
    checkCancellation();
    if (!response.ok) {
      const s = response.status;
      throw new ContentSourceError(s === 404 ? 'not-found' : s === 401 ? 'unauthorized' : s === 403 ? 'forbidden' : s === 429 || s >= 500 ? 'unavailable' : 'invalid-response');
    }
    let value: unknown;
    try {
      const bytes = await response.arrayBuffer(); checkCancellation();
      value = parseJson(decodeUtf8(new Uint8Array(bytes)).replace(/^\uFEFF/, ''));
    } catch (e) { if (isAbort(e)) throw e; throw new ContentSourceError('invalid-response'); }
    checkCancellation(); return value;
  } catch (e) {
    if (options.signal?.aborted) throw abortError();
    if (timedOut) throw new ContentSourceError('timeout');
    if (e instanceof ContentSourceError) throw e;
    throw new ContentSourceError('network');
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
    // Error statuses and late cancelled responses skip arrayBuffer(); release their bodies.
    // Cleanup cannot replace the request error or wait on an injected transport.
    try { if (response?.body && !response.bodyUsed) void response.body.cancel().catch(() => {}); } catch { /* Best-effort transport cleanup. */ }
  }
}
export function confinedUrl(value: unknown, base: string): string {
  publicUrl(base);
  if (typeof value !== 'string' || !value || /[\\?#\p{Cc}]/u.test(value)) throw new ValidationError('artifact.url');
  const url = new URL(value, base), origin = new URL(base);
  if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname.endsWith('/') ? origin.pathname : `${origin.pathname}/`) || url.username || url.password || url.search || url.hash) throw new ValidationError('artifact.url');
  try {
    for (const part of url.pathname.split('/')) if (/[/\\\p{Cc}]/u.test(decodeURIComponent(part))) throw new Error('ambiguous-path');
  } catch { throw new ValidationError('artifact.url'); }
  return url.href;
}
export function versionBaseUrl(base: string, buildId: string): string {
  validId(buildId, 'buildId');
  return new URL(`content/${encodeURIComponent(buildId)}/`, directoryUrl(base)).href;
}
export function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cancel = (): void => { cleanup(); reject(abortError()); };
    const cleanup = (): void => signal?.removeEventListener('abort', cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    promise.then(v => { cleanup(); resolve(v); }, e => { cleanup(); reject(e); });
  });
}
