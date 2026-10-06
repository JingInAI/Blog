import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function startDevFixtures(root: string): Promise<void> {
  const config = path.join(root, 'dev-config.json');
  await writeFile(config, JSON.stringify({ schemaVersion: 1, siteId: 'dev-fixture', source: { kind: 'static', sourceId: 'public-content' }, basePath: '/' }));
  const children = ([['vue', 4312, 'v1'], ['react', 4313, 'v1'], ['vue', 4314, 'v2']] as const).map(([framework, port, version]) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'dev', String(framework), '--force'], {
      env: { ...process.env, BLOG_CONFIG: config, BLOG_CONTENT_DIR: path.join(root, 'fixtures', version), BLOG_DEV_PORT: String(port), BLOG_BASE_PATH: '/' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '', error: Error | undefined;
    child.stdout.on('data', data => { output = (output + data).slice(-3000); });
    child.stderr.on('data', data => { output = (output + data).slice(-3000); });
    child.on('error', value => { error = value; });
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
    return { child, port, closed, logs: () => output, error: () => error };
  });
  process.once('exit', () => { for (const entry of children) if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill(); });
  let stopping: Promise<void> | undefined;
  const stop = (): void => {
    stopping ??= (async () => {
      for (const entry of children) if (entry.child.exitCode === null && entry.child.signalCode === null) entry.child.kill('SIGTERM');
      await Promise.all(children.map(entry => entry.closed));
    })();
    void stopping.then(() => process.exit(0), error => { console.error(error); process.exit(1); });
  };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  await Promise.all(children.map(async entry => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (entry.error() || entry.child.exitCode !== null) throw new Error('Development fixture failed: ' + entry.logs());
      try { if ((await fetch(`http://127.0.0.1:${entry.port}/`, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Wait for the local listener. */ }
      await delay(100);
    }
    throw new Error('Development fixture did not start: ' + entry.logs());
  }));
}
