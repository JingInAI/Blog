import { StorageError, UrlUpdateError, semanticEqual } from '@blog/contracts';
import type { LocationInput, PersonalStoragePort, RendererAdapter, SessionUrlPort } from '@blog/contracts';
import { createHttpFactory, createStaticFactory } from '@blog/content-source';
import { BlogController, parseRoute, routeHash, shareParts } from '@blog/render-core';
import { verifyThemeImplementations } from '@blog/theme-contracts';
export function browserStorage(getStorage: () => Storage = () => window.localStorage): PersonalStoragePort {
  const handle = (): Storage => { try { return getStorage(); } catch { throw new StorageError('storage-unavailable'); } };
  const wrap = <T>(fn: () => T, code: 'storage-read-failed' | 'storage-write-failed' | 'storage-remove-failed'): T => {
    try { return fn(); } catch (e) { if (e instanceof StorageError) throw e; if (e instanceof DOMException && e.name === 'SecurityError') throw new StorageError('storage-unavailable'); throw new StorageError(code); }
  };
  return { read: key => wrap(() => handle().getItem(key), 'storage-read-failed'), write: (key, value) => wrap(() => handle().setItem(key, value), 'storage-write-failed'), remove: key => wrap(() => handle().removeItem(key), 'storage-remove-failed') };
}
export function sessionUrlPort(read: () => LocationInput, href: () => string, replace: (url: string) => void): SessionUrlPort {
  return { removeShare(expected) {
    try {
      if (!semanticEqual(read(), expected)) throw new UrlUpdateError();
      const parts = shareParts(expected.search), kept = parts.filter(p => p.name !== 'share');
      if (kept.length === parts.length) return expected;
      const url = new URL(href()); url.search = kept.length ? '?' + kept.map(p => p.raw).join('&') : '';
      const result: LocationInput = { target: expected.target, search: url.search };
      replace(url.href); return result;
    } catch { throw new UrlUpdateError(); }
  } };
}
export function mountBlog(adapter: RendererAdapter, container: HTMLElement): () => void {
  verifyThemeImplementations(adapter.frameworkId, adapter.supportedThemeIds);
  if (adapter.frameworkId !== __FRAMEWORK__) throw new Error('framework-mismatch');
  const config = __BLOG_CONFIG__, baseUrl = new URL(config.basePath, window.location.origin).href;
  const factory = config.source.kind === 'static' ? createStaticFactory({ sourceId: config.source.sourceId, expectedBuildId: __BUILD_ID__, baseUrl }) : createHttpFactory(config.source);
  const readLocation = (): LocationInput => ({ target: parseRoute(window.location.hash), search: window.location.search });
  let initial: LocationInput;
  const invalidRoute = (): void => {
    container.replaceChildren(); const p = document.createElement('p'); p.setAttribute('role', 'alert'); p.textContent = '页面地址无效';
    const button = document.createElement('button'); button.textContent = '返回首页'; button.onclick = () => { const url = new URL(window.location.href); url.hash = '#/'; window.location.replace(url.href); window.location.reload(); };
    container.append(p, button);
  };
  try { initial = readLocation(); } catch { invalidRoute(); return () => container.replaceChildren(); }
  const controller = new BlogController({ frameworkId: adapter.frameworkId, siteId: config.siteId, factory, storage: browserStorage(), sessionUrl: sessionUrlPort(readLocation, () => window.location.href, url => window.history.replaceState(null, '', url)), shareBaseUrl: baseUrl, authorDefault: config.authorDefault, initialLocation: initial });
  let active = true, mounting = true;
  const context = controller.context(target => { const url = new URL(window.location.href); url.hash = routeHash(target); window.history.pushState(null, '', url); sync(); }, () => window.location.reload());
  const queuedContext = { ...context, dispatch: (event: Parameters<typeof context.dispatch>[0]) => { queueMicrotask(() => { if (active) context.dispatch(event); }); } };
  const unsubscribe = controller.subscribe(model => { if (active) { if (mounting) queueMicrotask(() => { if (active) adapter.update(controller.getModel()); }); else adapter.update(model); } });
  const sync = (): void => { try { controller.setLocation(readLocation()); } catch { dispose(); invalidRoute(); } };
  const dispose = (): void => { if (!active) return; active = false; window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); unsubscribe(); controller.destroy(); adapter.unmount(); };
  adapter.mount(container, controller.getModel(), queuedContext); mounting = false;
  window.addEventListener('popstate', sync); window.addEventListener('hashchange', sync); controller.start();
  return dispose;
}
