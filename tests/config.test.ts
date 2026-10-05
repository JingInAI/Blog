import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HttpContentSource } from '@blog/content-source';
import type { HttpSourceOptions } from '@blog/contracts';
import { loadConfig } from '../scripts/config.ts';
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
