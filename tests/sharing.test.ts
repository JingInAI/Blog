import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShareUrl, parseShare, parseRoute, routeHash } from '@blog/render-core';
import { sessionUrlPort, browserStorage } from '../apps/shared/host.ts';
import { config, shareSearch } from './support.ts';
test('T12: root/subpath share and Unicode detail use one encoding with exact source identity', () => {
  for (const base of ['https://site.test/', 'https://site.test/Blog/']) {
    const url = new URL(createShareUrl(base, 'test', config(['编号%+😀']), { kind: 'detail', id: '编号%+😀' }, 'react'));
    assert.ok(url.href.startsWith(base)); assert.equal(parseShare(url.search, 'test', 'vue').state.status, 'valid');
    assert.deepEqual(parseRoute(url.hash), { kind: 'detail', id: '编号%+😀' });
    assert.ok(url.search.includes('%252B') === false); assert.deepEqual(parseRoute(routeHash({ kind: 'detail', id: '%' })), { kind: 'detail', id: '%' });
  }
  assert.equal(parseShare(shareSearch(config()), 'other', 'react').state.status, 'invalid');
  for (const base of ['https://u:p@site.test/', 'https://site.test/?token=a', 'https://site.test/#x', 'file:///tmp']) assert.throws(() => createShareUrl(base, 'test', config(), { kind: 'home' }, 'react'));
});
test('T12: malformed, duplicate, unknown, double-encoded and lossy share input cannot fall back', () => {
  const json = JSON.stringify({ sourceId: 'test', config: config() });
  for (const search of ['?share=', '?share=%', '?share=%FF', '?share=a', '?share=' + encodeURIComponent(encodeURIComponent(json)), '?share=' + encodeURIComponent(json) + '&sha%72e=' + encodeURIComponent(json), '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'test', config: config(), unknown: true }))]) assert.equal(parseShare(search, 'test', 'react').state.status, 'invalid');
  assert.equal(parseShare('?unrelated=value', 'test', 'vue').state.status, 'absent');
  assert.throws(() => parseRoute('#/content/%FF')); assert.throws(() => parseRoute('#/unexpected'));
});
test('T12: raw and normalized 8192-byte limits include UTF-8 bytes; whitespace cannot bypass', () => {
  const json = JSON.stringify({ sourceId: 'test', config: config(['多字节']) });
  const bytes = new TextEncoder().encode(json).length;
  for (const limit of [8191, 8192, 8193]) {
    const raw = json + ' '.repeat(limit - bytes);
    const parsed = parseShare('?share=' + encodeURIComponent(raw), 'test', 'react');
    assert.equal(parsed.state.status, limit > 8192 ? 'invalid' : 'valid');
    if (parsed.state.status === 'invalid') assert.equal(parsed.state.code, 'too-large');
  }
  const giant = config(Array.from({ length: 100 }, (_, i) => '😀'.repeat(80) + i));
  assert.throws(() => createShareUrl('https://site.test/', 'test', giant, { kind: 'home' }, 'react'), /too-large/);
});
test('T08/T12: URL port preserves target/unrelated query, verifies address, has no post-commit work', () => {
  let current = { target: { kind: 'detail' as const, id: 'a' }, search: '?x=%2B&share=bad&sha%72e=duplicate' }; let written = '';
  const port = sessionUrlPort(() => current, () => 'https://site.test/Blog/' + current.search + '#/content/a', url => { written = url; });
  const next = port.removeShare(current); assert.equal(next.search, '?x=%2B'); assert.ok(written.endsWith('#/content/a'));
  assert.throws(() => port.removeShare({ ...current, search: '?share=other' }), /url-update-failed/);
  current = { ...current, search: '?x=1' }; written = ''; assert.deepEqual(port.removeShare(current), current); assert.equal(written, '');
  assert.throws(() => sessionUrlPort(() => current, () => 'https://site.test/?x=1&share=bad', () => { throw new Error('history'); }).removeShare({ ...current, search: '?share=bad' }), /url-update-failed/);
});
test('T08: storage getter is lazy and blocked reads never become missing records', () => {
  let calls = 0; const storage = browserStorage(() => { ++calls; throw new Error('blocked'); });
  assert.equal(calls, 0); assert.throws(() => storage.read('key'), /storage-unavailable/); assert.equal(calls, 1);
  const readFail = browserStorage(() => ({ getItem() { throw new Error('read'); } }) as unknown as Storage);
  assert.throws(() => readFail.read('key'), /storage-read-failed/);
});
