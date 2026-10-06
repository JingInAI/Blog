import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import path from 'node:path';

for (const [framework, signal, port, repeated] of [['vue', 'SIGTERM', 5191, false], ['vue', 'SIGINT', 5192, false], ['react', 'SIGTERM', 5193, false], ['react', 'SIGINT', 5194, false], ['vue', 'SIGTERM', 5195, true], ['react', 'SIGTERM', 5196, true]] as const) {
  test(`T04/T13: ${framework} ${repeated ? 'repeated ' : ''}${signal} shutdown closes its listener and removes its generated instance`, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'blog-dev-shutdown-'));
    await mkdir('.generated', { recursive: true });
    const prefix = `dev-${framework}-${port}-`;
    const instances = async () => (await readdir('.generated')).filter(name => name.startsWith(prefix)).sort();
    const before = await instances();
    await mkdir(path.join(root, 'posts'));
    const config = path.join(root, 'config.json');
    await writeFile(config, JSON.stringify({ schemaVersion: 1, siteId: 'shutdown-fixture', source: { kind: 'static', sourceId: 'shutdown-content' }, basePath: '/' }));
    await writeFile(path.join(root, 'posts/article.md'), '---\n' + JSON.stringify({ schemaVersion: 1, id: 'shutdown-fixture', publication: 'published', title: 'Shutdown fixture' }) + '\n---\nAuthored fixture body');
    const environment: NodeJS.ProcessEnv = { ...process.env, BLOG_CONFIG: config, BLOG_CONTENT_DIR: root, BLOG_BASE_PATH: '/', BLOG_DEV_PORT: String(port), FORCE_COLOR: '1' };
    delete environment.NO_COLOR;
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'dev', framework], {
      env: environment, stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stdout.on('data', data => { logs = (logs + data).slice(-3000); });
    child.stderr.on('data', data => { logs = (logs + data).slice(-3000); });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let ready = false;
      const deadline = Date.now() + 10000;
      while (!ready && Date.now() < deadline) {
        assert.equal(child.exitCode, null, logs);
        try {
          const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) });
          await response.arrayBuffer(); ready = response.status === 200;
        } catch { /* Wait for the actual HTTP listener, independent of terminal formatting. */ }
        if (!ready) await delay(50);
      }
      assert.equal(ready, true, 'Development listener did not become ready: ' + logs);
      assert.equal((await instances()).filter(name => !before.includes(name)).length, 1);
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
      child.kill(signal);
      if (repeated) for (let attempt = 0; attempt < 5 && child.exitCode === null && child.signalCode === null; attempt++) { await delay(1); child.kill(signal); }
      const exit = await Promise.race([exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Development shutdown timed out: ' + logs)), 10000); })]);
      assert.ok(exit.code === 0 || exit.code === (signal === 'SIGTERM' ? 143 : 130), logs); assert.equal(exit.signal, null);
      assert.deepEqual(await instances(), before, 'normal shutdown must remove its generated content and cache');
      await assert.rejects(fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) }));
    } finally {
      clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      await rm(root, { recursive: true, force: true });
    }
  });
}
