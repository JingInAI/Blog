import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
for (const framework of ['vue', 'react']) {
  test(`T02/T13a: concurrent ${framework} builds keep their selected content and embedded versions independent`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'blog-parallel-build-'));
    try {
      const variants = await Promise.all(['first', 'second'].map(async id => {
        const content = path.join(root, id, 'content'), output = path.join(root, id, 'output');
        await mkdir(path.join(content, 'posts'), { recursive: true });
        await writeFile(path.join(content, 'posts/article.md'), '---\n' + JSON.stringify({ schemaVersion: 1, id, publication: 'published', title: id }) + '\n---\nAuthored content ' + id);
        return { id, content, output };
      }));
      const builds = await Promise.allSettled(variants.map(variant => run(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'build', framework], {
        env: { ...process.env, BLOG_CONTENT_DIR: variant.content, BLOG_BASE_PATH: '/Blog/', BLOG_OUTPUT_DIR: variant.output }, timeout: 120000
      })));
      for (const result of builds) if (result.status === 'rejected') throw result.reason;
      for (const variant of variants) {
        const json = async (relative: string) => JSON.parse(await readFile(path.join(variant.output, relative), 'utf8'));
        const pointer = await json('content/current.json'), manifest = await json(pointer.manifestUrl), catalog = await json(manifest.catalogUrl);
        assert.equal(manifest.buildId, pointer.buildId); assert.equal(catalog.buildId, pointer.buildId);
        assert.deepEqual(catalog.items.map((item: { id: string }) => item.id), [variant.id]);
        assert.equal((await json(manifest.contents[variant.id].url)).item.body.value, 'Authored content ' + variant.id);
        const javascript = (await Promise.all((await readdir(path.join(variant.output, 'assets'))).filter(file => file.endsWith('.js')).map(file => readFile(path.join(variant.output, 'assets', file), 'utf8')))).join('\n');
        assert.ok(javascript.includes(pointer.buildId), 'application and selected content must have the same buildId');
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test(`T02/T03: ${framework} HTTP builds ignore unused local content and publish no static content artifacts`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'blog-http-build-'));
    try {
      const content = path.join(root, 'unused-content'), output = path.join(root, 'output'), config = path.join(root, 'config.json');
      await mkdir(path.join(content, 'posts'), { recursive: true });
      await writeFile(path.join(content, 'posts/invalid.md'), '---\n{"schemaVersion":1}\n---\nunused local source');
      await writeFile(config, JSON.stringify({ schemaVersion: 1, siteId: 'api-blog', source: { kind: 'http', sourceId: 'api-content', baseUrl: 'https://api.example.com/blog/' }, basePath: '/Blog/' }));
      const result = await run(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'build', framework], {
        env: { ...process.env, BLOG_CONFIG: config, BLOG_CONTENT_DIR: content, BLOG_BASE_PATH: '/Blog/', BLOG_OUTPUT_DIR: output }, timeout: 120000
      });
      assert.match(result.stdout, /Built/);
      assert.deepEqual((await readdir(output)).sort(), ['assets', 'index.html']);
      const html = await readFile(path.join(output, 'index.html'), 'utf8');
      assert.match(html, /\/Blog\/assets\//);
      for (const file of await readdir(path.join(output, 'assets'))) assert.ok(!(await readFile(path.join(output, 'assets', file), 'utf8')).includes('unused local source'));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
