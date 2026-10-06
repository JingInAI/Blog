import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { contentRecord, contentSummary, siteInfo, validId, validateDate, assertJson, semanticEqual, compareIds } from '@blog/contracts';
import { processBody, collectResourceReferences } from '@blog/render-core';
import { normalizeConfig, verifyThemeImplementations } from '@blog/theme-contracts';
import { buildContent, parsePost } from '../scripts/build-content/index.ts';
import { config, record } from './support.ts';
test('T01: authored empty/absent fields are preserved; summaries contain no body or assets', () => {
  const item = contentRecord({ ...record('编号+%😀', ''), summary: '', author: '', tags: [], publishedAt: '2024-02-29T23:10:01+08:00' });
  assert.equal(item.body.value, ''); assert.equal(item.summary, ''); assert.equal(item.author, ''); assert.deepEqual(siteInfo({ schemaVersion: 1 }), { schemaVersion: 1 });
  assert.throws(() => contentSummary(item, 'static')); assert.throws(() => contentRecord({ ...item, summery: '猜测' }), /unknown-field/);
  assert.throws(() => siteInfo({ schemaVersion: 1, siteId: 'internal' }), /unknown-field/);
  assert.equal('author' in contentRecord(record()), false);
});
test('T01: Unicode IDs and calendar timestamps validate strictly without rewriting', () => {
  for (const id of ['', '.', '..', 'a/b', 'a\\b', '\u0000', '\ud800', 'x'.repeat(129)]) assert.throws(() => validId(id));
  assert.equal(validId('é%+😀'), 'é%+😀'); assert.ok(compareIds('\ue000', '😀') < 0);
  for (const date of ['2023-02-29T01:00:00Z', '2024-01-01', '2024-01-01T25:00:00Z', '2024-01-01T00:00:00+24:00']) assert.throws(() => validateDate(date, 'date'));
});
test('T08: JSON rejects lossy objects and ignores object key ordering only', () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  for (const v of [undefined, NaN, Infinity, 1n, new Date(), new Map(), new Set(), cycle, { x: undefined }, [, 1], Object.assign([], { extra: true })]) assert.throws(() => assertJson(v));
  assert.ok(semanticEqual({ b: 1, a: [2] }, { a: [2], b: 1 })); assert.ok(!semanticEqual(['a', 'b'], ['b', 'a']));
  assert.throws(() => normalizeConfig({ ...config(), themeOptions: { invented: true } }, 'vue'));
  assert.throws(() => normalizeConfig(config(), 'future-framework')); assert.throws(() => verifyThemeImplementations('react', ['card-grid']));
});
test('T09a: pure AST preserves text/code/order, makes HTML literal, and never infers metadata', () => {
  const content = record('a', '# 标题\n\n原文 **重点**。\n\n<script>alert(1)</script>\n\n[危险](javascript:alert%281%29)\n\n```js\nconst value = 7\n```\n\n| 字段 | 值 |\n| --- | --- |\n| 内容 | 作者原文 |\n\n- [x] 已完成');
  const context = { kind: 'http' as const, sourceId: 'test' };
  const one = processBody(content, context); assert.deepEqual(one, processBody(content, context)); assert.ok(Object.isFrozen(one.body.nodes));
  const json = JSON.stringify(one); assert.ok(json.includes('<script>alert(1)</script>')); assert.ok(json.includes('const value = 7')); assert.ok(!json.includes('javascript:'));
  assert.deepEqual(one.diagnostics.map(d => d.code), ['raw-html-as-text', 'unsafe-link-as-text']);
  assert.deepEqual(content, record('a', content.body.value));
});
test('T09a: repeated image URLs have unique deterministic keys and explicit context/alt requirements', () => {
  const item = record('a', '![原始描述](photo.png)\n\n![原始描述](photo.png)');
  const body = processBody(item, { kind: 'http', sourceId: 'test', resourceBaseUrl: 'https://api.test/assets/' });
  assert.deepEqual(body.resources.map(r => r.key), ['image-0', 'image-1']); assert.equal(body.resources[0].url, body.resources[1].url);
  assert.ok(!JSON.stringify(body.body).includes('src')); assert.deepEqual(collectResourceReferences(item), ['photo.png']);
  assert.throws(() => processBody(item, { kind: 'http', sourceId: 'test' }), /unresolved-resource/);
  assert.throws(() => processBody(record('a', '![](https://site.test/a.png)'), { kind: 'http', sourceId: 'test' }), /invalid-image-description/);
  const decorative = { ...record('a', '![](asset:decoration)'), assets: [{ id: 'decoration', url: 'https://site.test/x.png', decorative: true, alt: '' }] };
  assert.equal(processBody(decorative, { kind: 'http', sourceId: 'test' }).resources.length, 1);
  assert.throws(() => processBody({ ...decorative, body: { format: 'markdown', value: '![猜测](asset:decoration)' } }, { kind: 'http', sourceId: 'test' }), /invalid-image-description/);
});
async function fixture(): Promise<{ root: string; content: string; output: string }> { const root = await mkdtemp(path.join(os.tmpdir(), 'blog-content-test-')); const content = path.join(root, 'content'); await mkdir(path.join(content, 'posts'), { recursive: true }); await mkdir(path.join(content, 'assets')); return { root, content, output: path.join(root, 'output') }; }
const post = (item: ReturnType<typeof record>): string => { const { body, ...meta } = item; return '---\n' + JSON.stringify(meta) + '\n---\n' + body.value; };
test('T02/T09a: static publishing keeps unsafe link labels as text without copying their URLs as local assets', async () => {
  const f = await fixture();
  try {
    const body = '[直接链接](javascript:alert%281%29)\n\n[数据链接](data:text/html,bad)\n\n[引用链接][unsafe]\n\n[unsafe]: vbscript:bad\n\n[有凭据链接](https://user:password@example.com/)\n\n[附件](assets/public.txt)';
    const item = record('unsafe-links', body);
    await writeFile(path.join(f.content, 'assets/public.txt'), '作者附件');
    await writeFile(path.join(f.content, 'posts/article.md'), post(item));
    const output = await buildContent({ contentDir: f.content, outputDir: f.output });
    assert.deepEqual(collectResourceReferences(item), ['assets/public.txt']);
    const assetsByReference = Object.fromEntries(Object.entries(output.manifest.contents[item.id].assetsByReference).map(([ref, entry]) => [ref, { publishedUrl: new URL(entry.publishedUrl, 'https://static.test/').href }]));
    const converted = processBody(item, { kind: 'static', sourceId: 'test', buildId: output.buildId, assetsByReference });
    assert.equal(converted.diagnostics.filter(d => d.code === 'unsafe-link-as-text').length, 4);
    const safe = JSON.stringify(converted.body);
    for (const label of ['直接链接', '数据链接', '引用链接', '有凭据链接', '附件']) assert.ok(safe.includes(label));
    for (const url of ['javascript:', 'data:text/html', 'vbscript:', 'user:password']) assert.ok(!safe.includes(url));
    assert.equal(converted.resources.length, 0);
    const referenceCount = Object.keys(output.manifest.contents[item.id].assetsByReference).length; assert.equal(referenceCount, 1);
    for (const value of ['javascript:bad', 'data:image/png,bad', 'vbscript:bad']) {
      await writeFile(path.join(f.content, 'posts/article.md'), post(record('unsafe-image', `![作者描述](${value})`)));
      await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }));
      const pointer = JSON.parse(await readFile(path.join(f.output, 'content/current.json'), 'utf8')); assert.equal(pointer.buildId, output.buildId);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test('T02/T13a: only published, actually referenced assets enter deterministic output; failed builds preserve it', async () => {
  const f = await fixture();
  await writeFile(path.join(f.content, 'assets/public.txt'), '公开附件'); await writeFile(path.join(f.content, 'assets/private.txt'), '草稿专属秘密');
  await writeFile(path.join(f.content, 'posts/a.md'), post(record('a', '[附件](assets/public.txt)')));
  await writeFile(path.join(f.content, 'posts/draft.md'), post({ ...record('draft', '[秘密](assets/private.txt)'), publication: 'draft' } as ReturnType<typeof record>));
  const build = await buildContent({ contentDir: f.content, outputDir: f.output }); const before = await readFile(path.join(f.output, 'content/current.json'), 'utf8');
  assert.deepEqual(Object.keys(build.manifest.contents), ['a']);
  const assetNames = await readdir(path.join(f.output, `content/${build.buildId}/assets`)); assert.equal(assetNames.length, 1);
  assert.equal((await buildContent({ contentDir: f.content, outputDir: f.output })).buildId, build.buildId);
  const site = JSON.parse(await readFile(path.join(f.output, build.manifest.siteUrl), 'utf8')); assert.deepEqual(site.site, { schemaVersion: 1 });
  await writeFile(path.join(f.content, 'posts/broken.md'), '---\n{"schemaVersion":1}\n---\n');
  await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /broken.md/); assert.equal(await readFile(path.join(f.output, 'content/current.json'), 'utf8'), before);
});
test('T02: resource traversal and symlink escapes fail; frontmatter cannot replace generated body', async () => {
  const f = await fixture(); await writeFile(path.join(f.root, 'secret.txt'), 'secret');
  await symlink(path.join(f.root, 'secret.txt'), path.join(f.content, 'assets/escape.txt'));
  await writeFile(path.join(f.content, 'posts/a.md'), post(record('a', '[资源](assets/escape.txt)')));
  await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /resource-escape/);
  await writeFile(path.join(f.content, 'posts/a.md'), post(record('a', '[资源](../secret.txt)')));
  await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /resource-escape/);
  assert.throws(() => parsePost('---\n{"body":{}}\n---\n正文'), /unknown-field/);
  assert.equal(parsePost(post(record('a', '\n正文\n'))).body.value, '\n正文\n');
});

for (const location of ['posts', 'site.json']) {
  test(`T02: a symlink at the ${location} entry cannot import external facts into public output`, async () => {
    const f = await fixture();
    try {
      const original = await buildContent({ contentDir: f.content, outputDir: f.output });
      const outside = path.join(f.root, 'outside'); await mkdir(path.join(outside, 'posts'), { recursive: true });
      await writeFile(path.join(outside, 'posts/article.md'), post(record('outside', '外部文件正文')));
      await writeFile(path.join(outside, 'site.json'), JSON.stringify({ schemaVersion: 1, title: '外部站点事实' }));
      await rm(path.join(f.content, location), { recursive: true, force: true });
      await symlink(location === 'posts' ? path.join(outside, 'posts') : path.join(outside, 'site.json'), path.join(f.content, location));
      await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /symlink-not-allowed/);
      assert.equal(JSON.parse(await readFile(path.join(f.output, 'content/current.json'), 'utf8')).buildId, original.buildId);
    } finally { await rm(f.root, { recursive: true, force: true }); }
  });
}

test('T02/T09a: an authored empty CommonMark link stays a link without inventing a resource', async () => {
  const item = record('empty-link', '[作者空目标链接]()');
  for (const context of [{ kind: 'http' as const, sourceId: 'test' }, { kind: 'static' as const, sourceId: 'test', buildId: 'v1', assetsByReference: {} }]) {
    const body = processBody(item, context);
    assert.deepEqual(body.body.nodes, [{ type: 'element', tag: 'p', props: {}, children: [{ type: 'element', tag: 'a', props: { href: '' }, children: [{ type: 'text', value: '作者空目标链接' }] }] }]);
    assert.deepEqual(body.resources, []); assert.deepEqual(body.diagnostics, []);
  }
  assert.deepEqual(collectResourceReferences(item), []);
  assert.throws(() => processBody(record('empty-image', '![作者图片说明]()'), { kind: 'http', sourceId: 'test' }), /unresolved-resource/);
  const f = await fixture();
  try {
    await writeFile(path.join(f.content, 'posts/article.md'), post(item));
    const built = await buildContent({ contentDir: f.content, outputDir: f.output });
    assert.deepEqual(built.manifest.contents[item.id].assetsByReference, {});
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
