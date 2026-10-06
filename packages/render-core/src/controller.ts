import { BootstrapError, BodyProcessError, ContentSourceError, StorageError, contentError, freeze, isAbort, parseJson, semanticEqual, validId } from '@blog/contracts';
import type { BootstrapState, CatalogState, ConfigStatus, ContentResult, DeploymentState, DisplayConfig, DisplayEvent, ItemState, LocationInput, PersonalReadState, PersonalStoragePort, RendererContext, RouteTarget, SessionUrlPort, SiteState, SourceRuntime, SourceRuntimeFactory, ThemeValidationIssue, ViewModel, DeploymentProbeEvent } from '@blog/contracts';
import { choices, normalizeConfig, ThemeConfigError, themeRegistry } from '@blog/theme-contracts';
import { processBody } from './body.ts';
import { createShareUrl, parseShare, sameShare, ShareProtocolError } from './sharing.ts';
type Operations = ViewModel['operations'];
interface Slot { id: string; seq: number; abort: AbortController; item: ItemState; }
interface ControllerOptions {
  frameworkId: string; siteId: string; factory: SourceRuntimeFactory; storage: PersonalStoragePort;
  sessionUrl: SessionUrlPort; shareBaseUrl: string; authorDefault?: unknown; initialLocation: LocationInput;
  registry?: typeof themeRegistry;
}
const idleOperations = (): Operations => ({ share: { status: 'idle' }, save: { status: 'idle' }, reset: { status: 'idle' }, recovery: { status: 'idle' } });
const emptySnapshot = (): CatalogState['snapshot'] => ({ items: [], diagnostics: [] });
export class BlogController {
  private options: ControllerOptions;
  private runtime?: SourceRuntime;
  private bootstrap: BootstrapState = { status: 'loading' };
  private bootAbort?: AbortController;
  private bootSequence = 0;
  private siteAbort?: AbortController;
  private siteSequence = 0;
  private catalogAbort?: AbortController;
  private catalogSequence = 0;
  private site: SiteState = { status: 'loading' };
  private catalog: CatalogState = { status: 'loading', snapshot: emptySnapshot(), retained: false };
  private deployment: DeploymentState;
  private generation = 0;
  private unsubscribeProbe?: () => void;
  private parsedShare: ReturnType<typeof parseShare>;
  private personalRead: PersonalReadState = { status: 'not-read' };
  private config?: DisplayConfig;
  private baseline?: DisplayConfig;
  private configuration: ConfigStatus = { origin: 'none', persistence: 'auto', dirty: false, saveStatus: 'not-saved' };
  private operations = idleOperations();
  private themeValidation: readonly ThemeValidationIssue[] = [];
  private notices: { code: string }[] = [];
  private location: LocationInput;
  private routeRevision = 0;
  private configRevision = 0;
  private resourceRevision = 0;
  private slots = new Map<string, Slot>();
  private detail?: Slot;
  private cursorHistory = new Set<string>();
  private failedUrls = new Set<string>();
  private blockedUrls = new Set<string>();
  private listeners = new Set<(model: ViewModel) => void>();
  private destroyed = false;
  private publishing = false;
  private started = false;
  constructor(options: ControllerOptions) {
    validId(options.siteId); validId(options.factory.identity.sourceId);
    this.options = options; this.location = structuredClone(options.initialLocation);
    this.parsedShare = this.parseLocation();
    this.deployment = options.factory.identity.kind === 'static' ? { status: 'checking', buildId: options.factory.identity.expectedBuildId } : { status: 'not-applicable' };
  }
  private get registry(): typeof themeRegistry { return this.options.registry ?? themeRegistry; }
  private get key(): string { return `blog:${encodeURIComponent(this.options.siteId)}:${encodeURIComponent(this.options.factory.identity.sourceId)}:display:v1`; }
  private normalize(value: unknown): DisplayConfig { return normalizeConfig(value, this.options.frameworkId, this.registry); }
  private parseLocation(): ReturnType<typeof parseShare> { return parseShare(this.location.search, this.options.factory.identity.sourceId, this.options.frameworkId, this.registry); }
  subscribe(listener: (model: ViewModel) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  start(): void { if (!this.started && !this.destroyed) { this.started = true; void this.initialize(); } }
  getModel(): ViewModel {
    const common = { site: this.site, shareInput: this.parsedShare.state, personalRead: this.personalRead, themes: choices(this.options.frameworkId, this.registry), navigation: { target: this.location.target, routeRevision: this.routeRevision }, deployment: this.deployment, themeValidation: this.themeValidation, configuration: this.configuration, operations: this.operations };
    let model: ViewModel;
    if (!this.runtime) model = { ...common, kind: 'bootstrap', bootstrap: this.bootstrap };
    else if (!this.config) model = { ...common, kind: 'configure', catalog: this.catalog, notices: this.notices };
    else if (this.location.target.kind === 'detail') model = { ...common, kind: 'detail', config: this.config, item: this.detail?.item ?? { id: this.location.target.id, status: 'loading' }, notices: this.notices };
    else {
      const items = this.config.contentIds.map(id => this.slots.get(id)?.item ?? { id, status: 'loading' as const });
      const loading = items.filter(i => i.status === 'loading').length, ready = items.filter(i => i.status === 'ready').length;
      const status = !items.length ? 'empty' : loading === items.length ? 'loading' : ready === items.length ? 'ready' : !loading && !ready ? 'error' : 'partial';
      model = { ...common, kind: 'page', page: { revision: this.configRevision, config: this.config, catalog: this.catalog, items, status, notices: this.notices } };
    }
    return freeze(structuredClone(model));
  }
  private emit(): void {
    if (this.destroyed) return;
    const model = this.getModel(); this.publishing = true;
    try { for (const listener of this.listeners) listener(model); } finally { this.publishing = false; }
  }
  private async initialize(): Promise<void> {
    if (this.destroyed) return;
    const sequence = ++this.bootSequence;
    this.bootAbort?.abort(); this.bootAbort = new AbortController(); this.bootstrap = { status: 'loading' };
    const factory = this.options.factory, abort = this.bootAbort;
    if (this.options.factory.identity.kind === 'static') this.deployment = { status: 'checking', buildId: this.options.factory.identity.expectedBuildId };
    this.emit();
    if (this.destroyed || sequence !== this.bootSequence) return;
    try {
      const runtime = await factory.initialize(abort.signal);
      if (this.destroyed || sequence !== this.bootSequence) { if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); return; }
      const identity = this.options.factory.identity;
      if (runtime.sourceId !== identity.sourceId || runtime.kind !== identity.kind || (runtime.kind === 'static' && identity.kind === 'static' && runtime.buildId !== identity.expectedBuildId)) {
        if (runtime.kind === 'static') runtime.deploymentProbe.dispose(); throw new BootstrapError({ kind: 'request', error: { code: 'invalid-response', retryable: false } });
      }
      this.runtime = runtime;
      if (runtime.kind === 'static') { this.deployment = { status: 'current', buildId: runtime.buildId }; this.unsubscribeProbe = runtime.deploymentProbe.subscribe(e => this.onProbe(e)); }
      this.initializeConfig();
      if (this.destroyed || this.runtime !== runtime || sequence !== this.bootSequence) return;
      this.emit();
      if (this.destroyed || this.runtime !== runtime || sequence !== this.bootSequence) return;
      void this.loadSite(); void this.loadCatalog();
    } catch (e) {
      if (this.destroyed || sequence !== this.bootSequence || isAbort(e)) return;
      const failure = e instanceof BootstrapError ? e.failure : { kind: 'request' as const, error: { code: 'invalid-response' as const, retryable: false } };
      this.bootstrap = { status: 'error', failure };
      if (this.options.factory.identity.kind === 'static') this.deployment = failure.kind === 'version' ? { status: 'changed', buildId: failure.expectedBuildId, observedBuildId: failure.observedBuildId } : { status: 'check-failed', buildId: this.options.factory.identity.expectedBuildId };
      this.emit();
    }
  }
  private readPersonal(): DisplayConfig | undefined {
    let raw: string | null;
    try { raw = this.options.storage.read(this.key); }
    catch (e) { this.personalRead = { status: 'error', code: e instanceof StorageError && e.code === 'storage-unavailable' ? 'storage-unavailable' : 'storage-read-failed' }; return; }
    if (raw === null) { this.personalRead = { status: 'missing' }; return; }
    try { const config = this.normalize(parseJson(raw)); this.personalRead = { status: 'valid' }; return config; }
    catch { this.personalRead = { status: 'invalid' }; return; }
  }
  private author(): DisplayConfig | undefined { return this.options.authorDefault === undefined ? undefined : this.normalize(this.options.authorDefault); }
  private initializeConfig(): void {
    this.notices = []; this.personalRead = { status: 'not-read' }; this.operations = idleOperations(); this.themeValidation = [];
    let config: DisplayConfig | undefined, origin: ConfigStatus['origin'] = 'none';
    if (this.parsedShare.state.status !== 'absent') { config = this.parsedShare.config; origin = 'share'; }
    else {
      config = this.readPersonal(); if (config) origin = 'personal';
      if (!config) { try { config = this.author(); if (config) origin = 'author-default'; } catch { this.notices.push({ code: 'invalid-author-default' }); } }
    }
    this.config = config; this.baseline = config;
    this.configuration = { origin, persistence: origin === 'share' ? 'explicit' : 'auto', dirty: false, saveStatus: origin === 'personal' ? 'saved' : 'not-saved' };
    ++this.configRevision; this.syncSlots(true);
  }
  setNavigation(target: RouteTarget): void { this.setLocation({ ...this.location, target }); }
  setLocation(location: LocationInput): void {
    if (this.destroyed) return;
    if (this.publishing) { const next = structuredClone(location); queueMicrotask(() => this.setLocation(next)); return; }
    if (location.target.kind === 'detail') validId(location.target.id);
    const changedTarget = !semanticEqual(location.target, this.location.target);
    this.location = structuredClone(location);
    const parsed = this.parseLocation(), changedShare = !sameShare(this.parsedShare, parsed);
    if (!changedTarget && !changedShare) return;
    if (changedTarget) { ++this.routeRevision; this.operations.share = { status: 'idle' }; }
    if (changedShare) { this.parsedShare = parsed; if (this.runtime) this.initializeConfig(); }
    else if (this.runtime && changedTarget) this.syncSlots(true);
    this.emit();
  }
  changeSource(factory: SourceRuntimeFactory): void {
    if (this.destroyed) return;
    if (this.publishing) { queueMicrotask(() => this.changeSource(factory)); return; }
    validId(factory.identity.sourceId);
    // Keep the current runtime intact unless the host can commit URL cleanup.
    if (this.parsedShare.state.status !== 'absent') this.cleanUrl();
    this.release(); this.options = { ...this.options, factory }; this.runtime = undefined;
    this.site = { status: 'loading' }; this.catalog = { status: 'loading', snapshot: emptySnapshot(), retained: false };
    this.failedUrls.clear(); this.blockedUrls.clear(); this.generation = 0; this.config = this.baseline = undefined;
    this.parsedShare = this.parseLocation(); this.personalRead = { status: 'not-read' }; this.operations = idleOperations(); this.themeValidation = []; this.notices = []; this.cursorHistory.clear();
    this.configuration = { origin: 'none', persistence: 'auto', dirty: false, saveStatus: 'not-saved' }; this.bootstrap = { status: 'loading' };
    this.deployment = factory.identity.kind === 'http' ? { status: 'not-applicable' } : { status: 'checking', buildId: factory.identity.expectedBuildId };
    if (this.started) void this.initialize(); else this.emit();
  }
  dispatch(event: DisplayEvent): void {
    if (this.destroyed) return;
    if (this.publishing) {
      let submitted: DisplayEvent;
      try { submitted = structuredClone(event); }
      catch {
        const type = event.type;
        queueMicrotask(() => {
          if (this.destroyed || !this.runtime) return;
          if (type === 'set-theme') this.themeValidation = [{ key: 'themeId', code: 'invalid-value' }];
          else if (type === 'set-content') this.notices = [{ code: 'invalid-content-selection' }];
          else return;
          this.emit();
        });
        return;
      }
      queueMicrotask(() => this.dispatch(submitted)); return;
    }
    if (!this.runtime) {
      if (event.type === 'retry-bootstrap' && this.bootstrap.status === 'error' && this.bootstrap.failure.kind === 'request' && this.bootstrap.failure.error.retryable) void this.initialize();
      return;
    }
    switch (event.type) {
      case 'set-theme': {
        const theme = this.registry.find(t => t.id === event.themeId);
        try { this.edit(this.normalize({ version: 1, contentIds: this.config?.contentIds ?? [], themeId: event.themeId, themeVersion: theme?.version, themeOptions: event.options })); }
        catch (e) { this.themeValidation = e instanceof ThemeConfigError ? e.issues : [{ key: 'themeId', code: 'invalid-value' }]; this.emit(); }
        return;
      }
      case 'set-content': {
        if (!this.config) return;
        try { this.edit(this.normalize({ ...this.config, contentIds: event.ids })); }
        catch { this.notices = [{ code: 'invalid-content-selection' }]; this.emit(); }
        return;
      }
      case 'retry-site': if (this.site.status === 'error' && this.site.error.retryable) void this.loadSite(); return;
      case 'retry-catalog': if (this.catalog.status !== 'loading') void this.loadCatalog(); return;
      case 'load-more-catalog': if (this.catalog.status === 'ready' && this.catalog.paging.status === 'idle' && this.catalog.paging.nextCursor) void this.loadCatalog(this.catalog.paging.nextCursor); return;
      case 'retry-catalog-page': if (this.catalog.status === 'ready' && this.catalog.paging.status === 'error' && this.catalog.paging.error.retryable) void this.loadCatalog(this.catalog.paging.cursor); return;
      case 'retry-item': { const slot = this.activeSlots().find(s => s.id === event.id); if (slot?.item.status === 'error' && slot.item.error.kind === 'source' && slot.item.error.detail.retryable) void this.loadSlot(slot); return; }
      case 'use-personal-config': this.recover('personal'); return;
      case 'use-author-default-config': this.recover('author'); return;
      case 'reset-to-author-default': this.reset(); return;
      case 'retry-bootstrap': return;
      default: this.resourceEvent(event); return;
    }
  }
  private edit(config: DisplayConfig): void {
    this.themeValidation = [];
    if (semanticEqual(config, this.config)) { this.emit(); return; }
    const themeChanged = this.config?.themeId !== config.themeId || !semanticEqual(this.config?.themeOptions, config.themeOptions);
    this.config = config; ++this.configRevision; this.operations = idleOperations(); this.notices = [];
    this.configuration = { ...this.configuration, origin: this.configuration.persistence === 'explicit' ? 'share' : 'manual', dirty: !semanticEqual(config, this.baseline), saveStatus: 'not-saved' };
    if (this.configuration.persistence === 'auto') this.persist();
    this.syncSlots(themeChanged); this.emit();
  }
  private persist(): boolean {
    if (!this.config) return false;
    try {
      const config = this.normalize(this.config); this.options.storage.write(this.key, JSON.stringify(config));
      this.personalRead = { status: 'valid' }; this.baseline = config;
      this.configuration = { ...this.configuration, dirty: false, saveStatus: 'saved' }; this.operations.save = { status: 'success', configRevision: this.configRevision }; return true;
    } catch (e) {
      this.configuration = { ...this.configuration, dirty: !semanticEqual(this.config, this.baseline), saveStatus: 'failed' };
      this.operations.save = { status: 'error', code: e instanceof StorageError ? e.code === 'storage-unavailable' ? e.code : 'storage-write-failed' : 'invalid-config' }; return false;
    }
  }
  requestShare(): void {
    if (!this.runtime || this.destroyed) return;
    if (this.publishing) { queueMicrotask(() => this.requestShare()); return; }
    if (!this.config) { this.operations.share = { status: 'error', code: 'invalid-config' }; this.emit(); return; }
    try {
      const url = createShareUrl(this.options.shareBaseUrl, this.runtime.sourceId, this.config, this.location.target, this.options.frameworkId, this.registry);
      this.operations.share = { status: 'success', url, configRevision: this.configRevision, routeRevision: this.routeRevision };
    } catch (e) { this.operations.share = { status: 'error', code: e instanceof ShareProtocolError && e.code !== 'malformed' ? e.code : 'invalid-config' }; }
    this.emit();
  }
  private cleanUrl(): void {
    const location = this.options.sessionUrl.removeShare(structuredClone(this.location));
    this.location = location; this.parsedShare = { state: { status: 'absent' }, identity: 'absent' };
  }
  saveSharedConfig(): void {
    if (!this.runtime || this.destroyed) return;
    if (this.publishing) { queueMicrotask(() => this.saveSharedConfig()); return; }
    this.operations = idleOperations();
    if (this.configuration.persistence !== 'explicit') { this.operations.save = { status: 'error', code: 'not-share-session' }; this.emit(); return; }
    if (!this.config) { this.operations.save = { status: 'error', code: 'invalid-config' }; this.emit(); return; }
    if (!this.persist()) { this.emit(); return; }
    try { this.cleanUrl(); this.configuration = { ...this.configuration, origin: 'personal', persistence: 'auto' }; }
    catch { this.operations.save = { status: 'partial', code: 'url-update-failed', configRevision: this.configRevision, personalRecordSaved: true }; }
    this.emit();
  }
  private recover(target: 'personal' | 'author'): void {
    this.operations = idleOperations(); let config: DisplayConfig | undefined;
    if (target === 'personal') {
      config = this.readPersonal();
      if (this.personalRead.status === 'error') { this.operations.recovery = { status: 'error', target, code: this.personalRead.code }; this.emit(); return; }
    } else {
      try { config = this.author(); } catch { this.operations.recovery = { status: 'error', target, code: 'invalid-author-default' }; this.emit(); return; }
    }
    try { this.cleanUrl(); } catch { this.operations.recovery = { status: 'error', target, code: 'url-update-failed' }; this.emit(); return; }
    this.applySession(config, config ? target === 'personal' ? 'personal' : 'author-default' : 'none');
    this.operations.recovery = { status: 'success', target, result: config ? 'loaded' : 'configure' }; this.emit();
  }
  private reset(): void {
    this.operations = idleOperations(); let config: DisplayConfig | undefined;
    try { config = this.author(); } catch { this.operations.reset = { status: 'error', code: 'invalid-author-default' }; this.emit(); return; }
    try { this.options.storage.remove(this.key); }
    catch (e) { this.operations.reset = { status: 'error', code: e instanceof StorageError && e.code === 'storage-unavailable' ? e.code : 'storage-remove-failed' }; this.emit(); return; }
    this.personalRead = { status: 'missing' }; this.configuration = { ...this.configuration, saveStatus: 'not-saved' };
    try { this.cleanUrl(); } catch { this.operations.reset = { status: 'partial', code: 'url-update-failed', personalRecordRemoved: true }; this.emit(); return; }
    this.applySession(config, config ? 'author-default' : 'none'); this.operations.reset = { status: 'success' }; this.emit();
  }
  private applySession(config: DisplayConfig | undefined, origin: ConfigStatus['origin']): void {
    this.config = this.baseline = config; ++this.configRevision; this.notices = []; this.themeValidation = [];
    this.configuration = { origin, persistence: 'auto', dirty: false, saveStatus: origin === 'personal' ? 'saved' : 'not-saved' };
    this.syncSlots(true);
  }
  private async loadSite(): Promise<void> {
    if (this.destroyed || !this.runtime) return;
    const runtime = this.runtime!; const sequence = ++this.siteSequence; this.siteAbort?.abort(); this.siteAbort = new AbortController();
    const abort = this.siteAbort;
    this.site = { status: 'loading' }; this.emit();
    if (this.destroyed || this.runtime !== runtime || sequence !== this.siteSequence) return;
    try {
      const result = await runtime.source.getSite(abort.signal);
      if (this.destroyed || this.runtime !== runtime || sequence !== this.siteSequence) return;
      if (result.source.kind !== runtime.kind || result.source.sourceId !== runtime.sourceId || (runtime.kind === 'static' && result.source.kind === 'static' && result.source.buildId !== runtime.buildId)) throw new ContentSourceError('invalid-response');
      this.site = { status: 'ready', info: result.info, diagnostics: result.diagnostics };
    } catch (e) { if (this.destroyed || this.runtime !== runtime || sequence !== this.siteSequence || isAbort(e)) return; this.site = { status: 'error', error: contentError(e) }; }
    this.emit();
  }
  private async loadCatalog(cursor?: string): Promise<void> {
    if (this.destroyed || !this.runtime) return;
    const runtime = this.runtime!, sequence = ++this.catalogSequence;
    this.catalogAbort?.abort(); this.catalogAbort = new AbortController();
    const abort = this.catalogAbort;
    const snapshot = this.catalog.snapshot;
    if (cursor === undefined) { this.cursorHistory.clear(); this.catalog = { status: 'loading', snapshot, retained: snapshot.items.length > 0 || snapshot.diagnostics.length > 0 }; }
    else this.catalog = { status: 'ready', snapshot, paging: { status: 'loading', cursor } };
    this.emit();
    if (this.destroyed || this.runtime !== runtime || sequence !== this.catalogSequence) return;
    try {
      const page = await runtime.source.list(cursor === undefined ? {} : { cursor }, abort.signal);
      if (this.destroyed || this.runtime !== runtime || sequence !== this.catalogSequence) return;
      const oldIds = new Set(cursor === undefined ? [] : snapshot.items.map(i => i.id));
      if (new Set(page.items.map(i => i.id)).size !== page.items.length || page.items.some(i => oldIds.has(i.id)) || (page.nextCursor !== undefined && (!page.nextCursor || page.nextCursor === cursor || this.cursorHistory.has(page.nextCursor)))) throw new ContentSourceError('invalid-response');
      if (cursor) this.cursorHistory.add(cursor);
      this.catalog = { status: 'ready', snapshot: cursor === undefined ? { items: page.items, diagnostics: page.diagnostics } : { items: [...snapshot.items, ...page.items], diagnostics: [...snapshot.diagnostics, ...page.diagnostics] }, paging: { status: 'idle', ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }) } };
    } catch (e) {
      if (this.destroyed || this.runtime !== runtime || sequence !== this.catalogSequence || isAbort(e)) return;
      this.catalog = cursor === undefined ? { status: 'error', snapshot, retained: snapshot.items.length > 0 || snapshot.diagnostics.length > 0, error: contentError(e) } : { status: 'ready', snapshot, paging: { status: 'error', cursor, error: contentError(e) } };
    }
    this.emit();
  }
  private syncSlots(rebind: boolean): void {
    if (this.destroyed || !this.runtime) return;
    const runtime = this.runtime;
    const selected = this.config?.contentIds ?? [];
    for (const [id, slot] of this.slots) if (!selected.includes(id)) { slot.abort.abort(); this.slots.delete(id); }
    for (const id of selected) {
      let slot = this.slots.get(id);
      if (!slot) { slot = this.newSlot(id); this.slots.set(id, slot); void this.loadSlot(slot); }
      else if (rebind) this.rebind(slot);
      if (this.destroyed || this.runtime !== runtime) return;
    }
    const target = this.location.target;
    if (!this.config || target.kind !== 'detail') { this.detail?.abort.abort(); this.detail = undefined; }
    else if (this.detail?.id !== target.id) { this.detail?.abort.abort(); this.detail = this.newSlot(target.id); void this.loadSlot(this.detail); }
    else if (rebind && this.detail) this.rebind(this.detail);
  }
  private newSlot(id: string): Slot { return { id, seq: 0, abort: new AbortController(), item: { id, status: 'loading' } }; }
  private currentSlot(slot: Slot): boolean { return this.slots.get(slot.id) === slot || this.detail === slot; }
  private activeSlots(): Slot[] { return this.location.target.kind === 'detail' ? this.detail ? [this.detail] : [] : [...this.slots.values()]; }
  private rebind(slot: Slot): void {
    if (slot.item.status !== 'ready') return;
    const revision = ++this.resourceRevision;
    slot.item = { ...slot.item, resources: slot.item.resources.map(r => ({ key: r.key, url: r.url, resourceRevision: revision, attemptRevision: 0, state: { status: 'idle' } })), resourceStatus: slot.item.resources.length ? 'idle' : 'ready' };
  }
  private async loadSlot(slot: Slot): Promise<void> {
    if (this.destroyed || !this.runtime || !this.currentSlot(slot)) return;
    const runtime = this.runtime!, sequence = ++slot.seq; slot.abort.abort(); slot.abort = new AbortController(); slot.item = { id: slot.id, status: 'loading' }; this.emit();
    const abort = slot.abort;
    if (this.destroyed || this.runtime !== runtime || sequence !== slot.seq || !this.currentSlot(slot)) return;
    try {
      const result: ContentResult = await runtime.source.get(slot.id, abort.signal);
      if (this.destroyed || this.runtime !== runtime || sequence !== slot.seq || !this.currentSlot(slot)) return;
      if (result.item.id !== slot.id || result.item.publication !== 'published' || result.resourceContext.sourceId !== runtime.sourceId || result.resourceContext.kind !== runtime.kind || (runtime.kind === 'static' && result.resourceContext.kind === 'static' && result.resourceContext.buildId !== runtime.buildId)) throw new ContentSourceError('invalid-response');
      try {
        const body = processBody(result.item, result.resourceContext), revision = ++this.resourceRevision;
        slot.item = { id: slot.id, status: 'ready', content: result.item, body: body.body, sourceDiagnostics: result.diagnostics, bodyDiagnostics: body.diagnostics, resources: body.resources.map(r => ({ ...r, resourceRevision: revision, attemptRevision: 0, state: { status: 'idle' } })), resourceStatus: body.resources.length ? 'idle' : 'ready' };
      } catch (e) { slot.item = { id: slot.id, status: 'error', content: result.item, error: { kind: 'body', detail: e instanceof BodyProcessError ? e.detail : { code: 'conversion-failed', retryable: false } }, sourceDiagnostics: result.diagnostics }; }
    } catch (e) { if (this.destroyed || this.runtime !== runtime || sequence !== slot.seq || !this.currentSlot(slot) || isAbort(e)) return; slot.item = { id: slot.id, status: 'error', error: { kind: 'source', detail: contentError(e) } }; }
    this.emit();
  }
  private resourceEvent(event: Extract<DisplayEvent, { resourceKey: string }>): void {
    const slot = this.activeSlots().find(s => s.id === event.id);
    if (!slot || slot.item.status !== 'ready') return;
    const runtime = this.runtime, item = slot.item, resource = item.resources.find(r => r.key === event.resourceKey);
    if (!resource || resource.resourceRevision !== event.resourceRevision || ('attemptRevision' in event && resource.attemptRevision !== event.attemptRevision)) return;
    let next: typeof resource;
    switch (event.type) {
      case 'start-resource':
        if (resource.state.status !== 'idle') return;
        next = { ...resource, attemptRevision: resource.attemptRevision + 1, state: this.blockedUrls.has(resource.url) ? { status: 'error', error: { code: 'deployment-changed', retryable: false } } : { status: 'loading' } }; break;
      case 'detach-resource': if (resource.state.status === 'idle') return; next = { ...resource, attemptRevision: resource.attemptRevision + 1, state: { status: 'idle' } }; break;
      case 'retry-resource': if (resource.state.status !== 'error' || !resource.state.error.retryable || this.blockedUrls.has(resource.url)) return; next = { ...resource, attemptRevision: resource.attemptRevision + 1, state: { status: 'loading' } }; break;
      case 'resource-loaded':
        if (resource.state.status !== 'loading') return;
        if (this.deployment.status !== 'changed') this.failedUrls.delete(resource.url);
        next = { ...resource, state: { status: 'ready' } }; break;
      case 'resource-load-failed':
        if (resource.state.status !== 'loading') return;
        this.failedUrls.add(resource.url);
        if (this.deployment.status === 'changed') this.blockedUrls.add(resource.url);
        next = { ...resource, state: { status: 'error', error: this.deployment.status === 'changed' ? { code: 'deployment-changed', retryable: false } : { code: 'load-failed', retryable: true } } }; break;
    }
    slot.item = { ...item, resources: item.resources.map(r => r === resource ? next : r) }; this.resourceAggregate(slot); this.emit();
    if (event.type === 'resource-load-failed' && !this.destroyed && this.runtime === runtime && this.currentSlot(slot) && runtime?.kind === 'static') void runtime.deploymentProbe.check().catch(() => {});
  }
  private resourceAggregate(slot: Slot): void {
    if (slot.item.status !== 'ready') return;
    const rs = slot.item.resources;
    slot.item = { ...slot.item, resourceStatus: rs.some(r => r.state.status === 'error') ? 'degraded' : rs.some(r => r.state.status === 'loading') ? 'loading' : rs.every(r => r.state.status === 'ready') ? 'ready' : 'idle' };
  }
  private onProbe(event: DeploymentProbeEvent): void {
    const runtime = this.runtime; if (this.destroyed || runtime?.kind !== 'static' || this.deployment.status === 'changed') return;
    if (event.phase === 'started') {
      if (event.sourceInstanceId !== runtime.sourceInstanceId || event.sessionBuildId !== runtime.buildId || event.probeGeneration <= this.generation) return;
      this.generation = event.probeGeneration; this.deployment = { status: 'checking', buildId: runtime.buildId };
    } else {
      const result = event.result;
      if (result.sourceInstanceId !== runtime.sourceInstanceId || result.sessionBuildId !== runtime.buildId || result.probeGeneration !== this.generation) return;
      const observation = result.observation;
      this.deployment = observation.kind === 'same' ? { status: 'current', buildId: runtime.buildId } : observation.kind === 'different' ? { status: 'changed', buildId: runtime.buildId, observedBuildId: observation.observedBuildId } : { status: 'check-failed', buildId: runtime.buildId };
      if (observation.kind === 'different') {
        for (const url of this.failedUrls) this.blockedUrls.add(url);
        for (const slot of [...this.slots.values(), ...(this.detail ? [this.detail] : [])]) if (slot.item.status === 'ready') {
          slot.item = { ...slot.item, resources: slot.item.resources.map(r => r.state.status === 'error' ? { ...r, state: { status: 'error', error: { code: 'deployment-changed', retryable: false } } } : r) }; this.resourceAggregate(slot);
        }
      }
    }
    this.emit();
  }
  private release(): void {
    ++this.bootSequence; ++this.siteSequence; ++this.catalogSequence;
    this.bootAbort?.abort(); this.siteAbort?.abort(); this.catalogAbort?.abort();
    this.unsubscribeProbe?.(); this.unsubscribeProbe = undefined;
    if (this.runtime?.kind === 'static') this.runtime.deploymentProbe.dispose();
    for (const slot of this.slots.values()) slot.abort.abort(); this.detail?.abort.abort(); this.slots.clear(); this.detail = undefined;
  }
  destroy(): void { this.destroyed = true; this.release(); this.listeners.clear(); }
  context(navigate: (target: RouteTarget) => void, reload: () => void): RendererContext {
    return { dispatch: e => this.dispatch(e), navigateToContent: id => navigate({ kind: 'detail', id }), navigateHome: () => navigate({ kind: 'home' }), reloadCurrentDeployment: reload, requestShare: () => this.requestShare(), saveSharedConfig: () => this.saveSharedConfig() };
  }
}
