import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPagesDiagnostics } from '../scripts/pages-diagnostics.ts';
const context = { repository: 'JingInAI/Blog', commit: 'a'.repeat(40), runId: '123', token: 'test-only-credential' };
test('Pages diagnostics retain exact selected facts and restrict authenticated requests to GitHub', async () => {
  const calls: string[] = [];
  const report = await collectPagesDiagnostics({ ...context, fetchImpl: async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(new URL(url).origin, 'https://api.github.com');
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer ' + context.token);
    return Response.json(url.endsWith('/pages') ? { build_type: 'workflow', html_url: 'https://jinginai.github.io/Blog/', extra: context.token }
      : { private: true, has_pages: true, description: context.token, permissions: { admin: true } });
  } });
  assert.deepEqual(calls.sort(), ['https://api.github.com/repos/JingInAI/Blog', 'https://api.github.com/repos/JingInAI/Blog/pages']);
  assert.deepEqual(report.repositoryObservation, { status: 200, data: { private: true, hasPages: true } });
  assert.deepEqual(report.pagesObservation, { status: 200, data: { buildType: 'workflow', siteUrl: 'https://jinginai.github.io/Blog/' } });
  assert.ok(!JSON.stringify(report).includes(context.token));
});
test('Pages diagnostics preserve missing-site and authorization statuses without copying error bodies', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const report = await collectPagesDiagnostics({ ...context, fetchImpl: async input => String(input).endsWith('/pages')
      ? Response.json({ message: context.token }, { status }) : Response.json({ private: false, has_pages: false }) });
    assert.deepEqual(report.repositoryObservation, { status: 200, data: { private: false, hasPages: false } });
    assert.deepEqual(report.pagesObservation, { status });
    assert.ok(!JSON.stringify(report).includes(context.token));
  }
});
test('Pages diagnostics reject malformed responses and never retain credentials from URLs or transport errors', async () => {
  for (const body of [{ build_type: ['workflow'], html_url: 'https://example.com/' },
    { build_type: 'workflow', html_url: 'https://user:password@example.com/' }, { build_type: 'workflow', html_url: 'https://example.com/?token=secret' },
    { build_type: 'workflow', html_url: 'javascript:alert(1)' }]) {
    const report = await collectPagesDiagnostics({ ...context, fetchImpl: async () => Response.json(body) });
    assert.deepEqual(report.pagesObservation, { status: 200, error: 'invalid-response' });
    assert.deepEqual(report.repositoryObservation, { status: 200, error: 'invalid-response' });
  }
  const report = await collectPagesDiagnostics({ ...context, fetchImpl: async () => { throw new Error(context.token); } });
  assert.deepEqual(report.pagesObservation, { status: null, error: 'network' });
  assert.ok(!JSON.stringify(report).includes(context.token));
});
test('Pages diagnostics validate context before making any authenticated request', async () => {
  for (const invalid of [{ repository: '../Blog' }, { repository: 'JingInAI/..' }, { repository: 'JingInAI/Blog?secret' }, { commit: 'main' }, { runId: '12/3' }, { token: '' }]) {
    await assert.rejects(collectPagesDiagnostics({ ...context, ...invalid, fetchImpl: async () => { assert.fail('Must not request GitHub.'); } }), /Invalid diagnostic context/);
  }
});
