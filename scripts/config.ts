import { readFile } from 'node:fs/promises';
import { decodeUtf8, directoryUrl, object, parseJson, publicUrl, string, validId, ValidationError } from '@blog/contracts';
import type { AppConfig } from '@blog/contracts';
export function basePath(raw: string): string {
  if (!raw.startsWith('/') || !raw.endsWith('/') || raw.includes('\\') || /[?#]/.test(raw)) throw new ValidationError('config.basePath');
  try {
    const parts = raw.split('/').map(part => decodeURIComponent(part));
    if (raw.includes('//') || parts.some(part => part === '.' || part === '..' || /[/\\\p{Cc}]/u.test(part)) || new URL(raw, 'https://base.invalid').pathname !== raw) throw new ValidationError('config.basePath');
  } catch { throw new ValidationError('config.basePath'); }
  return raw;
}
export async function loadConfig(path = 'blog.config.json'): Promise<AppConfig> {
  const raw: unknown = parseJson(decodeUtf8(await readFile(path), path));
  const o = object(raw, ['schemaVersion', 'siteId', 'source', 'basePath', 'authorDefault'], 'config');
  if (o.schemaVersion !== 1) throw new ValidationError('config.schemaVersion');
  validId(o.siteId, 'config.siteId');
  const s = object(o.source, ['kind', 'sourceId', 'baseUrl', 'resourceBaseUrl', 'resourceBasePriority', 'timeoutMs'], 'config.source');
  validId(s.sourceId, 'config.source.sourceId');
  if (s.kind !== 'static' && s.kind !== 'http') throw new ValidationError('config.source.kind');
  if (s.kind === 'static' && Object.keys(s).some(k => !['kind', 'sourceId'].includes(k))) throw new ValidationError('config.source');
  if (s.kind === 'http') {
    directoryUrl(s.baseUrl, 'config.source.baseUrl');
    if (s.resourceBaseUrl !== undefined) publicUrl(s.resourceBaseUrl, 'config.source.resourceBaseUrl');
    if (s.resourceBasePriority !== undefined && s.resourceBasePriority !== 'config' && s.resourceBasePriority !== 'response') throw new ValidationError('config.source.resourceBasePriority');
    if (s.timeoutMs !== undefined && (!Number.isInteger(s.timeoutMs) || Number(s.timeoutMs) < 1000 || Number(s.timeoutMs) > 120000)) throw new ValidationError('config.source.timeoutMs');
  }
  basePath(string(o.basePath, 'config.basePath'));
  return o as unknown as AppConfig;
}
