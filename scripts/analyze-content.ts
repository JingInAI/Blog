import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, lstat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeUtf8, readerTags, ValidationError } from '@blog/contracts';
import { processBody, retainReadingReferences, selectReadingSections } from '@blog/render-core';
import { parsePost } from './build-content/index.ts';
import { assertProjectOutput, assertSeparatePaths } from './output.ts';

const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export async function analyzeContent(file: string) {
  const sourceFile = path.resolve(file), bytes = await readFile(sourceFile), text = decodeUtf8(bytes, sourceFile);
  const record = parsePost(text);
  // Resource resolution is lexical: no requests are sent to this placeholder origin.
  const parsed = processBody(record, { kind: 'http', sourceId: 'local-analysis', resourceBaseUrl: 'https://analysis.invalid/' });
  return { schemaVersion: 1, sourceFile, sourceFileSha256: hash(bytes), bodySha256: hash(record.body.value),
    bodyOffsetInFile: text.length - record.body.value.length, offsetUnit: 'UTF-16 code units', publication: record.publication,
    structure: parsed.body.structure, tags: readerTags,
    tagMatches: readerTags.map(tag => ({ tagId: tag.id, ...retainReadingReferences(parsed.body, selectReadingSections(parsed.body.structure, { tagIds: [tag.id], scope: 'selected', mode: 'matched' })) })) };
}
export async function writeAnalysis(file: string): Promise<string> {
  const report = await analyzeContent(file), directory = path.resolve('.generated/reader-analysis');
  const output = path.join(directory, encodeURIComponent(report.structure.contentId) + '.json');
  await assertProjectOutput(directory, 'blog.config.json');
  await assertSeparatePaths(report.sourceFile, directory);
  await assertSeparatePaths(report.sourceFile, output);
  try { if ((await lstat(output)).isSymbolicLink()) throw new ValidationError(output, 'symlink-not-allowed'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(directory, { recursive: true });
  // Replace the directory entry, never truncate an existing inode shared with the source.
  const temporary = path.join(directory, '.' + randomUUID() + '.tmp');
  try { await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, output); }
  finally { await rm(temporary, { force: true }); }
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error('Usage: npm run analyze:content -- <article.md>');
  console.log(await writeAnalysis(process.argv[2] ?? 'content/posts/understanding-rsi.md'));
}
