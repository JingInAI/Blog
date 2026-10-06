import { abortError, directoryUrl, object, string } from '@blog/contracts';
import type { CurrentPointer, DeploymentProbeEvent, DeploymentProbePort, DeploymentProbeResult } from '@blog/contracts';
import { confinedUrl, requestJson, requestTimeout, versionBaseUrl, waitWithSignal } from './request.ts';
import type { FetchPort } from './request.ts';
export function pointer(value: unknown, baseUrl: string): CurrentPointer {
  const o = object(value, ['schemaVersion', 'buildId', 'manifestUrl'], 'pointer');
  if (o.schemaVersion !== 1) throw new Error('invalid-pointer');
  const buildId = string(o.buildId, 'pointer.buildId', true);
  return { schemaVersion: 1, buildId, manifestUrl: confinedUrl(confinedUrl(o.manifestUrl, baseUrl), versionBaseUrl(baseUrl, buildId)) };
}
export class DeploymentProbe implements DeploymentProbePort {
  private listeners = new Set<(e: DeploymentProbeEvent) => void>();
  private generation = 0;
  private inflight?: Promise<DeploymentProbeResult>;
  private confirmed?: DeploymentProbeResult;
  private abort?: AbortController;
  private disposed = false;
  private readonly base: string;
  constructor(private readonly options: { sourceInstanceId: string; buildId: string; baseUrl: string; fetch?: FetchPort; timeoutMs?: number }) {
    this.options = Object.freeze({ ...options });
    requestTimeout(this.options.timeoutMs);
    this.base = directoryUrl(this.options.baseUrl); versionBaseUrl(this.base, this.options.buildId);
  }
  subscribe(listener: (e: DeploymentProbeEvent) => void): () => void { if (!this.disposed) this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  check(signal?: AbortSignal): Promise<DeploymentProbeResult> {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError());
    if (this.confirmed) return waitWithSignal(Promise.resolve(this.confirmed), signal);
    if (!this.inflight) {
      const probeGeneration = ++this.generation;
      this.abort = new AbortController();
      const url = new URL('content/current.json', this.base); url.searchParams.set('probe', String(probeGeneration));
      const task = (async (): Promise<DeploymentProbeResult> => {
        let observation: DeploymentProbeResult['observation'];
        try {
          const result = pointer(await requestJson(url.href, { fetch: this.options.fetch, timeoutMs: this.options.timeoutMs, signal: this.abort!.signal }), this.base);
          observation = { kind: result.buildId === this.options.buildId ? 'same' : 'different', observedBuildId: result.buildId };
        } catch { observation = { kind: 'failed' }; }
        if (this.disposed) throw abortError();
        const result: DeploymentProbeResult = { sourceInstanceId: this.options.sourceInstanceId, sessionBuildId: this.options.buildId, probeGeneration, observation };
        if (observation.kind === 'different') this.confirmed = result;
        this.emit({ phase: 'finished', result }); return result;
      })();
      this.inflight = task;
      this.emit({ phase: 'started', sourceInstanceId: this.options.sourceInstanceId, sessionBuildId: this.options.buildId, probeGeneration });
      void task.then(() => { if (this.inflight === task) this.inflight = undefined; }, () => { if (this.inflight === task) this.inflight = undefined; });
    }
    return waitWithSignal(this.inflight, signal);
  }
  private emit(event: DeploymentProbeEvent): void { for (const listener of this.listeners) listener(event); }
  dispose(): void { this.disposed = true; this.listeners.clear(); this.abort?.abort(); }
}
