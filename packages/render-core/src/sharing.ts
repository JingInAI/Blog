import { object, publicUrl, validId, ValidationError, semanticEqual } from '@blog/contracts';
import type { DisplayConfig, RouteTarget, ShareInputState } from '@blog/contracts';
import { normalizeConfig, themeRegistry } from '@blog/theme-contracts';
export const SHARE_LIMIT = 8192;
export class ShareProtocolError extends Error {
  constructor(readonly code: 'malformed' | 'too-large' | 'source-mismatch' | 'invalid-config' | 'url-unavailable') { super(code); }
}
export interface ParsedShare { state: ShareInputState; config?: DisplayConfig; identity: unknown; }
export function shareParts(search: string): { raw: string; name: string | undefined; value: string }[] {
  return search.replace(/^\?/, '').split('&').filter(Boolean).map(raw => {
    const at = raw.indexOf('='); const name = at < 0 ? raw : raw.slice(0, at), value = at < 0 ? '' : raw.slice(at + 1);
    let decoded: string | undefined;
    try { decoded = decodeURIComponent(name); } catch { decoded = undefined; }
    return { raw, name: decoded, value };
  });
}
export function parseShare(search: string, sourceId: string, framework: string, registry = themeRegistry): ParsedShare {
  let matching: ReturnType<typeof shareParts>;
  try { matching = shareParts(search).filter(p => p.name === 'share'); }
  catch { return { state: { status: 'invalid', code: 'malformed' }, identity: ['malformed-name', search] }; }
  if (!matching.length) return { state: { status: 'absent' }, identity: 'absent' };
  const invalid = (code: Extract<ShareInputState, { status: 'invalid' }>['code']): ParsedShare => ({ state: { status: 'invalid', code }, identity: matching.map(p => p.raw) });
  if (matching.length !== 1 || !matching[0].value) return invalid('malformed');
  let json: string;
  try { json = decodeURIComponent(matching[0].value); } catch { return invalid('malformed'); }
  if (new TextEncoder().encode(json).length > SHARE_LIMIT) return invalid('too-large');
  let raw: unknown; try { raw = JSON.parse(json); } catch { return invalid('malformed'); }
  try {
    const envelope = object(raw, ['sourceId', 'config'], 'share'); validId(envelope.sourceId, 'share.sourceId');
    if (envelope.sourceId !== sourceId) return invalid('source-mismatch');
    const config = normalizeConfig(envelope.config, framework, registry);
    if (new TextEncoder().encode(JSON.stringify({ sourceId, config })).length > SHARE_LIMIT) return invalid('too-large');
    return { state: { status: 'valid' }, config, identity: { sourceId, config } };
  } catch { return invalid('invalid-config'); }
}
export function routeHash(target: RouteTarget): string { return target.kind === 'home' ? '#/' : `#/content/${encodeURIComponent(validId(target.id))}`; }
export function parseRoute(hash: string): RouteTarget {
  if (hash === '' || hash === '#' || hash === '#/') return { kind: 'home' };
  const m = /^#\/content\/([^/]+)$/.exec(hash);
  if (!m) throw new ValidationError('route');
  let id: string; try { id = decodeURIComponent(m[1]); } catch { throw new ValidationError('route'); }
  return { kind: 'detail', id: validId(id) };
}
export function createShareUrl(base: string, sourceId: string, config: DisplayConfig, target: RouteTarget, framework: string, registry = themeRegistry): string {
  let url: URL;
  try { publicUrl(base); url = new URL(base); if (url.search || url.hash) throw new Error('invalid-base'); } catch { throw new ShareProtocolError('url-unavailable'); }
  let normalized: DisplayConfig;
  try { validId(sourceId); normalized = normalizeConfig(config, framework, registry); } catch { throw new ShareProtocolError('invalid-config'); }
  const json = JSON.stringify({ sourceId, config: normalized });
  if (new TextEncoder().encode(json).length > SHARE_LIMIT) throw new ShareProtocolError('too-large');
  return `${url.href}?share=${encodeURIComponent(json)}${routeHash(target)}`;
}
export function sameShare(a: ParsedShare, b: ParsedShare): boolean { return a.state.status === b.state.status && semanticEqual(a.identity, b.identity); }
