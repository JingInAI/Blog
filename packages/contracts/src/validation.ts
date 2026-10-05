import type { ContentRecord, ContentSummary, SiteInfo, SourceDiagnostic, JsonValue, ContentQuery } from './types.ts';
import { ValidationError } from './errors.ts';
export type ValidationMode = 'static' | 'http';
export function object(value: unknown, keys: readonly string[], path: string, mode: ValidationMode = 'static', diagnostics: SourceDiagnostic[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new ValidationError(path);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      if (mode === 'static') throw new ValidationError(`${path}.${key}`, 'unknown-field');
      diagnostics.push({ code: 'unknown-api-field', fieldPath: `${path}.${key}` });
    }
  }
  return value as Record<string, unknown>;
}
export function string(value: unknown, path: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) throw new ValidationError(path);
  return value;
}
export function validId(value: unknown, path = 'id'): string {
  const id = string(value, path, true);
  if ([...id].length > 128 || /[\p{Cc}/\\]/u.test(id) || id === '.' || id === '..' || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(id)) throw new ValidationError(path);
  return id;
}
export function compareIds(a: string, b: string): number {
  const x = [...a], y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!; if (d) return d;
  }
  return x.length - y.length;
}
export function validateDate(value: unknown, path: string): string {
  const s = string(value, path);
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(s);
  if (!m) throw new ValidationError(path);
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 60 || (m[8] && Number(m[8]) > 23) || (m[9] && Number(m[9]) > 59)) throw new ValidationError(path);
  return s;
}
export function siteInfo(value: unknown, mode: ValidationMode = 'static', diagnostics: SourceDiagnostic[] = []): SiteInfo {
  const o = object(value, ['schemaVersion', 'title', 'description', 'author', 'language'], 'site', mode, diagnostics);
  if (o.schemaVersion !== 1) throw new ValidationError('site.schemaVersion');
  const result: SiteInfo = { schemaVersion: 1 };
  for (const key of ['title', 'description', 'author', 'language'] as const) if (Object.hasOwn(o, key)) result[key] = string(o[key], `site.${key}`);
  return result;
}
const summaryKeys = ['schemaVersion', 'id', 'publication', 'title', 'summary', 'author', 'publishedAt', 'tags'];
function metadata(o: Record<string, unknown>, mode: ValidationMode, diagnostics: SourceDiagnostic[]): ContentSummary | Omit<ContentRecord, 'body' | 'assets'> {
  if (o.schemaVersion !== 1) throw new ValidationError('item.schemaVersion');
  if (o.publication !== 'published' && o.publication !== 'draft') throw new ValidationError('item.publication');
  if (mode === 'http' && o.publication !== 'published') throw new ValidationError('item.publication');
  const result: Omit<ContentRecord, 'body' | 'assets'> = { schemaVersion: 1, id: validId(o.id), publication: o.publication, title: string(o.title, 'item.title', true) };
  for (const key of ['summary', 'author'] as const) if (Object.hasOwn(o, key)) result[key] = string(o[key], `item.${key}`);
  if (Object.hasOwn(o, 'publishedAt')) result.publishedAt = validateDate(o.publishedAt, 'item.publishedAt');
  if (Object.hasOwn(o, 'tags')) {
    if (!Array.isArray(o.tags)) throw new ValidationError('item.tags');
    result.tags = o.tags.map((v, i) => string(v, `item.tags.${i}`));
  }
  void diagnostics;
  return result;
}
export function contentSummary(value: unknown, mode: ValidationMode = 'http', diagnostics: SourceDiagnostic[] = []): ContentSummary {
  const o = object(value, summaryKeys, 'item', mode, diagnostics);
  const result = metadata(o, mode, diagnostics);
  if (result.publication !== 'published') throw new ValidationError('item.publication');
  return result as ContentSummary;
}
export function contentRecord(value: unknown, mode: ValidationMode = 'static', diagnostics: SourceDiagnostic[] = []): ContentRecord {
  const o = object(value, [...summaryKeys, 'body', 'assets'], 'item', mode, diagnostics);
  const b = object(o.body, ['format', 'value'], 'item.body', mode, diagnostics);
  if (b.format !== 'markdown') throw new ValidationError('item.body.format');
  const result: ContentRecord = { ...metadata(o, mode, diagnostics), body: { format: 'markdown', value: string(b.value, 'item.body.value') } };
  if (Object.hasOwn(o, 'assets')) {
    if (!Array.isArray(o.assets)) throw new ValidationError('item.assets');
    const ids = new Set<string>();
    result.assets = o.assets.map((asset, i) => {
      const path = `item.assets.${i}`, a = object(asset, ['id', 'url', 'decorative', 'alt'], path, mode, diagnostics);
      const id = validId(a.id, `${path}.id`); if (ids.has(id)) throw new ValidationError(`${path}.id`); ids.add(id);
      const url = string(a.url, `${path}.url`, true);
      if (typeof a.decorative !== 'boolean') throw new ValidationError(`${path}.decorative`);
      const alt = Object.hasOwn(a, 'alt') ? string(a.alt, `${path}.alt`) : undefined;
      if (a.decorative ? alt !== undefined && alt !== '' : alt === undefined || !alt.trim()) throw new ValidationError(`${path}.alt`);
      return { id, url, decorative: a.decorative, ...(alt === undefined ? {} : { alt }) };
    });
  }
  return result;
}
export function toSummary(record: ContentRecord): ContentSummary {
  if (record.publication !== 'published') throw new ValidationError('item.publication');
  const { body: _body, assets: _assets, ...rest } = record; return rest as ContentSummary;
}
export function assertJson(value: unknown, path = 'json', seen = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || !value || seen.has(value)) throw new ValidationError(path);
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw new ValidationError(path);
  if (Object.getOwnPropertySymbols(value).length) throw new ValidationError(path);
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (Array.isArray(value) && (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) throw new ValidationError(path);
    const d = Object.getOwnPropertyDescriptor(value, key)!;
    if (!d.enumerable || d.get || d.set) throw new ValidationError(path);
  }
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) assertJson(value[i], `${path}.${i}`, seen); }
  else for (const [k, v] of Object.entries(value)) assertJson(v, `${path}.${k}`, seen);
  seen.delete(value);
}
export function semanticEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => semanticEqual(v, b[i]));
  const x = Object.keys(a), y = Object.keys(b);
  return x.length === y.length && x.every(k => Object.hasOwn(b, k) && semanticEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}
export function validateQuery(query: ContentQuery): ContentQuery {
  object(query, ['ids', 'cursor', 'limit'], 'query');
  if (query.ids !== undefined) {
    if (!Array.isArray(query.ids) || query.cursor !== undefined || query.limit !== undefined) throw new ValidationError('query');
    const ids = query.ids.map(id => validId(id)); if (new Set(ids).size !== ids.length) throw new ValidationError('query.ids'); return { ids };
  }
  if (query.cursor !== undefined) string(query.cursor, 'query.cursor', true);
  const limit = query.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ValidationError('query.limit');
  return { ...(query.cursor === undefined ? {} : { cursor: query.cursor }), limit };
}
export function publicUrl(value: unknown, path = 'url'): string {
  const raw = string(value, path, true); let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError(path); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ValidationError(path);
  return raw;
}
