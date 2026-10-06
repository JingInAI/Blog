import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import { defaultReaderSelection, normalizeReaderSelection, readerTags, ContentSourceError, toSummary } from '@blog/contracts';
import type { DisplayConfig, ReaderSelection, ViewModel } from '@blog/contracts';
import { processBody, selectReadingSections, retainReadingReferences } from '@blog/render-core';
import { normalizeConfig } from '@blog/theme-contracts';
import { analyzeContent, writeAnalysis } from '../scripts/analyze-content.ts';
import { record, config, result, controller, factory, source, until, memoryStorage, deferred, shareSearch } from './support.ts';
import { readerBody } from './reader-body-fixture.ts';
const selection = (tagIds: string[], overrides: Partial<ReaderSelection> = {}): ReaderSelection => ({ ...defaultReaderSelection(), tagIds, ...overrides });
const parsed = (body = readerBody) => processBody(record('编号%+😀', body), { kind: 'http', sourceId: 'test', resourceBaseUrl: 'https://api.test/' });
const pageReady = (model: ViewModel) => model.kind === 'page' && model.reader.status === 'ready';
const current = (model: ViewModel): DisplayConfig => { assert.equal(model.kind, 'page'); return (model as Extract<ViewModel, { kind: 'page' }>).page.config; };

test('Reader structure preserves source, disjoint offsets, hierarchy and original node positions', () => {
  const content = record('编号%+😀', readerBody), before = JSON.stringify(content), output = processBody(content, result(content).resourceContext);
  assert.equal(JSON.stringify(content), before); assert.deepEqual(output, processBody(content, result(content).resourceContext));
  const sections = output.body.structure.sections;
  assert.equal(sections[0].startOffset, 0); assert.equal(sections.at(-1)!.endOffset, readerBody.length);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]; if (i) assert.equal(sections[i - 1].endOffset, section.startOffset);
    assert.ok(section.endLine >= section.startLine);
    for (const evidence of section.evidence) assert.equal(evidence.quote, readerBody.slice(evidence.startOffset, evidence.endOffset));
  }
  const child = sections.find(section => section.title === '微调实现')!;
  assert.equal(child.parentId, sections.find(section => section.title === '参数与训练')!.id);
  assert.deepEqual(sections.flatMap(section => section.nodeIndexes), output.body.nodes.map((_, i) => i));
  assert.ok(Object.isFrozen(output.body.structure.sections));
  const preamble = parsed('作者开篇说明。\n\n## 参数\n\n参数原文。\n\n## 记忆\n\n记忆原文。').body.structure;
  const matching = selectReadingSections(preamble, selection(['parameters']));
  assert.deepEqual(matching.contextSectionIds, [preamble.sections[0].id]);
  assert.equal(preamble.sections[0].title, undefined); assert.ok(matching.nodeIndexes.includes(0));
});
test('Reader grouping is OR within groups and AND across groups; context never includes siblings', () => {
  const structure = parsed().body.structure;
  const match = selectReadingSections(structure, selection(['parameters', 'engineering']));
  const titles = match.matchedSectionIds.map(id => structure.sections.find(section => section.id === id)!.title);
  assert.deepEqual(titles, ['参数与训练', '微调实现']);
  assert.deepEqual(match.contextSectionIds.map(id => structure.sections.find(section => section.id === id)!.title), ['阅读导读']);
  assert.ok(!match.nodeIndexes.some(index => structure.sections.find(section => section.title === '记忆')!.nodeIndexes.includes(index)));
  assert.equal(selectReadingSections(structure, selection(['parameters', 'memory'])).matchedSectionIds.length, 3);
  assert.equal(selectReadingSections(structure, selection(['memory', 'concepts'])).matchedSectionIds.length, 0);
  assert.equal(selectReadingSections(structure, selection([])).matchedSectionIds.length, 0);
});
test('Reader heading interests override cross mentions; code, HTML, image descriptions and URL paths do not infer interests', () => {
  const structure = parsed('# 普通标题\n\n```js\nconst memory = parameters\n```\n\n<script>memory</script>\n\n![记忆](memory.png)\n\n[链接](https://example.com/memory)\n\n## 记忆\n\n参数作为对比说明。').body.structure;
  assert.equal(selectReadingSections(structure, selection(['parameters'])).matchedSectionIds.length, 0);
  const memory = selectReadingSections(structure, selection(['memory'])); assert.equal(memory.matchedSectionIds.length, 1);
  assert.equal(structure.sections.find(section => section.id === memory.matchedSectionIds[0])!.title, '记忆');
});
test('Reader evidence preserves Unicode and locates Markdown-escaped original source', () => {
  const source = '# 普通标题\n\n' + '😀'.repeat(70) + '参数' + '😀'.repeat(130) + '\n\n## A\n\n' + '原文 '.repeat(100) + 'con&#116;ext';
  const structure = parsed(source).body.structure;
  for (const evidence of structure.sections.flatMap(section => section.evidence)) { assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(evidence.quote)); assert.equal(evidence.quote, source.slice(evidence.startOffset, evidence.endOffset)); }
  const escaped = structure.sections.flatMap(section => section.evidence).find(evidence => evidence.tagId === 'context')!;
  assert.ok(escaped); assert.ok(escaped.quote.includes('con&#116;ext'));
});
test('Reader configuration is optional, owned, strict and backwards compatible', () => {
  assert.equal(readerTags.length, 12); assert.deepEqual(normalizeConfig(config(), 'vue'), config());
  const tags = ['parameters']; const normalized = normalizeReaderSelection(selection(tags)); tags.push('memory'); assert.deepEqual(normalized.tagIds, ['parameters']);
  for (const value of [selection(['unknown']), selection(['memory', 'memory']), { ...selection([]), scope: 'all' }, { ...selection([]), mode: 'guess' }, { ...selection([]), extra: true }, { ...selection([]), tagIds: [, 'memory'] }]) assert.throws(() => normalizeReaderSelection(value));
  assert.throws(() => normalizeConfig({ ...config(), reader: undefined }, 'vue'));
});
test('Reader catalog opt-in discovers loaded content without rewriting manual IDs; clearing restores them', async () => {
  const gets: string[] = [], storage = memoryStorage();
  const { app } = controller({ storage, authorDefault: config(['b']), factory: factory(source({ async get(id) { gets.push(id); return result(record(id, id === 'a' ? readerBody : '普通原文')); } })) });
  app.start(); await until(app, pageReady); assert.deepEqual(gets, ['b']);
  app.dispatch({ type: 'set-reader', selection: selection(['parameters']) }); await until(app, m => pageReady(m) && m.reader.analyzedCount === 2);
  const model = app.getModel(); assert.equal(model.kind, 'page'); if (model.kind === 'page') assert.deepEqual(model.page.items.map(item => item.id), ['a']);
  assert.deepEqual(current(model).contentIds, ['b']); assert.equal(storage.writes, 1);
  app.dispatch({ type: 'set-reader' }); await until(app, pageReady); assert.deepEqual(current(app.getModel()).contentIds, ['b']); assert.equal(current(app.getModel()).reader, undefined); app.destroy();
});
test('Reader selection survives theme changes, save/reload and shared configuration; invalid changes retain it', async () => {
  const storage = memoryStorage(), reader = selection(['parameters', 'engineering'], { scope: 'selected' });
  const { app } = controller({ storage, authorDefault: config(), factory: factory(source({ async get(id) { return result(record(id, readerBody)); } })) });
  app.start(); await until(app, pageReady); app.dispatch({ type: 'set-reader', selection: reader }); app.dispatch({ type: 'set-theme', themeId: 'card-grid', options: {} });
  assert.deepEqual(current(app.getModel()).reader, reader);
  app.dispatch({ type: 'set-reader', selection: selection(['invented']) }); assert.deepEqual(current(app.getModel()).reader, reader);
  assert.equal(storage.writes, 2); const saved = current(app.getModel()); app.destroy();
  const { app: reload } = controller({ storage }); reload.start(); await until(reload, pageReady); assert.deepEqual(current(reload.getModel()).reader, reader); reload.destroy();
  const { app: shared, storage: sharedStorage } = controller({ initialLocation: { target: { kind: 'home' }, search: shareSearch(saved) } }); shared.start(); await until(shared, pageReady); assert.deepEqual(current(shared.getModel()).reader, reader); assert.equal(shared.getModel().configuration.persistence, 'explicit');
  shared.dispatch({ type: 'set-reader', selection: selection(['memory']) }); assert.equal(sharedStorage.writes, 0); shared.saveSharedConfig(); assert.equal(sharedStorage.writes, 1); assert.deepEqual(current(shared.getModel()).reader?.tagIds, ['memory']); shared.destroy();
});
test('Reader incomplete catalog, pending bodies and errors remain distinct from no matches', async () => {
  const pending = deferred<ReturnType<typeof result>>();
  const { app } = controller({ authorDefault: { ...config([]), reader: selection(['memory']) }, factory: factory(source({
    async list(query) { return { items: [toSummary(record(query.cursor ? 'c' : 'a')), ...(query.cursor ? [] : [toSummary(record('b'))])], diagnostics: [], ...(query.cursor ? {} : { nextCursor: 'next' }) }; },
    async get(id) { if (id === 'a') return pending.promise; if (id === 'b') throw new ContentSourceError('network'); return result(record(id, '# 记忆\n\n记忆原文。')); }
  })) });
  app.start(); await until(app, m => m.kind === 'page' && m.reader.candidateCount === 2); assert.equal(app.getModel().reader.status, 'loading'); assert.equal(app.getModel().reader.hasMore, true);
  pending.resolve(result(record('a', '普通原文'))); await until(app, m => m.reader.status === 'partial'); let model = app.getModel(); if (model.kind === 'page') assert.deepEqual(model.page.items.map(item => item.id), ['b']);
  app.dispatch({ type: 'load-more-catalog' }); await until(app, m => m.reader.analyzedCount === 2 && m.reader.candidateCount === 3); model = app.getModel(); assert.equal(model.reader.matchingCount, 1); assert.equal(model.reader.hasMore, false); if (model.kind === 'page') assert.deepEqual(model.page.items.map(item => item.id), ['b', 'c']); app.destroy();
});
test('Reader filtered footnote references preserve original supporting nodes and resource identities', async () => {
  const { app } = controller({ authorDefault: { ...config(), reader: selection(['feedback'], { scope: 'selected' }) }, factory: factory(source({ async get(id) { return result(record(id, readerBody)); } })) });
  app.start(); await until(app, pageReady); const model = app.getModel(); assert.equal(model.kind, 'page');
  if (model.kind === 'page') { const item = model.page.items[0]; assert.equal(item.status, 'ready'); if (item.status === 'ready') {
    assert.equal(item.resources[0].key, 'image-0');
    assert.ok(item.body.structure.supportingNodeIndexes.every(index => item.reading!.nodeIndexes.includes(index)));
    const json = JSON.stringify(item.reading!.nodeIndexes.map(index => item.body.nodes[index])); assert.ok(json.includes('脚注原文')); assert.ok(json.includes('#fn-')); assert.ok(!json.includes('参数段原文'));
  } } app.destroy();
});
test('Reader file analysis keeps input bytes intact and rejects an output symlink pointing at author content', async () => {
  await mkdir('.generated', { recursive: true });
  const root = await mkdtemp(path.resolve('.generated/reader-analysis-input-')), file = path.join(root, 'source.md');
  const { body, ...meta } = record('reader-test-analysis', readerBody); const input = '---\n' + JSON.stringify(meta) + '\n---\n' + body.value;
  await writeFile(file, input); let output: string | undefined;
  try { const report = await analyzeContent(file); assert.equal(input.slice(report.bodyOffsetInFile), body.value); output = await writeAnalysis(file);
    assert.equal(await readFile(file, 'utf8'), input); const written = JSON.parse(await readFile(output, 'utf8')); assert.equal(written.sourceFileSha256, report.sourceFileSha256);
    await rm(output); await symlink(file, output); await assert.rejects(writeAnalysis(file)); assert.equal(await readFile(file, 'utf8'), input);
    await rm(output); await link(file, output); await writeAnalysis(file); assert.equal(await readFile(file, 'utf8'), input); assert.equal(JSON.parse(await readFile(output, 'utf8')).sourceFileSha256, report.sourceFileSha256);
  } finally { if (output) await rm(output, { force: true }); await rm(root, { recursive: true, force: true }); }
});
test('Reader references include only reachable notes, preserve duplicate definitions and terminate cycles', () => {
  const body = parsed('# 反馈\n\n评估原文[^a]\n\n## 记忆\n\n记忆原文[^unused]\n\n[^a]: 支持一[^b]\n\n[^a]: 重复作者定义\n\n[^b]: 支持二[^a]\n\n[^unused]: 不相关脚注').body;
  const matching = retainReadingReferences(body, selectReadingSections(body.structure, selection(['feedback'])));
  const visible = JSON.stringify(matching.nodeIndexes.map(index => body.nodes[index]));
  assert.ok(visible.includes('支持一')); assert.ok(visible.includes('支持二')); assert.ok(visible.includes('重复作者定义')); assert.ok(!visible.includes('不相关脚注'));
});
