import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectVerificationFailure } from '../scripts/ci-diagnostics.ts';

test('CI failure metadata excludes arbitrary logs, credentials, private paths and untracked sources', () => {
  const credential = 'private-fixture-credential';
  const log = `> content-driven-blog@0.1.0 typecheck\n> content-driven-blog@0.1.0 test\nℹ tests 153\nℹ pass 152\nℹ fail 1\nAssertionError [ERR_ASSERTION]: ${credential}\n` +
    `at /home/private-runner/Blog/tests/source.test.ts:42:7\nat /private/tests/untracked.ts:10:1\n` +
    `https://private.example/?token=${credential}\nerror TS2345: ${credential}\nSECRET=${credential}\n`;
  const result = selectVerificationFailure(log, ['tests/source.test.ts', '.env']);
  assert.deepEqual(result, { schemaVersion: 1, phase: 'test', counts: { tests: 153, pass: 152, fail: 1 },
    errorCodes: ['ERR_ASSERTION', 'TS2345'], failureKinds: ['assertion'], sourceLocations: [{ file: 'tests/source.test.ts', line: 42, column: 7 }] });
  const output = JSON.stringify(result);
  for (const privateValue of [credential, 'private-runner', 'private.example', 'untracked', 'SECRET', '.env']) assert.ok(!output.includes(privateValue));
});

test('CI failure metadata handles compiler and browser locations while bounding and deduplicating output', () => {
  const log = '\u001b[31m> content-driven-blog@0.1.0 test:e2e\u001b[0m\nError: Timed out waiting for config.webServer\n' +
    'scripts/site.ts(12,5): error TS2345\nat scripts/site.ts:12:5\n' +
    Array.from({ length: 30 }, (_, line) => `tests/browser/blog.spec.ts:${line + 1}:3`).join('\n');
  const result = selectVerificationFailure(log, ['scripts/site.ts', 'tests/browser/blog.spec.ts']);
  assert.equal(result.phase, 'test:e2e'); assert.deepEqual(result.errorCodes, ['TS2345']);
  assert.deepEqual(result.failureKinds, ['timeout', 'browser-server']);
  assert.equal(result.sourceLocations.length, 20); assert.deepEqual(result.sourceLocations[0], { file: 'scripts/site.ts', line: 12, column: 5 });
  assert.deepEqual(selectVerificationFailure('arbitrary text', []), { schemaVersion: 1, phase: 'unknown', counts: {}, errorCodes: [], failureKinds: [], sourceLocations: [] });
});
