import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

interface DiagnosticOptions {
  repository: string; commit: string; runId: string; token: string;
  fetchImpl?: typeof fetch;
}
type Observation<T> = { status: number; data?: T; error?: 'invalid-response' } | { status: null; error: 'network' | 'timeout' };
interface RepositoryFacts { private: boolean; hasPages: boolean; }
interface PagesFacts { buildType: 'workflow' | 'legacy'; siteUrl: string; }

// Only selected facts are retained. API messages, headers and arbitrary fields are never recorded.
export async function collectPagesDiagnostics(options: DiagnosticOptions) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\/[a-zA-Z0-9_.-]+$/.test(options.repository)
    || ['.', '..'].includes(options.repository.split('/')[1])
    || !/^[a-f0-9]{40}$/.test(options.commit) || !/^[1-9][0-9]*$/.test(options.runId)
    || !options.token || /[\x00-\x20\x7f]/.test(options.token)) throw new Error('Invalid diagnostic context or missing GitHub token.');
  const get = async <T>(suffix: string, select: (data: unknown) => T): Promise<Observation<T>> => {
    const signal = AbortSignal.timeout(15000);
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(`https://api.github.com/repos/${options.repository}${suffix}`, {
        method: 'GET', redirect: 'error', credentials: 'omit', signal,
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'content-driven-blog-pages-diagnostics' }
      });
    } catch { return { status: null, error: signal.aborted ? 'timeout' : 'network' }; }
    if (response.status !== 200) return { status: response.status };
    try { return { status: 200, data: select(await response.json()) }; }
    catch { return { status: 200, error: 'invalid-response' }; }
  };
  const [repository, pages] = await Promise.all([
    get('', data => {
      const value = data as Record<string, unknown> | null;
      if (!value || typeof value.private !== 'boolean' || typeof value.has_pages !== 'boolean') throw new Error('Invalid repository response.');
      return { private: value.private, hasPages: value.has_pages };
    }),
    get('/pages', data => {
      const value = data as Record<string, unknown> | null;
      if (!value || typeof value.build_type !== 'string' || !['workflow', 'legacy'].includes(value.build_type) || typeof value.html_url !== 'string') throw new Error('Invalid Pages response.');
      const url = new URL(value.html_url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid Pages URL.');
      return { buildType: value.build_type as PagesFacts['buildType'], siteUrl: url.href };
    })
  ]) as [Observation<RepositoryFacts>, Observation<PagesFacts>];
  return { schemaVersion: 1, producer: 'content-driven-blog-pages-diagnostics',
    repository: options.repository, commit: options.commit, runId: options.runId,
    runUrl: `https://github.com/${options.repository}/actions/runs/${options.runId}`,
    observedAt: new Date().toISOString(), repositoryObservation: repository, pagesObservation: pages };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await collectPagesDiagnostics({ repository: process.env.GITHUB_REPOSITORY ?? '', commit: process.env.GITHUB_SHA ?? '',
    runId: process.env.GITHUB_RUN_ID ?? '', token: process.env.GITHUB_TOKEN ?? '' });
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, '\n## Limited authenticated Pages diagnostics\n\n```json\n' + json + '\n```\n');
}
