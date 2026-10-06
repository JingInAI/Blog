import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

export async function startThemeFixtures(root: string): Promise<void> {
  for (const [framework, port] of [['vue', 4310], ['react', 4311]] as const) {
    const output = path.join(root, String(port));
    await build({ root: path.resolve('tests/theme-form-fixture'), publicDir: false, define: { __FRAMEWORK__: JSON.stringify(framework) },
      build: { outDir: output, emptyOutDir: true, target: 'es2022' } });
    createServer(async (req, res) => {
      try {
        const relative = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname).slice(1) || 'index.html';
        const file = path.resolve(output, relative);
        if (!file.startsWith(output + path.sep)) { res.statusCode = 404; res.end(); return; }
        const data = await readFile(file);
        res.setHeader('Content-Type', relative.endsWith('.js') ? 'text/javascript' : 'text/html');
        res.setHeader('Cache-Control', 'no-store'); res.end(data);
      } catch { res.statusCode = 404; res.end(); }
    }).listen(port, '127.0.0.1');
  }
}
