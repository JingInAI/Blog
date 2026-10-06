import { freeze, normalizeReaderSelection, readerTags } from '@blog/contracts';
import type { ArticleStructure, ContentRecord, ReaderEvidence, ReaderMatch, ReaderSelection, ReadingBlock, ReadingSection, SafeBody, SafeNode } from '@blog/contracts';
export interface ReadingAstNode {
  type: string; value?: string; depth?: number; children?: ReadingAstNode[];
  position?: { start: { line: number; column: number; offset?: number }; end?: { line: number; column: number; offset?: number } };
}
const terms: Readonly<Record<string, readonly string[]>> = {
  concepts: ['到底是什么', '基本概念', '概念', '定义', '基础', '入门', '简介', '抽象为', 'introduction', 'definition', 'basics'],
  engineering: ['实现', '工具', 'Harness', '代码', '训练', '检索', '更新机制', '参数', '上下文', '记忆', 'Skill'],
  research: ['分类', '结构', '比较', '论文', '研究', '代表工作', '参考资料', '方法', '路线'],
  evaluation: ['验收', '评测', '评估', '验证', '反馈', '奖励', 'Reward', 'Benchmark'],
  parameters: ['参数', '权重', '微调', '训练', 'parameters', 'weights', 'training', 'fine-tuning'], context: ['上下文', 'context'], memory: ['记忆', 'memory'],
  skills: ['Skill', '技能'], harness: ['Harness', '工具', '代码', 'tool'],
  structures: ['结构', '链式', '树式', '图式', 'chain', 'tree', 'graph'], feedback: ['反馈', '验收', '评估', '验证', '奖励', 'Reward', 'Benchmark', 'evaluation', 'feedback'],
  deployment: ['更新时机', '离线', '在线', '混合', '更新频率', '部署']
};
function findTerm(text: string, candidates: readonly string[]): string | undefined {
  return candidates.find(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = /[a-z]/i.test(term) ? `(^|[^a-z])${escaped}(?=$|[^a-z])` : escaped;
    return new RegExp(pattern, 'iu').test(text);
  });
}
function searchable(node: ReadingAstNode): string {
  if (['code', 'html', 'image', 'imageReference', 'definition', 'footnoteReference', 'footnoteDefinition'].includes(node.type)) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  return (node.children ?? []).map(searchable).join(' ');
}
export function structureArticle(record: ContentRecord, root: ReadingAstNode, nodeCounts: readonly number[]): ArticleStructure {
  const children = root.children ?? [], source = record.body.value;
  const lineStarts = [0]; for (let i = 0; i < source.length; i++) if (source[i] === '\n') lineStarts.push(i + 1);
  function lineAt(offset: number): number {
    let low = 0, high = lineStarts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (lineStarts[mid] <= offset) low = mid + 1; else high = mid; }
    return Math.max(1, low);
  }
  const lowSurrogate = (at: number): boolean => /[\uDC00-\uDFFF]/u.test(source[at] ?? '');
  const highSurrogate = (at: number): boolean => /[\uD800-\uDBFF]/u.test(source[at] ?? '');
  type MutableSection = Omit<ReadingSection, 'nodeIndexes' | 'blocks' | 'evidence'> & { nodeIndexes: number[]; blocks: ReadingBlock[]; evidence: ReaderEvidence[]; heading?: ReadingAstNode; sourceNodes: ReadingAstNode[] };
  const sections: MutableSection[] = [], stack: MutableSection[] = [], supportingNodeIndexes: number[] = [];
  let nodeIndex = 0;
  for (const [index, node] of children.entries()) {
    const start = node.position?.start.offset ?? 0, end = node.position?.end?.offset ?? start;
    let section = sections.at(-1);
    if (!section || node.type === 'heading') {
      if (section) { section.endOffset = start; section.endLine = lineAt(Math.max(section.startOffset, start - 1)); }
      const level = node.type === 'heading' ? node.depth ?? 1 : 0;
      while (stack.length && stack.at(-1)!.level >= level) stack.pop();
      section = { id: `reader-${encodeURIComponent(record.id).replace(/-/g, '%2D')}-${sections.length}`, level,
        ...(node.type === 'heading' ? { title: searchable(node), heading: node } : {}),
        ...(stack.length ? { parentId: stack.at(-1)!.id } : {}), startOffset: sections.length ? start : 0, endOffset: source.length,
        startLine: sections.length ? node.position?.start.line ?? 1 : 1, endLine: lineAt(source.length),
        nodeIndexes: [], blocks: [], evidence: [], sourceNodes: [] };
      sections.push(section); stack.push(section);
    }
    const indexes = Array.from({ length: nodeCounts[index] ?? 0 }, (_, offset) => nodeIndex + offset); nodeIndex += nodeCounts[index] ?? 0;
    section.blocks.push({ kind: node.type, startOffset: start, endOffset: end, startLine: node.position?.start.line ?? 1, endLine: node.position?.end?.line ?? 1, nodeIndexes: indexes });
    section.nodeIndexes.push(...indexes); section.sourceNodes.push(node);
    if (node.type === 'footnoteDefinition') supportingNodeIndexes.push(...indexes);
  }
  for (const section of sections) {
    const headingText = section.heading ? searchable(section.heading) : '';
    const directedInterests = readerTags.filter(tag => tag.group === '兴趣方向' && findTerm(headingText, terms[tag.id]));
    for (const tag of readerTags) {
      const headingTerm = findTerm(headingText, terms[tag.id]);
      if (tag.group === '兴趣方向' && directedInterests.length && !headingTerm) continue;
      const node = headingTerm ? section.heading : section.sourceNodes.find(node => node.type !== 'heading' && findTerm(searchable(node), terms[tag.id]));
      const term = headingTerm ?? (node ? findTerm(searchable(node), terms[tag.id]) : undefined);
      if (!node || !term) continue;
      function matchingLeaf(candidate: ReadingAstNode): ReadingAstNode | undefined {
        if (!searchable(candidate)) return;
        if ((candidate.type === 'text' || candidate.type === 'inlineCode') && findTerm(searchable(candidate), [term!])) return candidate;
        for (const child of candidate.children ?? []) { const leaf = matchingLeaf(child); if (leaf) return leaf; }
      }
      const sourceNode = matchingLeaf(node) ?? node;
      const start = sourceNode.position?.start.offset ?? section.startOffset, end = sourceNode.position?.end?.offset ?? start;
      // Quote exact source text; formatting is displayed as text, never reinterpreted as HTML.
      const raw = source.slice(start, end);
      const encodedTerm = [...term].map(char => {
        const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), code = char.codePointAt(0)!;
        return `(?:${escaped}|\\\\${escaped}|&#0*${code};|&#x0*${code.toString(16)};)`;
      }).join('');
      const at = new RegExp(encodedTerm, 'iu').exec(raw)?.index ?? -1;
      let quoteStart = at < 0 ? start : start + Math.max(0, at - 45), quoteEnd = Math.min(end, quoteStart + 180);
      if (lowSurrogate(quoteStart) && highSurrogate(quoteStart - 1)) quoteStart--;
      if (highSurrogate(quoteEnd - 1) && lowSurrogate(quoteEnd)) quoteEnd++;
      section.evidence.push({ tagId: tag.id, field: headingTerm ? 'heading' : 'body', term, quote: source.slice(quoteStart, quoteEnd), startOffset: quoteStart, endOffset: quoteEnd,
        startLine: lineAt(quoteStart), endLine: lineAt(Math.max(quoteStart, quoteEnd - 1)) });
    }
  }
  return freeze({ schemaVersion: 1, ruleVersion: 1, contentId: record.id, sourceLength: source.length, supportingNodeIndexes,
    sections: sections.map(({ heading: _heading, sourceNodes: _sourceNodes, ...section }) => section) });
}
export function selectReadingSections(structure: ArticleStructure, selection: ReaderSelection): ReaderMatch {
  const selected = normalizeReaderSelection(selection);
  const groups = ['阅读目标', '兴趣方向'].map(group => selected.tagIds.filter(id => readerTags.find(tag => tag.id === id)?.group === group)).filter(ids => ids.length);
  const matched = groups.length ? structure.sections.filter(section => groups.every(ids => ids.some(id => section.evidence.some(evidence => evidence.tagId === id)))) : [];
  const included = new Set(matched.map(section => section.id)), context = new Set<string>();
  for (const section of matched) {
    let parentId = section.parentId;
    while (parentId && !included.has(parentId)) {
      const parent = structure.sections.find(candidate => candidate.id === parentId); if (!parent) break;
      context.add(parent.id); included.add(parent.id); parentId = parent.parentId;
    }
  }
  const supporting = new Set(structure.supportingNodeIndexes);
  const nodeIndexes = [...new Set(structure.sections.filter(section => included.has(section.id)).flatMap(section => section.nodeIndexes))].filter(index => !supporting.has(index)).sort((a, b) => a - b);
  return freeze({ matchedSectionIds: matched.map(section => section.id), contextSectionIds: structure.sections.filter(section => context.has(section.id)).map(section => section.id), nodeIndexes });
}
export function retainReadingReferences(body: SafeBody, match: ReaderMatch): ReaderMatch {
  const indexes = new Set(match.nodeIndexes), needed = new Set<string>();
  function collect(node: SafeNode): void {
    if (node.type !== 'element') return;
    if (node.props.href?.startsWith('#fn-')) needed.add(node.props.href.slice(1));
    node.children.forEach(collect);
  }
  for (const index of indexes) collect(body.nodes[index]);
  // Definitions may themselves reference other notes; a finite set prevents cycles.
  let changed = true;
  while (changed) {
    changed = false;
    for (const index of body.structure.supportingNodeIndexes) {
      if (indexes.has(index)) continue;
      const node = body.nodes[index];
      if (node.type === 'element' && node.props.id && needed.has(node.props.id.replace(/-definition-\d+$/, ''))) {
        indexes.add(index); collect(node); changed = true;
      }
    }
  }
  return freeze({ ...match, nodeIndexes: [...indexes].sort((a, b) => a - b) });
}
