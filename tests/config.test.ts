import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpContentSource } from '@blog/content-source';
import type { HttpSourceOptions } from '@blog/contracts';
import { basePath, loadConfig } from '../scripts/config.ts';
test('T03/T04: API resource precedence is an exact string enum in configuration and programmatic sources', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-api-config-'));
  try {
    const file = path.join(root, 'config.json');
    const source = { kind: 'http', sourceId: 'test', baseUrl: 'https://api.example.com/', resourceBaseUrl: 'https://assets.example.com/' };
    for (const priority of [['config'], ['response'], true, {}, null, 'other']) {
      const invalid = { ...source, resourceBasePriority: priority };
      await writeFile(file, JSON.stringify({ schemaVersion: 1, siteId: 'test', source: invalid, basePath: '/' }));
      await assert.rejects(loadConfig(file));
      assert.throws(() => new HttpContentSource(invalid as unknown as HttpSourceOptions));
    }
    for (const priority of ['config', 'response'] as const) {
      await writeFile(file, JSON.stringify({ schemaVersion: 1, siteId: 'test', source: { ...source, resourceBasePriority: priority }, basePath: '/' }));
      assert.equal((await loadConfig(file)).source.kind, 'http');
      assert.doesNotThrow(() => new HttpContentSource({ ...source, resourceBasePriority: priority }));
    }
    assert.throws(() => new HttpContentSource({ ...source, resourceBaseUrl: '' }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('T03/T04: API directory bases cannot silently lose queries or fragments', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-api-base-'));
  try {
    const file = path.join(root, 'config.json');
    for (const baseUrl of ['https://api.example.com/blog?token=value', 'https://api.example.com/blog/#section', 'https://api.example.com/blog/?', 'https://api.example.com/blog/#']) {
      const source = { kind: 'http' as const, sourceId: 'test', baseUrl };
      assert.throws(() => new HttpContentSource(source));
      await writeFile(file, JSON.stringify({ schemaVersion: 1, siteId: 'test', source, basePath: '/' }));
      await assert.rejects(loadConfig(file));
    }
    for (const baseUrl of ['https://api.example.com/blog', 'https://api.example.com/blog/', 'https://api.example.com/%E5%8D%9A%E5%AE%A2']) {
      const calls: string[] = [];
      const source = new HttpContentSource({ sourceId: 'test', baseUrl }, async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ schemaVersion: 1, site: { schemaVersion: 1 } })); });
      await source.getSite(); assert.equal(calls[0], baseUrl.replace(/\/$/, '') + '/site');
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('T13a: deployment bases reject encoded separators, controls and noncanonical URL paths', async () => {
  for (const value of ['/Blog%2fOther/', '/Blog%5COther/', '/%2fhost/', '/%00/', '/%0A/', '/Blog\n/', '/Blog /', '/博客/', '/%FF/', '/%2e%2e/', '/a//b/']) assert.throws(() => basePath(value), value);
  for (const value of ['/', '/Blog/', '/%E5%8D%9A%E5%AE%A2/', '/a%20b/', '/literal%252f/']) assert.equal(basePath(value), value);
});
