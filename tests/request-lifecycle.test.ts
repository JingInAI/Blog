import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { RequestListener } from 'node:http';
import { ContentSourceError } from '@blog/contracts';
import { requestJson } from '@blog/content-source';
import type { FetchPort } from '@blog/content-source';
import { deferred } from './support.ts';

async function withServer(handle: RequestListener, run: (base: string) => Promise<void>): Promise<void> {
  const server = createServer(handle);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}/`); }
  finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
    });
    assert.equal(server.listening, false);
  }
}

test('T04: real HTTP cancellation before headers and during JSON body closes the request and permits a fresh read', { timeout: 10000 }, async () => {
  for (const phase of ['headers', 'body'] as const) {
    const entered = deferred<void>(), headers = deferred<void>(), disconnected = deferred<void>();
    await withServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/healthy') { res.end(JSON.stringify({ authored: '作者正文' })); return; }
      res.once('close', () => disconnected.resolve());
      if (phase === 'body') { res.flushHeaders(); res.write('{"authored":'); }
      entered.resolve();
    }, async base => {
      const abort = new AbortController();
      const fetchPort: FetchPort = async (url, init) => { const response = await fetch(url, init); headers.resolve(); return response; };
      const pending = requestJson(base + 'pending', { signal: abort.signal, fetch: fetchPort });
      const rejected = assert.rejects(pending, error => error instanceof Error && error.name === 'AbortError');
      await entered.promise; if (phase === 'body') await headers.promise;
      abort.abort(); await rejected; await disconnected.promise;
      assert.deepEqual(await requestJson(base + 'healthy'), { authored: '作者正文' });
    });
  }
});

test('T04: timeout covers real streamed JSON body, releases the connection and allows explicit retry', { timeout: 10000 }, async () => {
  const headers = deferred<void>(), disconnected = deferred<void>(); let attempts = 0;
  await withServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (++attempts === 1) {
      res.once('close', () => disconnected.resolve()); res.flushHeaders(); res.write('{"authored":');
    } else res.end(JSON.stringify({ authored: '重试时作者提供的正文' }));
  }, async base => {
    const fetchPort: FetchPort = async (url, init) => { const response = await fetch(url, init); headers.resolve(); return response; };
    const rejected = assert.rejects(requestJson(base, { timeoutMs: 1000, fetch: fetchPort }), error => error instanceof ContentSourceError && error.detail.code === 'timeout' && error.detail.retryable);
    await headers.promise; await rejected; await disconnected.promise;
    assert.equal(attempts, 1);
    assert.deepEqual(await requestJson(base, { timeoutMs: 1000 }), { authored: '重试时作者提供的正文' });
    assert.equal(attempts, 2);
  });
});

for (const reason of ['cancel', 'timeout'] as const) {
  test(`T04: an injected transport completing JSON after ${reason} cannot return stale success`, { timeout: 10000 }, async () => {
    const parsing = deferred<void>(), cancelled = deferred<void>(), body = deferred<ArrayBuffer>();
    const abort = new AbortController();
    const fetchPort: FetchPort = async (_url, init) => {
      init!.signal!.addEventListener('abort', () => cancelled.resolve(), { once: true });
      const response = new Response('{}');
      response.arrayBuffer = () => { parsing.resolve(); return body.promise; };
      return response;
    };
    const pending = requestJson('https://transport.invalid/', { fetch: fetchPort, signal: abort.signal, timeoutMs: 1000 });
    const rejected = assert.rejects(pending, error => reason === 'cancel'
      ? error instanceof Error && error.name === 'AbortError'
      : error instanceof ContentSourceError && error.detail.code === 'timeout');
    await parsing.promise;
    if (reason === 'cancel') abort.abort();
    await cancelled.promise; body.resolve(new TextEncoder().encode(JSON.stringify({ authored: '已经过期的响应' })).buffer); await rejected;
  });
}

test('T04: non-success streamed HTTP bodies close immediately while preserving status errors', { timeout: 15000 }, async () => {
  for (const [status, code] of [[404, 'not-found'], [401, 'unauthorized'], [403, 'forbidden'], [429, 'unavailable'], [503, 'unavailable'], [400, 'invalid-response']] as const) {
    const disconnected = deferred<void>(); let attempts = 0;
    await withServer((_req, res) => {
      ++attempts; res.once('close', () => disconnected.resolve());
      res.writeHead(status, { 'Content-Type': 'application/json' }); res.write('{"unfinished":');
    }, async base => {
      await assert.rejects(requestJson(base), error => error instanceof ContentSourceError && error.detail.code === code);
      const closed = await Promise.race([disconnected.promise.then(() => true), delay(1000).then(() => false)]);
      assert.equal(closed, true, `unconsumed ${status} body must not keep the connection open`); assert.equal(attempts, 1);
    });
  }
});

test('T04: a response arriving after cancellation releases its unconsumed body', async () => {
  const pending = deferred<Response>(), started = deferred<void>(); let cancellations = 0;
  const abort = new AbortController();
  const rejected = assert.rejects(requestJson('https://transport.invalid/', { signal: abort.signal, fetch: async () => { started.resolve(); return pending.promise; } }), error => error instanceof Error && error.name === 'AbortError');
  await started.promise; abort.abort();
  pending.resolve(new Response(new ReadableStream({ cancel() { ++cancellations; } })));
  await rejected; await delay(0); assert.equal(cancellations, 1);
});
