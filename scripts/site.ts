import path from 'node:path';
import { mkdir, rename, rm } from 'node:fs/promises';
import { build, createServer } from 'vite';
import { buildContent } from './build-content/index.ts';
import { basePath, loadConfig } from './config.ts';
const [mode, argument] = process.argv.slice(2);
const framework = argument ?? process.env.BLOG_FRAMEWORK;
if (!['vue', 'react'].includes(framework ?? '')) throw new Error('Specify vue/react or BLOG_FRAMEWORK; deployment never chooses a framework implicitly.');
if (!['dev', 'build'].includes(mode)) throw new Error('Specify dev/build');
const config = await loadConfig(process.env.BLOG_CONFIG ?? 'blog.config.json');
const base = basePath(process.env.BLOG_BASE_PATH ?? config.basePath);
const content = config.source.kind === 'static'
  ? await buildContent({ contentDir: process.env.BLOG_CONTENT_DIR ?? 'content', outputDir: `.generated/${framework}/public` })
  : undefined;
const options = {
  root: path.resolve(`apps/blog-${framework}`), base,
  publicDir: content?.outputDir ?? false as const,
  define: { __BLOG_CONFIG__: JSON.stringify({ ...config, basePath: base }), __BUILD_ID__: JSON.stringify(content?.buildId ?? ''), __FRAMEWORK__: JSON.stringify(framework) },
  server: { host: '127.0.0.1', port: framework === 'vue' ? 5173 : 5174, strictPort: true, fs: { allow: [process.cwd()] } },
  build: { outDir: path.resolve(process.env.BLOG_OUTPUT_DIR ?? `dist/${framework}`), emptyOutDir: true, target: 'es2022' },
};
if (mode === 'dev') { const server = await createServer(options); await server.listen(); server.printUrls(); }
else {
  const output = options.build.outDir, stage = `${output}.stage-${crypto.randomUUID()}`, backup = `${output}.previous-${crypto.randomUUID()}`;
  await build({ ...options, build: { ...options.build, outDir: stage } });
  await mkdir(path.dirname(output), { recursive: true }); let backedUp = false;
  try {
    try { await rename(output, backup); backedUp = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    await rename(stage, output);
  } catch (e) { if (backedUp) await rename(backup, output); await rm(stage, { recursive: true, force: true }); throw e; }
  if (backedUp) await rm(backup, { recursive: true, force: true });
  console.log(`Built ${framework}: ${content?.buildId ?? 'HTTP source configured'}`);
}
