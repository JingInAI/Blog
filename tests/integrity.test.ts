import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { BootstrapError, contentRecord, toSummary, validateQuery } from '@blog/contracts';
import { collectResourceReferences, processBody } from '@blog/render-core';
import { choices } from '@blog/theme-contracts';
import { createStaticFactory, DeploymentProbe, HttpContentSource } from '@blog/content-source';
import type { FetchPort } from '@blog/content-source';
import type { SafeNode } from '@blog/contracts';
import { buildContent } from '../scripts/build-content/index.ts';
import { record } from './support.ts';

const run = promisify(execFile), siteScript = path.resolve('scripts/site.ts'), tsxLoader = path.resolve('node_modules/tsx/dist/loader.mjs');
const json = (value: unknown): Response => new Response(JSON.stringify(value));
const post = (item = record()): string => { const { body, ...meta } = item; return '---\n' + JSON.stringify(meta) + '\n---\n' + body.value; };
async function fixture(): Promise<{ root: string; content: string; output: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-integrity-')), content = path.join(root, 'content');
  await mkdir(path.join(content, 'posts'), { recursive: true }); await mkdir(path.join(content, 'assets'));
  await writeFile(path.join(content, 'posts/article.md'), post());
  return { root, content, output: path.join(root, 'output') };
}
const ids = (nodes: readonly SafeNode[]): string[] => nodes.flatMap(n => n.type === 'element' ? [...(n.props.id === undefined ? [] : [n.props.id]), ...ids(n.children)] : []);

test('T02: a missing content root fails without replacing an existing publication', async () => {
  const f = await fixture();
  try {
    await buildContent({ contentDir: f.content, outputDir: f.output });
    const before = await readFile(path.join(f.output, 'content/current.json'), 'utf8');
    await assert.rejects(buildContent({ contentDir: path.join(f.root, 'misspelled-content'), outputDir: f.output }), /invalid-content-directory/);
    assert.equal(await readFile(path.join(f.output, 'content/current.json'), 'utf8'), before);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('T02: content/output overlap and symlink aliases cannot replace authored source files', async () => {
  const f = await fixture();
  try {
    const before = await readFile(path.join(f.content, 'posts/article.md'), 'utf8');
    await symlink(f.content, path.join(f.root, 'alias'));
    for (const output of [f.content, f.root, path.join(f.content, 'posts/generated'), path.join(f.root, 'alias/posts/generated')]) {
      await assert.rejects(buildContent({ contentDir: f.content, outputDir: output }), /source-output-overlap/);
      assert.equal(await readFile(path.join(f.content, 'posts/article.md'), 'utf8'), before);
    }
    await buildContent({ contentDir: f.content, outputDir: f.output });
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('T02/T13a: a staging write failure removes the partial directory and preserves published files', async t => {
  const f = await fixture();
  try {
    await buildContent({ contentDir: f.content, outputDir: f.output });
    const before = await readFile(path.join(f.output, 'content/current.json'), 'utf8'), original = fs.writeFile;
    const stub = t.mock.method(fs, 'writeFile', async (...args: Parameters<typeof fs.writeFile>) => {
      if (String(args[0]).includes('.stage-')) throw Object.assign(new Error('injected disk failure'), { code: 'ENOSPC' });
      return original(...args);
    });
    syncBuiltinESMExports();
    try { await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /injected disk failure/); }
    finally { stub.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(await readFile(path.join(f.output, 'content/current.json'), 'utf8'), before);
    assert.deepEqual((await readdir(f.root)).filter(name => name.includes('.stage-') || name.includes('.previous-')), []);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('T02/T09a: empty-target links still collect and publish their nested authored image', async () => {
  const f = await fixture(); const item = record('nested-image', '[![作者嵌套图片说明](assets/photo.png)]()');
  try {
    await writeFile(path.join(f.content, 'posts/article.md'), post(item)); await writeFile(path.join(f.content, 'assets/photo.png'), 'authored image bytes');
    assert.deepEqual(collectResourceReferences(item), ['assets/photo.png']);
    const built = await buildContent({ contentDir: f.content, outputDir: f.output });
    const entry = built.manifest.contents[item.id].assetsByReference['assets/photo.png']; assert.ok(entry);
    assert.equal(await readFile(path.join(f.output, entry.publishedUrl), 'utf8'), 'authored image bytes');
    const body = processBody(item, { kind: 'static', sourceId: 'test', buildId: built.buildId, assetsByReference: { 'assets/photo.png': { publishedUrl: new URL(entry.publishedUrl, 'https://site.test/').href } } });
    assert.equal(body.resources.length, 1); assert.ok(JSON.stringify(body.body).includes('作者嵌套图片说明'));
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('T09a: duplicate footnote definitions preserve authored text with unique IDs and a stable first target', () => {
  const body = processBody(record('notes', '原文[^n]\n\n[^n]: 作者第一条定义\n\n[^N]: 作者重复定义'), { kind: 'http', sourceId: 'test' });
  const anchors = ids(body.body.nodes); assert.equal(anchors.length, 2); assert.equal(new Set(anchors).size, 2);
  const serialized = JSON.stringify(body.body);
  assert.ok(serialized.includes('作者第一条定义')); assert.ok(serialized.includes('作者重复定义'));
  assert.ok(serialized.includes('"href":"#' + anchors[0] + '"')); assert.deepEqual(body, processBody(record('notes', '原文[^n]\n\n[^n]: 作者第一条定义\n\n[^N]: 作者重复定义'), { kind: 'http', sourceId: 'test' }));
});

for (const field of ['tags', 'assets'] as const) test(`T01: sparse ${field} cannot be accepted as authored JSON fields`, () => {
  assert.throws(() => contentRecord({ ...record(), [field]: Array(1) }));
});
test('T03: sparse requested IDs fail before HTTP transport is called', async () => {
  let calls = 0; const source = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => { ++calls; return json({ schemaVersion: 1, items: [] }); });
  await assert.rejects(source.list({ ids: Array(1) }), /invalid-response/); assert.equal(calls, 0);
  assert.throws(() => validateQuery({ ids: Array(1) }));
});
test('T11: a sparse framework registration is invalid rather than an unavailable theme', () => {
  assert.throws(() => choices('react', [{ id: 'test', label: 'test', version: 1, frameworkIds: Array(1), options: [], defaults: {}, validate: () => [] }]));
});

test('T03/T13b: a static catalog must enumerate every published manifest identity before caching', async () => {
  let complete = false, catalogs = 0;
  const fetchPort: FetchPort = async url => {
    const pathname = new URL(String(url)).pathname;
    if (pathname.endsWith('current.json')) return json({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' });
    if (pathname.endsWith('manifest.json')) return json({ schemaVersion: 1, buildId: 'v1', siteUrl: 'content/v1/site.json', catalogUrl: 'content/v1/catalog.json', contents: { a: { url: 'content/v1/a.json', assetsByReference: {} }, b: { url: 'content/v1/b.json', assetsByReference: {} } } });
    ++catalogs; return json({ schemaVersion: 1, buildId: 'v1', items: complete ? [toSummary(record('a')), toSummary(record('b'))] : [] });
  };
  const runtime = await createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog/', fetch: fetchPort }).initialize();
  try {
    await assert.rejects(runtime.source.list({}), /invalid-response/); complete = true;
    assert.deepEqual((await runtime.source.list({})).items.map(item => item.id), ['a', 'b']); assert.equal(catalogs, 2);
  } finally { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); }
});

test('T02: URI-encoded local references resolve authored filenames once and reject encoded escapes', async () => {
  const f = await fixture();
  try {
    const name = '作者 图片%#.png', ref = 'assets/' + encodeURIComponent(name);
    await writeFile(path.join(f.content, 'assets', name), '作者文件字节');
    await writeFile(path.join(f.content, 'posts/article.md'), post(record('encoded-file', `![作者说明](${ref})`)));
    const built = await buildContent({ contentDir: f.content, outputDir: f.output });
    const asset = built.manifest.contents['encoded-file'].assetsByReference[ref]; assert.ok(asset);
    assert.equal(await readFile(path.join(f.output, asset.publishedUrl), 'utf8'), '作者文件字节');
    await writeFile(path.join(f.root, 'private.png'), '夹具私有文件字节');
    for (const unsafe of ['assets/%2e%2e/%2e%2e/private.png', 'assets/a%2Fb.png', 'assets/a%5Cb.png', 'assets/%00.png', 'assets/%FF.png']) {
      await writeFile(path.join(f.content, 'posts/article.md'), post(record('unsafe', `![作者说明](${unsafe})`)));
      await assert.rejects(buildContent({ contentDir: f.content, outputDir: f.output }), /resource-escape|unsafe-resource/);
      assert.equal(JSON.parse(await readFile(path.join(f.output, 'content/current.json'), 'utf8')).buildId, built.buildId);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('T04/T13b: static factory bases normalize directory paths and reject invalid bases before requesting', async () => {
  const calls: string[] = [];
  const fetchPort: FetchPort = async url => { calls.push(String(url)); return json(String(url).endsWith('current.json') ? { schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' } : { schemaVersion: 1, buildId: 'v1', siteUrl: 'content/v1/site.json', catalogUrl: 'content/v1/catalog.json', contents: {} }); };
  const runtime = await createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl: 'https://site.test/Blog', fetch: fetchPort }).initialize();
  if (runtime.kind === 'static') runtime.deploymentProbe.dispose();
  assert.equal(calls[0], 'https://site.test/Blog/content/current.json');
  for (const baseUrl of ['https://site.test/Blog/?token=x', 'https://site.test/Blog/#', 'file:///tmp/', 'https://name:secret@site.test/Blog/']) {
    calls.length = 0; await assert.rejects(createStaticFactory({ sourceId: 'test', expectedBuildId: 'v1', baseUrl, fetch: fetchPort }).initialize(), error => error instanceof BootstrapError && error.failure.kind === 'request' && error.failure.error.code === 'invalid-response'); assert.equal(calls.length, 0);
  }
});
test('T13b: independently constructed probes use the same directory base rules', async () => {
  const calls: string[] = []; const probe = new DeploymentProbe({ sourceInstanceId: 'instance', buildId: 'v1', baseUrl: 'https://site.test/Blog', fetch: async url => { calls.push(String(url)); return json({ schemaVersion: 1, buildId: 'v1', manifestUrl: 'content/v1/manifest.json' }); } });
  try { assert.equal((await probe.check()).observation.kind, 'same'); assert.equal(calls[0], 'https://site.test/Blog/content/current.json?probe=1'); }
  finally { probe.dispose(); }
  assert.throws(() => new DeploymentProbe({ sourceInstanceId: 'instance', buildId: 'v1', baseUrl: 'https://site.test/?query=1' }));
});
test('T03: serialized sparse API items are invalid instead of becoming holes in a successful page', async () => {
  const source = new HttpContentSource({ sourceId: 'test', baseUrl: 'https://api.test/' }, async () => {
    return json({ schemaVersion: 1, items: Array(1) });
  });
  await assert.rejects(source.list({}), /invalid-response/);
});

for (const framework of ['vue', 'react']) test(`T02/T13a: ${framework} CLI builds reject source/configuration output targets without modifying inputs`, async () => {
  const f = await fixture();
  try {
    await mkdir(path.join(f.root, `apps/blog-${framework}`), { recursive: true });
    await writeFile(path.join(f.root, `apps/blog-${framework}/index.html`), '<html><body>作者测试入口</body></html>');
    await mkdir(path.join(f.root, 'packages')); await writeFile(path.join(f.root, 'packages/authored.txt'), '源码标记');
    const configFile = path.join(f.root, 'blog.config.json');
    for (const kind of ['static', 'http']) {
      await writeFile(configFile, JSON.stringify({ schemaVersion: 1, siteId: 'test', source: { kind, sourceId: 'test', ...(kind === 'http' ? { baseUrl: 'https://api.test/' } : {}) }, basePath: '/' }));
      for (const output of [f.content, f.root, path.join(f.root, 'packages'), configFile]) {
        await assert.rejects(run(process.execPath, ['--import', tsxLoader, siteScript, 'build', framework], { cwd: f.root, env: { ...process.env, BLOG_CONFIG: configFile, BLOG_CONTENT_DIR: f.content, BLOG_OUTPUT_DIR: output }, timeout: 30000 }), /source-output-overlap/);
        assert.equal(await readFile(path.join(f.content, 'posts/article.md'), 'utf8'), post());
        assert.equal(await readFile(path.join(f.root, 'packages/authored.txt'), 'utf8'), '源码标记');
      }
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
