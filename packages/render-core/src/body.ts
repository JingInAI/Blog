import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { BodyProcessError, freeze, publicUrl } from '@blog/contracts';
import type { BodyProcessResult, ContentRecord, ResourceContext, SafeNode, SafeTag, SafeBody, BodyDiagnostic } from '@blog/contracts';
interface MdNode {
  type: string; children?: MdNode[]; value?: string; url?: string; alt?: string; title?: string | null;
  identifier?: string; label?: string; depth?: number; ordered?: boolean; start?: number | null;
  checked?: boolean | null; align?: ('left' | 'center' | 'right' | null)[];
  position?: { start: { line: number; column: number } };
}
const parser = unified().use(remarkParse).use(remarkGfm);
const parse = (record: ContentRecord): MdNode => parser.parse(record.body.value) as unknown as MdNode;
function definitions(root: MdNode): Map<string, MdNode> {
  const map = new Map<string, MdNode>();
  const visit = (n: MdNode): void => { if (n.type === 'definition' && !map.has(n.identifier!)) map.set(n.identifier!, n); n.children?.forEach(visit); };
  visit(root); return map;
}
function authoredReference(record: ContentRecord, raw: string): string {
  if (!raw.startsWith('asset:')) return raw;
  const asset = record.assets?.find(a => a.id === raw.slice(6));
  if (!asset) throw new BodyProcessError('unresolved-resource');
  return asset.url;
}
export function collectResourceReferences(record: ContentRecord): string[] {
  const root = parse(record), defs = definitions(root), refs = new Set<string>();
  const visit = (n: MdNode): void => {
    if (['image', 'link', 'imageReference', 'linkReference'].includes(n.type)) {
      const def = n.type.endsWith('Reference') ? defs.get(n.identifier!) : n;
      if (def?.url === undefined) throw new BodyProcessError('unsupported-content');
      const raw = authoredReference(record, def.url);
      const image = n.type === 'image' || n.type === 'imageReference';
      if (raw === '' && image) throw new BodyProcessError('unresolved-resource');
      // Absolute link schemes are checked by the body converter; unsafe links become text.
      // Image URLs still pass through the stricter publishing validation.
      if (raw !== '' && !raw.startsWith('#') && !/^(?:https?:|mailto:)/i.test(raw) && (image || !/^[a-z][a-z\d+.-]*:/i.test(raw))) refs.add(raw);
    }
    n.children?.forEach(visit);
  };
  visit(root); return [...refs];
}
export function processBody(record: ContentRecord, context: ResourceContext): BodyProcessResult {
  const root = parse(record), defs = definitions(root), resources: { key: string; url: string }[] = [], diagnostics: BodyDiagnostic[] = [];
  let imageIndex = 0;
  const footnoteDefinitions = new Map<string, number>();
  const footnoteId = (identifier: string): string => `fn-${encodeURIComponent(record.id).replace(/-/g, '%2D')}-${encodeURIComponent(identifier).replace(/-/g, '%2D')}`;
  const text = (value: string): SafeNode => ({ type: 'text', value });
  const element = (tag: SafeTag, children: SafeNode[] = [], props: Extract<SafeNode, { type: 'element' }>['props'] = {}): SafeNode => ({ type: 'element', tag, props, children });
  const diag = (code: BodyDiagnostic['code'], n: MdNode): void => { diagnostics.push({ code, ...(n.position ? { sourcePosition: n.position.start } : {}) }); };
  function resolve(raw: string, image: boolean): string {
    const ref = authoredReference(record, raw);
    if (ref === '') { if (image) throw new BodyProcessError('unresolved-resource'); return ''; }
    if (!image && (ref.startsWith('#') || /^mailto:/i.test(ref))) return ref;
    if (/^[a-z][a-z\d+.-]*:/i.test(ref)) {
      try { return publicUrl(ref); } catch { throw new BodyProcessError('unsafe-resource'); }
    }
    if (context.kind === 'static') {
      if (!Object.hasOwn(context.assetsByReference, ref)) throw new BodyProcessError('unresolved-resource');
      try { return publicUrl(context.assetsByReference[ref].publishedUrl); } catch { throw new BodyProcessError('unsafe-resource'); }
    }
    if (!context.resourceBaseUrl) throw new BodyProcessError('unresolved-resource');
    try { return publicUrl(new URL(ref, publicUrl(context.resourceBaseUrl)).href); } catch { throw new BodyProcessError('unsafe-resource'); }
  }
  function convert(n: MdNode): SafeNode[] {
    const kids = (): SafeNode[] => (n.children ?? []).flatMap(convert);
    switch (n.type) {
      case 'root': return kids();
      case 'text': return [text(n.value ?? '')];
      case 'paragraph': return [element('p', kids())];
      case 'heading': return [element(`h${n.depth}` as SafeTag, kids())];
      case 'emphasis': return [element('em', kids())];
      case 'strong': return [element('strong', kids())];
      case 'delete': return [element('del', kids())];
      case 'inlineCode': return [element('code', [text(n.value ?? '')])];
      case 'code': return [element('pre', [element('code', [text(n.value ?? '')])])];
      case 'break': return [element('br')];
      case 'thematicBreak': return [element('hr')];
      case 'blockquote': return [element('blockquote', kids())];
      case 'list': return [element(n.ordered ? 'ol' : 'ul', kids(), n.ordered && n.start != null ? { start: n.start } : {})];
      case 'listItem': return [element('li', [...(typeof n.checked === 'boolean' ? [element('input', [], { type: 'checkbox', checked: n.checked, disabled: true })] : []), ...kids()])];
      case 'definition': return [];
      case 'html': diag('raw-html-as-text', n); return [text(n.value ?? '')];
      case 'link': case 'linkReference': {
        const def = n.type === 'linkReference' ? defs.get(n.identifier!) : n;
        if (def?.url === undefined) throw new BodyProcessError('unsupported-content');
        let href: string;
        try { href = resolve(def.url, false); } catch (e) {
          if (e instanceof BodyProcessError && e.detail.code === 'unsafe-resource') { diag('unsafe-link-as-text', n); return kids(); }
          throw e;
        }
        return [element('a', kids(), { href, ...(def.title == null ? {} : { title: def.title }) })];
      }
      case 'image': case 'imageReference': {
        const def = n.type === 'imageReference' ? defs.get(n.identifier!) : n;
        if (def?.url === undefined) throw new BodyProcessError('unsupported-content');
        const alt = n.alt ?? '';
        if (def.url.startsWith('asset:')) {
          const asset = record.assets?.find(a => a.id === def.url!.slice(6));
          if (!asset) throw new BodyProcessError('unresolved-resource');
          if (asset.decorative ? alt !== '' || (asset.alt ?? '') !== '' : !alt.trim() || alt !== asset.alt) throw new BodyProcessError('invalid-image-description');
        } else if (!alt.trim()) throw new BodyProcessError('invalid-image-description');
        const url = resolve(def.url, true), key = `image-${imageIndex++}`;
        resources.push({ key, url });
        return [{ type: 'image', resourceKey: key, alt, ...(def.title == null ? {} : { title: def.title }) }];
      }
      case 'table': {
        const rows = n.children ?? [];
        const row = (r: MdNode, header: boolean): SafeNode => element('tr', (r.children ?? []).map((c, i) => element(header ? 'th' : 'td', (c.children ?? []).flatMap(convert), n.align?.[i] ? { align: n.align[i]! } : {})));
        return [element('table', [element('thead', rows[0] ? [row(rows[0], true)] : []), element('tbody', rows.slice(1).map(r => row(r, false)))])];
      }
      case 'footnoteReference': return [element('sup', [element('a', [text(n.label ?? n.identifier ?? '')], { href: '#' + footnoteId(n.identifier!) })])];
      case 'footnoteDefinition': {
        const occurrence = (footnoteDefinitions.get(n.identifier!) ?? 0) + 1; footnoteDefinitions.set(n.identifier!, occurrence);
        return [element('section', kids(), { id: footnoteId(n.identifier!) + (occurrence === 1 ? '' : `-definition-${occurrence}`) })];
      }
      default: throw new BodyProcessError('unsupported-content');
    }
  }
  try { return freeze({ body: { nodes: convert(root) } as unknown as SafeBody, resources, diagnostics }); }
  catch (e) { if (e instanceof BodyProcessError) throw e; throw new BodyProcessError('conversion-failed'); }
}
