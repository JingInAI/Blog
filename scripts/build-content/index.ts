import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat, lstat, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { contentRecord, decodeUtf8, parseJson, siteInfo, toSummary, compareIds, ValidationError } from '@blog/contracts';
import type { ContentRecord, Manifest, SiteInfo } from '@blog/contracts';
import { collectResourceReferences, processBody } from '@blog/render-core';
import { assertOutputDirectory, assertSeparatePaths } from '../output.ts';
const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
async function optionalRead(file: string): Promise<string | undefined> {
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new ValidationError(file, 'symlink-not-allowed');
    return decodeUtf8(await readFile(file), file);
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
}
async function postFiles(directory: string): Promise<string[]> {
  let entries; try {
    if ((await lstat(directory)).isSymbolicLink()) throw new ValidationError(directory, 'symlink-not-allowed');
    entries = await readdir(directory, { withFileTypes: true });
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  const files: string[] = [];
  for (const e of entries) {
    if (e.isSymbolicLink()) throw new ValidationError(path.join(directory, e.name), 'symlink-not-allowed');
    if (e.isDirectory()) files.push(...await postFiles(path.join(directory, e.name)));
    else if (e.name.endsWith('.md')) files.push(path.join(directory, e.name));
    else if (e.name !== '.gitkeep') throw new ValidationError(path.join(directory, e.name), 'unsupported-content-file');
  }
  return files.sort();
}
export function parsePost(text: string): ContentRecord {
  const opening = text.startsWith('---\r\n') ? 5 : text.startsWith('---\n') ? 4 : 0;
  if (!opening) throw new ValidationError('frontmatter', 'required');
  const end = /\r?\n---(?:\r?\n|$)/.exec(text.slice(opening));
  if (!end || end.index === undefined) throw new ValidationError('frontmatter', 'malformed');
  let metadata: unknown; try { metadata = parseJson(text.slice(opening, opening + end.index)); } catch { throw new ValidationError('frontmatter', 'invalid-json'); }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || Object.hasOwn(metadata, 'body')) throw new ValidationError('frontmatter.body', 'unknown-field');
  const body = text.slice(opening + end.index + end[0].length);
  return contentRecord({ ...metadata, body: { format: 'markdown', value: body } });
}
interface BuildOptions { contentDir: string; outputDir: string; }
export async function buildContent(options: BuildOptions): Promise<{ buildId: string; outputDir: string; manifest: Manifest }> {
  const content = path.resolve(options.contentDir), records: ContentRecord[] = [], seen = new Set<string>();
  try { if (!(await stat(content)).isDirectory()) throw new Error('not-directory'); }
  catch { throw new ValidationError(content, 'invalid-content-directory'); }
  await assertSeparatePaths(content, options.outputDir);
  await assertOutputDirectory(options.outputDir);
  const siteRaw = await optionalRead(path.join(content, 'site.json'));
  let site: SiteInfo;
  try { site = siteRaw === undefined ? { schemaVersion: 1 } : siteInfo(parseJson(siteRaw)); }
  catch (e) { throw new Error(`${path.join(content, 'site.json')}: ${(e as Error).message}`); }
  for (const file of await postFiles(path.join(content, 'posts'))) {
    try {
      const record = parsePost(decodeUtf8(await readFile(file), file));
      if (seen.has(record.id)) throw new ValidationError('item.id', 'duplicate-id'); seen.add(record.id);
      records.push(record);
    } catch (e) { throw new Error(`${file}: ${(e as Error).message}`); }
  }
  const published = records.filter(r => r.publication === 'published').sort((a, b) => compareIds(a.id, b.id));
  const assets = new Map<string, { data: Buffer; fileName: string }>();
  const maps = new Map<string, Record<string, { publishedUrl: string }>>();
  for (const record of published) {
    const refs = collectResourceReferences(record), map: Record<string, { publishedUrl: string }> = Object.create(null);
    for (const ref of refs) {
      if (/^[a-z][a-z\d+.-]*:/i.test(ref) || ref.startsWith('//') || ref.startsWith('/') || /[?#\\]/.test(ref)) throw new ValidationError(`content.${record.id}.resource`, 'unsafe-resource');
      let local: string;
      try {
        const parts = ref.split('/').map(part => decodeURIComponent(part));
        if (parts.some(part => /[/\\\p{Cc}]/u.test(part))) throw new Error('invalid-resource-path');
        local = path.resolve(content, ...parts);
      } catch { throw new ValidationError(`content.${record.id}.resource`, 'unsafe-resource'); }
      let resolved: string, assetRoot: string;
      try {
        if ((await lstat(path.join(content, 'assets'))).isSymbolicLink()) throw new ValidationError(`content.${record.id}.resource`, 'resource-escape');
        [resolved, assetRoot] = await Promise.all([realpath(local), realpath(path.join(content, 'assets'))]);
      }
      catch (e) { if (e instanceof ValidationError) throw e; throw new ValidationError(`content.${record.id}.resource`, 'unresolved-resource'); }
      if (!resolved.startsWith(assetRoot + path.sep) || !(await stat(resolved)).isFile()) throw new ValidationError(`content.${record.id}.resource`, 'resource-escape');
      const data = await readFile(resolved), suffix = path.extname(resolved).toLowerCase();
      const fileName = `${hash(data)}${/^[.][a-z0-9]{1,12}$/.test(suffix) ? suffix : ''}`;
      assets.set(fileName, { data, fileName }); map[ref] = { publishedUrl: fileName };
    }
    maps.set(record.id, map);
  }
  const buildId = hash(JSON.stringify({ site, records: published, assets: [...assets.keys()].sort() }));
  const prefix = `content/${buildId}/`, contents: Manifest['contents'] = Object.create(null);
  const files = new Map<string, string | Buffer>();
  const addJson = (name: string, value: unknown): string => { const json = JSON.stringify(value); const filename = `${name}-${hash(json)}.json`; files.set(filename, json); return prefix + filename; };
  for (const record of published) {
    const assetsByReference = Object.fromEntries(Object.entries(maps.get(record.id)!).map(([ref, e]) => [ref, { publishedUrl: `${prefix}assets/${e.publishedUrl}` }]));
    try { processBody(record, { kind: 'static', sourceId: 'build-validation', buildId, assetsByReference: Object.fromEntries(Object.entries(assetsByReference).map(([ref, e]) => [ref, { publishedUrl: new URL(e.publishedUrl, 'https://build.invalid/').href }])) }); }
    catch (e) { throw new Error(`content:${record.id}: ${(e as Error).message}`); }
    contents[record.id] = { url: addJson('body', { schemaVersion: 1, buildId, item: record }), assetsByReference };
  }
  for (const asset of assets.values()) files.set(`assets/${asset.fileName}`, asset.data);
  const manifest: Manifest = { schemaVersion: 1, buildId, siteUrl: addJson('site', { schemaVersion: 1, buildId, site }), catalogUrl: addJson('catalog', { schemaVersion: 1, buildId, items: published.map(toSummary) }), contents };
  const manifestUrl = addJson('manifest', manifest);
  const output = path.resolve(options.outputDir), stage = `${output}.stage-${crypto.randomUUID()}`, backup = `${output}.previous-${crypto.randomUUID()}`;
  // Validation finishes before any existing output is touched.
  try {
    await mkdir(path.join(stage, prefix), { recursive: true });
    for (const [name, data] of files) { const dest = path.join(stage, prefix, name); await mkdir(path.dirname(dest), { recursive: true }); await writeFile(dest, data); }
    await writeFile(path.join(stage, 'content/current.json'), JSON.stringify({ schemaVersion: 1, buildId, manifestUrl }));
    await mkdir(path.dirname(output), { recursive: true }); let backedUp = false;
    try {
      try { await rename(output, backup); backedUp = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
      await rename(stage, output);
    } catch (e) { if (backedUp) await rename(backup, output); throw e; }
    if (backedUp) await rm(backup, { recursive: true, force: true });
    return { buildId, outputDir: output, manifest };
  } finally { await rm(stage, { recursive: true, force: true }); }
}
