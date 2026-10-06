import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Diagnostics contain only fixed labels, numeric counts and locations in public source files.
// Never copy arbitrary log lines, assertion values, URLs or absolute runner paths.
export function selectVerificationFailure(log: string, publicFiles: readonly string[]) {
  const text = log.replace(/\u001b\[[0-9;]*m/g, '');
  const phases = [...text.matchAll(/^> content-driven-blog@\d+\.\d+\.\d+ (typecheck|check:boundaries|test|build:vue|build:react|test:e2e)$/gm)];
  const allowed = new Set(publicFiles.filter(file => /^(apps|packages|scripts|tests)\/[A-Za-z0-9_./-]+\.(ts|tsx|vue)$/.test(file)));
  const locations = new Map<string, { file: string; line: number; column: number }>();
  for (const match of text.matchAll(/((?:apps|packages|scripts|tests)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|vue))[:(](\d{1,6})[:,](\d{1,6})/g)) {
    if (allowed.has(match[1])) locations.set(match[1] + ':' + match[2] + ':' + match[3], { file: match[1], line: Number(match[2]), column: Number(match[3]) });
  }
  const errorCodes = [...new Set([...text.matchAll(/\b(TS\d{4,5}|ERR_ASSERTION|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|ENOENT)\b/g)].map(match => match[1]))];
  const counts: Record<string, number> = {};
  for (const match of text.matchAll(/^(?:ℹ|#) (tests|pass|fail|cancelled|skipped) (\d{1,6})$/gm)) counts[match[1]] = Number(match[2]);
  const failureKinds: string[] = [];
  if (/TimeoutError|Error: Timed out waiting/.test(text)) failureKinds.push('timeout');
  if (/AssertionError|ERR_ASSERTION/.test(text)) failureKinds.push('assertion');
  if (/config\.webServer/.test(text)) failureKinds.push('browser-server');
  return { schemaVersion: 1, phase: phases.at(-1)?.[1] ?? 'unknown', counts, errorCodes, failureKinds, sourceLocations: [...locations.values()].slice(0, 20) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error('Provide the local verification log path.');
  const publicFiles = execFileSync('git', ['ls-files', '--', 'apps', 'packages', 'scripts', 'tests'], { encoding: 'utf8' }).split('\n');
  const report = selectVerificationFailure(readFileSync(process.argv[2], 'utf8'), publicFiles);
  console.log('::error title=Blog verification metadata::' + JSON.stringify(report));
}
