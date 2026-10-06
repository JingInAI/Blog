import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const run = promisify(execFile);
const script = path.resolve('scripts/check-boundaries.ts');
const tsx = path.resolve('node_modules/tsx/dist/loader.mjs');
async function fixture(contents: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'blog-boundaries-'));
  for (const name of ['contracts', 'content-source', 'render-core', 'theme-contracts', 'renderer-vue', 'renderer-react', ...new Set(Object.keys(contents).map(file => file.split('/')[0]))]) {
    await mkdir(path.join(root, 'packages', name, 'src'), { recursive: true });
    await writeFile(path.join(root, 'packages', name, 'package.json'), JSON.stringify({ name: '@blog/' + name }));
  }
  for (const [file, content] of Object.entries(contents)) await writeFile(path.join(root, 'packages', file), content);
  return root;
}
test('T11: TSX imports and CommonJS-style imports cannot bypass content/rendering boundaries', async () => {
  for (const code of ["import { BlogController } from '@blog/render-core'; export const view = <div />;", "const source = require('@blog/content-source');"]) {
    const root = await fixture({ 'renderer-react/src/view.tsx': code });
    try { await assert.rejects(run(process.execPath, ['--import', tsx, script], { cwd: root }), /render-core|content-source/); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('T11: added renderer packages and Vue script blocks receive the same dependency checks', async () => {
  for (const file of ['renderer-custom/src/view.ts', 'renderer-vue/src/View.vue']) {
    const code = "import { BlogController } from '@blog/render-core';";
    const root = await fixture({ [file]: file.endsWith('.vue') ? '<template><p>view</p></template><script setup lang="ts">' + code + '</script>' : code });
    try { await assert.rejects(run(process.execPath, ['--import', tsx, script], { cwd: root }), /render-core/); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('T11: authored strings and comments are not treated as executable dependencies or browser globals', async () => {
  const root = await fixture({ 'render-core/src/text.ts': "// import { createApp } from 'vue';\nexport const label = \"window document localStorage HTMLElement from 'react'\";" });
  try { await run(process.execPath, ['--import', tsx, script], { cwd: root }); }
  finally { await rm(root, { recursive: true, force: true }); }
});
test('T11: type imports, reexports, dynamic imports and relative escapes use the same boundary policy', async () => {
  for (const code of [
    "export * from '@blog/render-core';", "export type Core = import('@blog/render-core').BlogController;",
    "void import('@blog/content-source');", "import source = require('@blog/content-source');",
    "void import('@blog/' + moduleName);", "import '../../render-core/src/index.ts';"
  ]) {
    const root = await fixture({ 'renderer-react/src/view.ts': code });
    try { await assert.rejects(run(process.execPath, ['--import', tsx, script], { cwd: root }), /forbidden dependency|literal module|package escape/); }
    finally { await rm(root, { recursive: true, force: true }); }
  }
});
test('T11: a new renderer may use shared contracts while manifest peer dependencies still respect boundaries', async () => {
  const root = await fixture({ 'renderer-custom/src/View.svelte': '<script lang="ts">import type { ViewModel } from "@blog/contracts"; export let model: ViewModel;</script><p>view</p>' });
  try {
    await run(process.execPath, ['--import', tsx, script], { cwd: root });
    await writeFile(path.join(root, 'packages/renderer-custom/package.json'), JSON.stringify({ name: '@blog/renderer-custom', peerDependencies: { '@blog/render-core': '*' } }));
    await assert.rejects(run(process.execPath, ['--import', tsx, script], { cwd: root }), /forbidden dependency/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
