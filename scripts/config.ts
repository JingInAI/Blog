import { readFile } from 'node:fs/promises';
import { object, publicUrl, string, validId, ValidationError } from '@blog/contracts';
import type { AppConfig } from '@blog/contracts';
export function basePath(raw: string): string {
  if (!raw.startsWith('/') || !raw.endsWith('/') || raw.includes('\\') || /[?#]/.test(raw)) throw new ValidationError('config.basePath');
  const decoded = decodeURIComponent(raw);
  if (decoded.split('/').some(part => part === '.' || part === '..') || raw.includes('//')) throw new ValidationError('config.basePath');
  return raw;
}
export async function loadConfig(path = 'blog.config.json'): Promise<AppConfig> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  const o = object(raw, ['schemaVersion', 'siteId', 'source', 'basePath', 'authorDefault'], 'config');
  if (o.schemaVersion !== 1) throw new ValidationError('config.schemaVersion');
  validId(o.siteId, 'config.siteId');
  const s = object(o.source, ['kind', 'sourceId', 'baseUrl', 'resourceBaseUrl', 'resourceBasePriority', 'timeoutMs'], 'config.source');
  validId(s.sourceId, 'config.source.sourceId');
  if (s.kind !== 'static' && s.kind !== 'http') throw new ValidationError('config.source.kind');
  if (s.kind === 'static' && Object.keys(s).some(k => !['kind', 'sourceId'].includes(k))) throw new ValidationError('config.source');
  if (s.kind === 'http') {
    publicUrl(s.baseUrl, 'config.source.baseUrl');
    if (s.resourceBaseUrl !== undefined) publicUrl(s.resourceBaseUrl, 'config.source.resourceBaseUrl');
    if (s.resourceBasePriority !== undefined && s.resourceBasePriority !== 'config' && s.resourceBasePriority !== 'response') throw new ValidationError('config.source.resourceBasePriority');
    if (s.timeoutMs !== undefined && (!Number.isInteger(s.timeoutMs) || Number(s.timeoutMs) < 1000 || Number(s.timeoutMs) > 120000)) throw new ValidationError('config.source.timeoutMs');
  }
  basePath(string(o.basePath, 'config.basePath'));
  return o as unknown as AppConfig;
}
