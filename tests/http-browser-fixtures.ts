import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { ContentRecord } from '@blog/contracts';
import { authoredMetadata, authoredRichBody } from './authored-body-fixture.ts';

const apiOrigin = 'http://127.0.0.1:4305';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jBqkAAAAASUVORK5CYII=', 'base64');
const records: ContentRecord[] = [
  { schemaVersion: 1, id: 'api%+😀', publication: 'published', title: 'API 文章 A', summary: 'API 明确摘要', ...authoredMetadata, body: { format: 'markdown', value: 'API 作者原文\n\n[![API 作者图片说明](photo.png)]()\n\n<script>window.API_INVENTED=true</script>' + authoredRichBody } },
  { schemaVersion: 1, id: 'api-b', publication: 'published', title: 'API 文章 B', body: { format: 'markdown', value: 'API 第二篇原文' } }
];
export async function startHttpFixtures(root: string): Promise<void> {
  const ports = [4306, 4307, 4308, 4309];
  const unusedContent = path.join(root, 'fixtures', 'http-unused');
  await mkdir(path.join(unusedContent, 'posts'), { recursive: true });
  await writeFile(path.join(unusedContent, 'posts/invalid.md'), 'Unused local data must never enter an API build.');
  for (let i = 0; i < ports.length; i++) {
    const framework = i % 2 === 0 ? 'vue' : 'react', base = i < 2 ? '/' : '/Blog/';
    const config = path.join(root, `http-config-${ports[i]}.json`), output = path.join(root, String(ports[i]));
    await writeFile(config, JSON.stringify({ schemaVersion: 1, siteId: 'api-blog', source: { kind: 'http', sourceId: 'api-content', baseUrl: apiOrigin + '/api/', resourceBaseUrl: apiOrigin + '/assets/', resourceBasePriority: 'config' }, basePath: base }));
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'build', framework], { env: { ...process.env, BLOG_CONFIG: config, BLOG_CONTENT_DIR: unusedContent, BLOG_BASE_PATH: base, BLOG_OUTPUT_DIR: output }, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith(base)) { res.statusCode = 404; res.end(); return; }
        const relative = decodeURIComponent(url.pathname.slice(base.length)) || 'index.html';
        const file = path.resolve(output, relative);
        if (!file.startsWith(output + path.sep)) { res.statusCode = 404; res.end(); return; }
        const data = await readFile(file);
        res.setHeader('Content-Type', relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html');
        res.setHeader('Cache-Control', 'no-store'); res.end(data);
      } catch { res.statusCode = 404; res.end(); }
    }).listen(ports[i], '127.0.0.1');
  }
  let siteStatus = 200, listStatus = 200, detailMode = 'valid', cors = true;
  let requests: Array<{ path: string; cookiePresent: boolean }> = [];
  createServer((req, res) => {
    const url = new URL(req.url ?? '/', apiOrigin);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/__control') {
      if (url.searchParams.get('reset') === 'true') { siteStatus = listStatus = 200; detailMode = 'valid'; cors = true; requests = []; }
      if (url.searchParams.has('siteStatus')) siteStatus = Number(url.searchParams.get('siteStatus'));
      if (url.searchParams.has('listStatus')) listStatus = Number(url.searchParams.get('listStatus'));
      if (url.searchParams.has('detailMode')) detailMode = url.searchParams.get('detailMode')!;
      if (url.searchParams.has('cors')) cors = url.searchParams.get('cors') === 'true';
      res.end('{}'); return;
    }
    if (url.pathname === '/__stats') { res.end(JSON.stringify(requests)); return; }
    if (cors) res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, cookiePresent: !!req.headers.cookie });
    if (url.pathname === '/assets/photo.png' || url.pathname === '/media/photo.png') { res.setHeader('Content-Type', 'image/png'); res.end(pixel); return; }
    if (url.pathname === '/api/site') {
      res.statusCode = siteStatus;
      res.end(JSON.stringify({ schemaVersion: 1, site: { schemaVersion: 1, title: 'API 测试站点', author: 'API 站点作者', extraField: 'SITE_UNKNOWN_VALUE' } })); return;
    }
    if (url.pathname === '/api/contents') {
      res.statusCode = listStatus;
      const ids = url.searchParams.getAll('ids');
      const selected = ids.length ? records.filter(item => ids.includes(item.id)) : url.searchParams.has('cursor') ? records.slice(1) : records.slice(0, 1);
      res.end(JSON.stringify({ schemaVersion: 1, items: selected.map(({ body: _body, ...item }) => ({ ...item, extraField: 'CATALOG_UNKNOWN_VALUE' })), ...(!ids.length && !url.searchParams.has('cursor') ? { nextCursor: 'next' } : {}) })); return;
    }
    if (url.pathname.startsWith('/api/contents/')) {
      const item = records.find(item => item.id === decodeURIComponent(url.pathname.slice('/api/contents/'.length)));
      if (!item) { res.statusCode = 404; res.end('{}'); return; }
      if (detailMode === 'unavailable') { res.statusCode = 503; res.end('{}'); return; }
      res.end(JSON.stringify({ schemaVersion: 1, item: { ...item, ...(detailMode === 'wrong-id' ? { id: 'wrong-id', title: '错误身份文章' } : {}), ...(detailMode === 'draft' ? { publication: 'draft', title: '未公开文章' } : {}), extraField: 'DETAIL_UNKNOWN_VALUE' }, resourceBaseUrl: apiOrigin + '/media/' })); return;
    }
    res.statusCode = 404; res.end('{}');
  }).listen(4305, '127.0.0.1');
}
