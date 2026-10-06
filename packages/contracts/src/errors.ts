import type { BodyError, BootstrapFailure, ContentError, ContentErrorCode, StorageErrorCode } from './types.ts';
export class ValidationError extends Error {
  constructor(readonly fieldPath: string, readonly code = 'invalid-value') {
    super(`${code}: ${fieldPath}`); this.name = 'ValidationError';
  }
}
export class ContentSourceError extends Error {
  readonly detail: ContentError;
  constructor(code: ContentErrorCode) {
    super(code); this.name = 'ContentSourceError';
    this.detail = { code, retryable: ['network', 'timeout', 'unavailable'].includes(code) };
  }
}
export class BootstrapError extends Error {
  constructor(readonly failure: BootstrapFailure) { super('bootstrap-failed'); this.name = 'BootstrapError'; }
}
export class BodyProcessError extends Error {
  readonly detail: BodyError;
  constructor(code: BodyError['code']) { super(code); this.name = 'BodyProcessError'; this.detail = { code, retryable: false }; }
}
export class StorageError extends Error {
  constructor(readonly code: StorageErrorCode) { super(code); this.name = 'StorageError'; }
}
export class UrlUpdateError extends Error { constructor() { super('url-update-failed'); this.name = 'UrlUpdateError'; } }
export function abortError(): Error { const e = new Error('Aborted'); e.name = 'AbortError'; return e; }
export function isAbort(e: unknown): boolean { return e instanceof Error && e.name === 'AbortError'; }
export function contentError(e: unknown): ContentError { return e instanceof ContentSourceError ? e.detail : { code: 'invalid-response', retryable: false }; }
