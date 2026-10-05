import { abortError, ContentSourceError, isAbort, publicUrl, ValidationError } from '@blog/contracts';
export type FetchPort = typeof fetch;
export async function requestJson(url: string, options: { signal?: AbortSignal; timeoutMs?: number; fetch?: FetchPort; policy?: RequestInit } = {}): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new ContentSourceError('invalid-response');
  if (options.signal?.aborted) throw abortError();
  const abort = new AbortController(); let timedOut = false;
  const cancel = (): void => abort.abort(); options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort.abort(); }, timeoutMs);
  try {
    const response = await (options.fetch ?? fetch)(url, { ...options.policy, credentials: options.policy?.credentials ?? 'omit', method: 'GET', cache: 'no-store', signal: abort.signal });
    if (!response.ok) {
      const s = response.status;
      throw new ContentSourceError(s === 404 ? 'not-found' : s === 401 ? 'unauthorized' : s === 403 ? 'forbidden' : s === 429 || s >= 500 ? 'unavailable' : 'invalid-response');
    }
    try { return await response.json(); } catch (e) { if (isAbort(e)) throw e; throw new ContentSourceError('invalid-response'); }
  } catch (e) {
    if (options.signal?.aborted) throw abortError();
    if (timedOut) throw new ContentSourceError('timeout');
    if (e instanceof ContentSourceError) throw e;
    throw new ContentSourceError('network');
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
}
export function confinedUrl(value: unknown, base: string): string {
  publicUrl(base);
  if (typeof value !== 'string' || !value) throw new ValidationError('artifact.url');
  const url = new URL(value, base), origin = new URL(base);
  if (url.origin !== origin.origin || !url.pathname.startsWith(origin.pathname.endsWith('/') ? origin.pathname : `${origin.pathname}/`) || url.username || url.password || url.search || url.hash) throw new ValidationError('artifact.url');
  return url.href;
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
