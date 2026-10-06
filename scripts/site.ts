import path from 'node:path';
import { mkdir, rename, rm } from 'node:fs/promises';
import { build, createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import { buildContent } from './build-content/index.ts';
import { basePath, loadConfig } from './config.ts';
import { assertProjectOutput, assertSeparatePaths } from './output.ts';
const [mode, argument] = process.argv.slice(2);
const framework = argument ?? process.env.BLOG_FRAMEWORK;
if (!['vue', 'react'].includes(framework ?? '')) throw new Error('Specify vue/react or BLOG_FRAMEWORK; deployment never chooses a framework implicitly.');
if (!['dev', 'build'].includes(mode)) throw new Error('Specify dev/build');
const rawPort = mode === 'dev' ? process.env.BLOG_DEV_PORT : undefined;
if (rawPort !== undefined && (!/^[1-9]\d{0,4}$/.test(rawPort) || Number(rawPort) > 65535)) throw new Error('BLOG_DEV_PORT must be an integer from 1 to 65535.');
const port = rawPort === undefined ? framework === 'vue' ? 5173 : 5174 : Number(rawPort);
const configFile = process.env.BLOG_CONFIG ?? 'blog.config.json';
const config = await loadConfig(configFile);
const base = basePath(process.env.BLOG_BASE_PATH ?? config.basePath);
const outputDir = path.resolve(process.env.BLOG_OUTPUT_DIR ?? `dist/${framework}`), contentDir = process.env.BLOG_CONTENT_DIR ?? 'content';
if (mode === 'build') {
  await assertProjectOutput(outputDir, configFile);
  if (config.source.kind === 'static') await assertSeparatePaths(contentDir, outputDir);
}
const instance = mode === 'dev' ? `dev-${framework}-${port}-${crypto.randomUUID()}` : `build-${framework}-${crypto.randomUUID()}`;
const generatedRoot = path.resolve('.generated', instance);
let devServer: ViteDevServer | undefined, devRunning = false;
try {
  const content = config.source.kind === 'static'
    ? await buildContent({ contentDir, outputDir: path.join(generatedRoot, 'public') })
    : undefined;
  const options = {
    root: path.resolve(`apps/blog-${framework}`), base,
    cacheDir: path.join(generatedRoot, 'vite-cache'),
    optimizeDeps: { force: mode === 'dev' && process.argv.slice(4).includes('--force') },
    publicDir: content?.outputDir ?? false as const,
    plugins: mode === 'dev' ? [{ name: 'blog-dev-instance-cleanup', async closeServer({ reason }: { reason: 'close' | 'restart' }) {
      // Vite's own SIGTERM handler awaits this hook before exiting the process.
      if (reason === 'close') await rm(generatedRoot, { recursive: true, force: true });
    } }] : [],
    define: { __BLOG_CONFIG__: JSON.stringify({ ...config, basePath: base }), __BUILD_ID__: JSON.stringify(content?.buildId ?? ''), __FRAMEWORK__: JSON.stringify(framework),
      ...(framework === 'vue' ? { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } : {}) },
    server: { host: '127.0.0.1', port, strictPort: true, fs: { allow: [process.cwd()] } },
    build: { outDir: outputDir, emptyOutDir: true, target: 'es2022' },
  };
  if (mode === 'dev') {
    devServer = await createServer(options);
    await devServer.listen(); devServer.printUrls(); devRunning = true;
    let closing: Promise<void> | undefined;
    const close = (): Promise<void> => closing ??= (async () => {
      try { await devServer!.close(); }
      finally { await rm(generatedRoot, { recursive: true, force: true }); }
    })();
    const stop = (): void => { void close().then(() => process.exit(0), error => { console.error(error); process.exit(1); }); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }
  else {
    const output = options.build.outDir, stage = `${output}.stage-${crypto.randomUUID()}`, backup = `${output}.previous-${crypto.randomUUID()}`;
    try {
      await build({ ...options, build: { ...options.build, outDir: stage } });
      await mkdir(path.dirname(output), { recursive: true }); let backedUp = false;
      try {
        try { await rename(output, backup); backedUp = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
        await rename(stage, output);
      } catch (e) { if (backedUp) await rename(backup, output); await rm(stage, { recursive: true, force: true }); throw e; }
      if (backedUp) await rm(backup, { recursive: true, force: true });
      console.log(`Built ${framework}: ${content?.buildId ?? 'HTTP source configured'}`);
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
} finally {
  if (!devRunning) {
    try { await devServer?.close(); }
    finally { await rm(generatedRoot, { recursive: true, force: true }); }
  }
}
