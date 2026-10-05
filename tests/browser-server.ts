import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { startHttpFixtures } from './http-browser-fixtures.ts';
import { startThemeFixtures } from './theme-browser-fixtures.ts';
const root = path.resolve('.generated/e2e');
const frameworks = ['vue', 'react'];
const ports = [4301, 4302, 4303, 4304];
for (const version of ['v1', 'v2']) {
  const fixture = path.join(root, 'fixtures', version); await mkdir(path.join(fixture, 'posts'), { recursive: true }); await mkdir(path.join(fixture, 'assets'), { recursive: true });
  await writeFile(path.join(fixture, 'site.json'), JSON.stringify({ schemaVersion: 1, title: '测试站点', author: '仅站点作者' }));
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBqkAAAAASUVORK5CYII=', 'base64');
  await writeFile(path.join(fixture, 'assets/photo.png'), version === 'v1' ? pixel : Buffer.concat([pixel, Buffer.from('v2')]));
  const items = [
    { id: 'a%+😀', title: '测试文章 A', summary: '明确摘要 A', body: '作者原文 ' + version + '\n\n![作者图片描述](assets/photo.png)\n\n<script>window.INVENTED=true</script>' },
    { id: 'b', title: '测试文章 B', body: '第二篇作者正文' }
  ];
  for (const item of items) { const { body, ...meta } = item; await writeFile(path.join(fixture, 'posts', meta.id.startsWith('a') ? 'a.md' : 'b.md'), '---\n' + JSON.stringify({ schemaVersion: 1, publication: 'published', ...meta }) + '\n---\n' + body); }
  await writeFile(path.join(fixture, 'posts/draft.md'), '---\n' + JSON.stringify({ schemaVersion: 1, publication: 'draft', id: 'private-draft', title: '草稿测试夹具' }) + '\n---\n草稿秘密');
  for (let i = 0; i < ports.length; i++) {
    const framework = frameworks[i % 2], base = i < 2 ? '/' : '/Blog/';
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'build', framework], { cwd: process.cwd(), env: { ...process.env, BLOG_CONTENT_DIR: fixture, BLOG_BASE_PATH: base, BLOG_OUTPUT_DIR: path.join(root, String(ports[i]), version) }, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  }
}
for (let i = 0; i < ports.length; i++) {
  let version = 'v1', imagesFail = false; const base = i < 2 ? '/' : '/Blog/';
  createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__control') { version = url.searchParams.get('version') ?? version; imagesFail = url.searchParams.get('failImages') === 'true'; res.end('ok'); return; }
    if (url.pathname === '/api/site') { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ schemaVersion: 1, site: { schemaVersion: 1 } })); return; }
    if (!url.pathname.startsWith(base)) { res.statusCode = 404; res.end(); return; }
    const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
    if (relative.includes('..') || (imagesFail && relative.endsWith('.png'))) { res.statusCode = 404; res.end(); return; }
    try {
      const data = await readFile(path.join(root, String(ports[i]), version, relative));
      const type = relative.endsWith('.json') ? 'application/json' : relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.png') ? 'image/png' : 'text/html';
      res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(data);
    } catch { res.statusCode = 404; res.end(); }
  }).listen(ports[i], '127.0.0.1');
}
await startHttpFixtures(root);
await startThemeFixtures(root);
createServer((_req, res) => res.end('ready')).listen(4300, '127.0.0.1');
console.log('Browser fixture servers ready.');
