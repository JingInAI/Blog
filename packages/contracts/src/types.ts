export interface SiteInfo {
  schemaVersion: 1;
  title?: string;
  description?: string;
  author?: string;
  language?: string;
}
export interface ContentRecord {
  schemaVersion: 1;
  id: string;
  publication: 'draft' | 'published';
  title: string;
  body: { format: 'markdown'; value: string };
  summary?: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
  assets?: Array<{ id: string; url: string; decorative: boolean; alt?: string }>;
}
export interface ContentSummary {
  schemaVersion: 1;
  id: string;
  publication: 'published';
  title: string;
  summary?: string;
  author?: string;
  publishedAt?: string;
  tags?: string[];
}

export interface SourceDiagnostic { code: 'unknown-api-field'; fieldPath: string; }
export interface ContentQuery { ids?: string[]; cursor?: string; limit?: number; }
export interface ContentPage {
  items: ContentSummary[];
  nextCursor?: string;
  diagnostics: readonly SourceDiagnostic[];
}
export interface StaticAssetEntry { publishedUrl: string; }
export type ResourceContext =
  | { kind: 'static'; sourceId: string; buildId: string;
      assetsByReference: Readonly<Record<string, StaticAssetEntry>> }
  | { kind: 'http'; sourceId: string; resourceBaseUrl?: string };
export interface ContentResult {
  item: ContentRecord;
  diagnostics: readonly SourceDiagnostic[];
  resourceContext: ResourceContext;
}
export type SourceIdentity =
  | { kind: 'static'; sourceId: string; buildId: string }
  | { kind: 'http'; sourceId: string };
export interface SiteResult {
  info: SiteInfo;
  diagnostics: readonly SourceDiagnostic[];
  source: SourceIdentity;
}
export interface ContentSource {
  getSite(signal?: AbortSignal): Promise<SiteResult>;
  list(query: ContentQuery, signal?: AbortSignal): Promise<ContentPage>;
  get(id: string, signal?: AbortSignal): Promise<ContentResult>;
}
export type ContentErrorCode = 'not-found' | 'unauthorized' | 'forbidden'
  | 'unavailable' | 'network' | 'timeout' | 'invalid-response' | 'deployment-changed';
export interface ContentError { code: ContentErrorCode; retryable: boolean; }

export type SourceRuntime =
  | { kind: 'static'; sourceId: string; sourceInstanceId: string; buildId: string;
      source: ContentSource; deploymentProbe: DeploymentProbePort }
  | { kind: 'http'; sourceId: string; sourceInstanceId: string; source: ContentSource };
export interface SourceRuntimeFactory {
  readonly identity:
    | { kind: 'static'; sourceId: string; expectedBuildId: string }
    | { kind: 'http'; sourceId: string };
  initialize(signal?: AbortSignal): Promise<SourceRuntime>;
}
export type BootstrapFailure =
  | { kind: 'request'; error: {
      code: 'network' | 'timeout' | 'unavailable' | 'unauthorized' | 'forbidden' | 'invalid-response'; retryable: boolean } }
  | { kind: 'version'; expectedBuildId: string; observedBuildId: string };
export type BootstrapState =
  | { status: 'loading' }
  | { status: 'error'; failure: BootstrapFailure };

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue; }
export interface DisplayConfig {
  version: 1;
  contentIds: string[];
  themeId: string;
  themeVersion: number;
  themeOptions: JsonObject;
}
export interface ThemeOptionDescriptor {
  key: string;
  label: string;
  kind: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  defaultValue?: JsonValue;
  choices?: readonly JsonValue[];
  choiceLabels?: readonly string[];
  group?: string;
}
export interface ThemeChoice {
  id: string;
  label: string;
  version: number;
  availability: 'available' | 'unsupported-framework';
  unavailableReason?: 'unsupported-framework';
  options: readonly ThemeOptionDescriptor[];
  defaults: JsonObject;
}
export interface ConfigStatus {
  origin: 'personal' | 'author-default' | 'share' | 'manual' | 'none';
  persistence: 'auto' | 'explicit';
  dirty: boolean;
  saveStatus: 'not-saved' | 'saved' | 'failed';
}

export type StorageErrorCode = 'storage-unavailable' | 'storage-read-failed'
  | 'storage-write-failed' | 'storage-remove-failed';
export interface PersonalStoragePort {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}
export type PersonalReadState =
  | { status: 'not-read' }
  | { status: 'missing' }
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'error'; code: 'storage-unavailable' | 'storage-read-failed' };

export type DisplayEvent =
  | { type: 'set-content'; ids: string[] }
  | { type: 'set-theme'; themeId: string; options: JsonObject }
  | { type: 'retry-item'; id: string }
  | { type: 'retry-bootstrap' }
  | { type: 'retry-site' }
  | { type: 'retry-catalog' }
  | { type: 'retry-catalog-page' }
  | { type: 'load-more-catalog' }
  | { type: 'use-personal-config' }
  | { type: 'use-author-default-config' }
  | { type: 'reset-to-author-default' }
  | { type: 'start-resource'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'detach-resource'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'resource-load-failed'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'resource-loaded'; id: string; resourceKey: string;
      resourceRevision: number; attemptRevision: number }
  | { type: 'retry-resource'; id: string; resourceKey: string; resourceRevision: number };
export interface RendererContext {
  dispatch(event: DisplayEvent): void;
  navigateToContent(id: string): void;
  navigateHome(): void;
  reloadCurrentDeployment(): void;
  requestShare(): void;
  saveSharedConfig(): void;
}
export interface RendererAdapter {
  frameworkId: string;
  supportedThemeIds: readonly string[];
  mount(container: HTMLElement, model: ViewModel, context: RendererContext): void;
  update(model: ViewModel): void;
  unmount(): void;
}
export type BodyErrorCode = 'unsupported-content' | 'unsafe-resource'
  | 'unresolved-resource' | 'invalid-image-description' | 'conversion-failed';
export interface BodyError { code: BodyErrorCode; retryable: false; }
export interface BodyDiagnostic {
  code: 'raw-html-as-text' | 'unsafe-link-as-text';
  sourcePosition?: { line: number; column: number };
}
export type ItemState =
  | { id: string; status: 'loading' }
  | { id: string; status: 'ready'; content: ContentRecord; body: SafeBody;
      sourceDiagnostics: readonly SourceDiagnostic[]; bodyDiagnostics: readonly BodyDiagnostic[];
      resources: readonly RenderedResource[]; resourceStatus: 'idle' | 'loading' | 'ready' | 'degraded' }
  | { id: string; status: 'error'; error: { kind: 'source'; detail: ContentError } }
  | { id: string; status: 'error'; content: ContentRecord;
      error: { kind: 'body'; detail: BodyError }; sourceDiagnostics: readonly SourceDiagnostic[] };
export interface ProcessedResource { key: string; url: string; }
export interface BodyProcessResult {
  body: SafeBody;
  resources: readonly ProcessedResource[];
  diagnostics: readonly BodyDiagnostic[];
}
export type ResourceLoadError =
  | { code: 'load-failed'; retryable: true }
  | { code: 'deployment-changed'; retryable: false };
export type ResourceLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; error: ResourceLoadError };
export interface RenderedResource extends ProcessedResource {
  resourceRevision: number;
  attemptRevision: number;
  state: ResourceLoadState;
}
export interface CatalogSnapshot {
  items: readonly ContentSummary[];
  diagnostics: readonly SourceDiagnostic[];
}
export type PagingState =
  | { status: 'idle'; nextCursor?: string }
  | { status: 'loading'; cursor: string }
  | { status: 'error'; cursor: string; error: ContentError };
export type CatalogState =
  | { status: 'loading'; snapshot: CatalogSnapshot; retained: boolean }
  | { status: 'ready'; snapshot: CatalogSnapshot; paging: PagingState }
  | { status: 'error'; snapshot: CatalogSnapshot; retained: boolean; error: ContentError };
export type ShareState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; url: string; configRevision: number; routeRevision: number }
  | { status: 'error'; code: 'invalid-config' | 'too-large' | 'source-mismatch' | 'url-unavailable' };
export type SaveState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; configRevision: number }
  | { status: 'partial'; code: 'url-update-failed'; configRevision: number; personalRecordSaved: true }
  | { status: 'error'; code: 'invalid-config' | 'not-share-session' | 'storage-unavailable' | 'storage-write-failed' };
export type RouteTarget = { kind: 'home' } | { kind: 'detail'; id: string };
export interface NavigationState { target: RouteTarget; routeRevision: number; }
export interface NavigationConsumer { setNavigation(target: RouteTarget): void; }
export interface LocationInput { target: RouteTarget; search: string; }
export interface LocationConsumer { setLocation(input: LocationInput): void; }
export interface SessionUrlPort { removeShare(expected: LocationInput): LocationInput; }
export type RecoveryState =
  | { status: 'idle' }
  | { status: 'success'; target: 'personal' | 'author'; result: 'loaded' | 'configure' }
  | { status: 'error'; target: 'personal' | 'author';
      code: 'storage-unavailable' | 'storage-read-failed' | 'invalid-author-default' | 'url-update-failed' };
export type DeploymentState =
  | { status: 'not-applicable' }
  | { status: 'current'; buildId: string }
  | { status: 'checking'; buildId: string }
  | { status: 'changed'; buildId: string; observedBuildId: string }
  | { status: 'check-failed'; buildId: string };
export type ResetState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'partial'; code: 'url-update-failed'; personalRecordRemoved: true }
  | { status: 'error'; code: 'invalid-author-default' | 'storage-unavailable' | 'storage-remove-failed' };
export type DeploymentObservation =
  | { kind: 'same'; observedBuildId: string }
  | { kind: 'different'; observedBuildId: string }
  | { kind: 'failed' };
export interface DeploymentProbeResult {
  sourceInstanceId: string;
  sessionBuildId: string;
  probeGeneration: number;
  observation: DeploymentObservation;
}
export type DeploymentProbeEvent =
  | { phase: 'started'; sourceInstanceId: string; sessionBuildId: string; probeGeneration: number }
  | { phase: 'finished'; result: DeploymentProbeResult };
export interface DeploymentProbePort {
  check(signal?: AbortSignal): Promise<DeploymentProbeResult>;
  subscribe(listener: (event: DeploymentProbeEvent) => void): () => void;
  dispose(): void;
}
export interface ThemeValidationIssue {
  key: string;
  code: 'required' | 'invalid-value' | 'unknown-option';
}
export type SiteState =
  | { status: 'loading' }
  | { status: 'ready'; info: SiteInfo; diagnostics: readonly SourceDiagnostic[] }
  | { status: 'error'; error: ContentError };
export type ShareInputState =
  | { status: 'absent' }
  | { status: 'valid' }
  | { status: 'invalid'; code: 'malformed' | 'too-large' | 'source-mismatch' | 'invalid-config' };
export interface ViewCommon {
  site: SiteState;
  shareInput: ShareInputState;
  personalRead: PersonalReadState;
  themes: readonly ThemeChoice[];
  navigation: NavigationState;
  deployment: DeploymentState;
  themeValidation: readonly ThemeValidationIssue[];
  configuration: ConfigStatus;
  operations: { share: ShareState; save: SaveState; reset: ResetState; recovery: RecoveryState };
}
export interface PageModel {
  revision: number;
  config: DisplayConfig;
  catalog: CatalogState;
  items: ItemState[];
  status: 'loading' | 'ready' | 'partial' | 'empty' | 'error';
  notices: Array<{ code: string }>;
}
export type ViewModel = ViewCommon & (
  | { kind: 'bootstrap'; bootstrap: BootstrapState }
  | { kind: 'configure'; catalog: CatalogState; notices: Array<{ code: string }> }
  | { kind: 'page'; page: PageModel }
  | { kind: 'detail'; config: DisplayConfig; item: ItemState; notices: Array<{ code: string }> });

export type SafeTag = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'em' | 'strong' | 'del' | 'a' | 'pre' | 'code' | 'br' | 'hr' | 'blockquote' | 'ul' | 'ol' | 'li' | 'table' | 'thead' | 'tbody' | 'tr' | 'th' | 'td' | 'input' | 'sup' | 'section';
export type SafeNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'image'; readonly resourceKey: string; readonly alt: string; readonly title?: string }
  | { readonly type: 'element'; readonly tag: SafeTag; readonly props: Readonly<{ href?: string; title?: string; start?: number; checked?: boolean; disabled?: boolean; type?: 'checkbox'; align?: 'left' | 'center' | 'right'; id?: string }>; readonly children: readonly SafeNode[] };
declare const safeBodyBrand: unique symbol;
export interface SafeBody { readonly [safeBodyBrand]: true; readonly nodes: readonly SafeNode[]; }
export interface Manifest {
  schemaVersion: 1;
  buildId: string;
  siteUrl: string;
  catalogUrl: string;
  contents: Record<string, { url: string; assetsByReference: Record<string, StaticAssetEntry> }>;
}
export interface CurrentPointer { schemaVersion: 1; buildId: string; manifestUrl: string; }
export interface HttpSourceOptions {
  sourceId: string;
  baseUrl: string;
  resourceBaseUrl?: string;
  resourceBasePriority?: 'config' | 'response';
  timeoutMs?: number;
  requestPolicy?: () => RequestInit;
  endpoints?: { site?: string; list?: string; detail?: (id: string) => string };
}
export interface AppConfig {
  schemaVersion: 1;
  siteId: string;
  source: { kind: 'static'; sourceId: string } | ({ kind: 'http' } & Omit<HttpSourceOptions, 'requestPolicy' | 'endpoints'>);
  basePath: string;
  authorDefault?: DisplayConfig;
}
