import { createElement } from 'react';
import type { ReactNode, ReactElement } from 'react';
type UIChild = ReactNode;
type UIElement = ReactElement;
const FRAMEWORK = 'react';
const el = (tag: string, props: Record<string, unknown> | null, ...children: UIChild[]): UIElement => createElement(tag, props, ...children);
const image = (props: { key: string; id: string; node: Extract<import('@blog/contracts').SafeNode, { type: 'image' }>; resource: import('@blog/contracts').RenderedResource; context: import('@blog/contracts').RendererContext }): UIElement => createElement(ImageSlot, props);
import { semanticEqual } from '@blog/contracts';
import type { ContentRecord, ContentSummary, DisplayConfig, ItemState, JsonObject, JsonValue, RendererContext, SafeNode, ThemeChoice, ViewModel } from '@blog/contracts';
import { ImageSlot } from './image.ts';
import { readingClasses, themeSelectionOptions } from '@blog/theme-contracts';
export interface UiState { draftTheme: string; draftOptions: JsonObject; draftContentIds?: string[]; copyMessage: string; copyUrl: string; }
export type UiUpdate = UiState | ((state: UiState) => UiState);
export const initialUiState = (): UiState => ({ draftTheme: '', draftOptions: {}, copyMessage: '', copyUrl: '' });
const displayConfig = (model: ViewModel): DisplayConfig | undefined => model.kind === 'page' ? model.page.config : model.kind === 'detail' ? model.config : undefined;
const themeSelection = (config: DisplayConfig | undefined) => config ? { id: config.themeId, version: config.themeVersion, options: config.themeOptions } : undefined;
export function createUiStore(model: ViewModel) {
  const store = {
    model, state: initialUiState(),
    setState(next: UiUpdate): void { store.state = typeof next === 'function' ? next(store.state) : next; },
    update(next: ViewModel): void {
      const previousConfig = displayConfig(store.model), nextConfig = displayConfig(next);
      let state = store.state;
      if (!semanticEqual(themeSelection(previousConfig), themeSelection(nextConfig))) state = { ...state, draftTheme: '', draftOptions: {} };
      if (!semanticEqual(previousConfig?.contentIds, nextConfig?.contentIds)) { state = { ...state }; delete state.draftContentIds; }
      store.state = state; store.model = next;
    }
  };
  return store;
}
export type UiStore = ReturnType<typeof createUiStore>;
const messages: Record<string, string> = {
  'not-found': '内容不存在或未公开', unauthorized: '需要授权', forbidden: '无权访问', unavailable: '服务暂时不可用',
  network: '网络请求失败', timeout: '请求超时', 'invalid-response': '内容响应不符合约定', 'deployment-changed': '站点已更新，请更新页面',
  malformed: '分享链接格式无效', 'too-large': '分享配置过大', 'source-mismatch': '分享链接属于其他内容来源',
  'invalid-config': '展示配置无效', 'storage-unavailable': '无法访问个人配置存储', 'storage-read-failed': '读取个人配置失败',
  'storage-write-failed': '写入个人配置失败', 'storage-remove-failed': '删除个人配置失败', 'url-update-failed': '分享地址清理失败',
  'invalid-author-default': '作者默认配置无效', 'invalid-content-selection': '内容选择无效', 'not-share-session': '当前未处于分享会话',
  'unsupported-content': '正文包含尚不支持的内容', 'unsafe-resource': '正文资源地址不安全', 'unresolved-resource': '正文资源未能解析',
  'invalid-image-description': '图片替代文本缺失或冲突', 'conversion-failed': '正文转换失败', required: '请填写此字段',
  'invalid-value': '字段值无效', 'unknown-option': '不支持此选项', 'url-unavailable': '无法生成分享地址'
};
const message = (code: string): string => messages[code] ?? code;
const valueFrom = (event: { target: EventTarget | null }): HTMLInputElement => event.target as HTMLInputElement;
export function renderUi(model: ViewModel, context: RendererContext, state: UiState, setState: (state: UiUpdate) => void,
  readLatest: () => { model: ViewModel; state: UiState } = () => ({ model, state })): UIElement {
  const config = displayConfig(model);
  const catalog = model.kind === 'page' ? model.page.catalog : model.kind === 'configure' ? model.catalog : undefined;
  const notices = model.kind === 'page' ? model.page.notices : model.kind === 'configure' || model.kind === 'detail' ? model.notices : [];
  const button = (label: string, action: () => void, props: Record<string, unknown> = {}): UIElement => el('button', { type: 'button', onClick: action, ...props }, label);
  const error = (code: string): UIElement => el('p', { role: 'alert', className: 'error' }, message(code));
  const diagnostics = (items: readonly { code: string; fieldPath?: string }[]): UIElement | null => !items.length ? null : el('details', { className: 'diagnostics' },
    el('summary', null, '查看内容诊断'), ...items.map((d, i) => el('p', { key: i }, d.code === 'unknown-api-field' ? '来源提供了未支持的字段：' + d.fieldPath : d.code === 'raw-html-as-text' ? '原始 HTML 按文本显示' : '不安全链接按文本显示')));
  const metadata = (content: ContentSummary | ContentRecord): UIElement => el('div', { className: 'metadata' },
    config?.themeOptions.hideMetadata === true || content.author === undefined ? null : el('span', null, content.author),
    config?.themeOptions.hideMetadata === true || content.publishedAt === undefined ? null : el('time', { dateTime: content.publishedAt }, content.publishedAt),
    config?.themeOptions.showTags === false || content.tags === undefined ? null : el('span', { className: 'tags' }, ...content.tags.map((t, i) => el('span', { key: i }, t))));
  function bodyNode(node: SafeNode, item: Extract<ItemState, { status: 'ready' }>, position: string): UIChild {
    if (node.type === 'text') return node.value;
    if (node.type === 'image') {
      const resource = item.resources.find(r => r.key === node.resourceKey);
      return resource ? image({ key: resource.resourceRevision + ':' + resource.key, id: item.id, node, resource, context }) : error('unresolved-resource');
    }
    const anchor = node.tag === 'a' && node.props.href?.startsWith('#') && !node.props.href.startsWith('#/');
    return el(node.tag, { ...node.props, key: position, ...(anchor ? { onClick: (event: { preventDefault(): void }) => { event.preventDefault(); const id = node.props.href!.slice(1); const target = document.getElementById(id); target?.scrollIntoView(); target?.setAttribute('tabindex', '-1'); target?.focus(); } } : {}) }, ...node.children.map((n, i) => bodyNode(n, item, position + '-' + i)));
  }
  const article = (item: ItemState, full: boolean): UIElement => {
    if (item.status === 'loading') return el('article', { className: 'post', key: item.id, 'data-content-id': item.id }, el('p', { role: 'status' }, '内容加载中'));
    if (item.status === 'error' && item.error.kind === 'source') return el('article', { className: 'post', key: item.id, 'data-content-id': item.id }, error(item.error.detail.code), item.error.detail.retryable ? button('重试内容', () => context.dispatch({ type: 'retry-item', id: item.id })) : null);
    const content = item.status === 'ready' ? item.content : 'content' in item ? item.content : undefined;
    return el('article', { className: 'post', key: item.id, 'data-content-id': item.id },
      content ? el('h2', null, content.title) : null, content ? metadata(content) : null,
      !full && content?.summary !== undefined ? el('p', { className: 'summary' }, content.summary) : null,
      item.status === 'error' && item.error.kind === 'body' ? el('div', null, error(item.error.detail.code), 'content' in item ? el('details', null, el('summary', null, '查看原始 Markdown'), el('pre', null, item.content.body.value)) : null) : null,
      item.status === 'ready' ? diagnostics([...item.sourceDiagnostics, ...(full ? item.bodyDiagnostics : [])]) : 'sourceDiagnostics' in item ? diagnostics(item.sourceDiagnostics) : null,
      full && item.status === 'ready' ? el('div', { className: 'prose' }, ...item.body.nodes.map((n, i) => bodyNode(n, item, String(i)))) : null,
      button('阅读全文', () => context.navigateToContent(item.id), { className: 'text-button', 'aria-label': '阅读全文：' + (content?.title ?? item.id) }));
  };
  const site = model.site.status === 'ready' ? model.site.info : undefined;
  const status = el('section', { className: 'feedback', 'aria-live': 'polite' },
    model.site.status === 'loading' ? el('p', null, '站点信息加载中') : model.site.status === 'error' ? el('div', null, error(model.site.error.code), model.site.error.retryable ? button('重试站点信息', () => context.dispatch({ type: 'retry-site' })) : null) : diagnostics(model.site.diagnostics),
    model.shareInput.status === 'invalid' ? error(model.shareInput.code) : model.shareInput.status === 'valid' ? el('p', null, '正在查看分享配置；修改只在本次浏览中生效。') : null,
    model.personalRead.status === 'error' ? error(model.personalRead.code) : model.personalRead.status === 'invalid' ? el('p', { role: 'alert' }, '个人配置无效，原记录已保留。') : null,
    model.deployment.status === 'changed' ? el('div', { role: 'alert' }, el('p', null, '站点已更新，部分旧内容或资源可能无法继续加载。'), button('更新页面', context.reloadCurrentDeployment)) : null,
    model.kind !== 'bootstrap' && model.deployment.status === 'check-failed' ? el('p', null, '暂时无法确认站点版本') : null,
    ...notices.map((n, i) => el('p', { key: i, role: 'alert' }, message(n.code))),
    model.operations.save.status === 'partial' ? el('p', { role: 'alert' }, '个人配置已保存，分享地址未清理。刷新仍会恢复原分享链接。') : model.operations.save.status === 'error' ? error(model.operations.save.code) : model.operations.save.status === 'success' ? el('p', null, '个人配置已保存') : null,
    model.operations.reset.status === 'partial' ? el('p', { role: 'alert' }, '个人配置已删除，分享地址未清理；当前展示保留，刷新仍按原链接加载。') : model.operations.reset.status === 'error' ? error(model.operations.reset.code) : model.operations.reset.status === 'success' ? el('p', null, '已重置为作者默认或选择入口') : null,
    model.operations.recovery.status === 'error' ? error(model.operations.recovery.code) : null,
    model.operations.share.status === 'error' ? error(model.operations.share.code) : null,
    config ? el('p', { className: 'muted', 'data-testid': 'dirty' }, model.configuration.dirty ? '有尚未保存的修改' : model.configuration.persistence === 'explicit' ? '刷新恢复原分享配置' : '当前展示配置无修改') : null);
  let editor: UIElement | null = null;
  if (model.kind !== 'bootstrap') {
    const selectedTheme = state.draftTheme || config?.themeId || '';
    const descriptor: ThemeChoice | undefined = model.themes.find(t => t.id === selectedTheme);
    const options = state.draftTheme ? state.draftOptions : config?.themeOptions ?? {};
    const readSelection = () => {
      const latest = readLatest(), currentConfig = displayConfig(latest.model);
      const id = latest.state.draftTheme || currentConfig?.themeId || '';
      return { ...latest, config: currentConfig, id, descriptor: latest.model.themes.find(theme => theme.id === id),
        options: latest.state.draftTheme ? latest.state.draftOptions : currentConfig?.themeOptions ?? {},
        ids: latest.state.draftContentIds ?? currentConfig?.contentIds ?? [] };
    };
    function changeOption(key: string, value: JsonValue | undefined, immediate = false): void {
      const current = readSelection(), next = { ...current.options };
      if (value === undefined && immediate && current.descriptor && Object.hasOwn(current.descriptor.defaults, key)) value = current.descriptor.defaults[key];
      if (value === undefined) delete next[key];
      else Object.defineProperty(next, key, { value, writable: true, enumerable: true, configurable: true });
      setState({ ...current.state, draftTheme: current.id, draftOptions: next });
      if (immediate && current.id) context.dispatch({ type: 'set-theme', themeId: current.id, options: next });
    }
    function changeTheme(id: string): void {
      const current = readSelection();
      const previous = current.config ? { ...current.config, themeId: current.id, themeOptions: current.options } : undefined;
      const next = themeSelectionOptions(current.model.themes.find(t => t.id === id), previous);
      setState({ ...current.state, draftTheme: id, draftOptions: next });
      if (id) context.dispatch({ type: 'set-theme', themeId: id, options: next });
    }
    function setContent(ids: string[]): void {
      const current = readSelection(); if (!current.config) return;
      setState({ ...current.state, draftContentIds: [...ids] });
      context.dispatch({ type: 'set-content', ids });
    }
    function moveContent(id: string, direction: number): void {
      const ids = [...readSelection().ids], index = ids.indexOf(id), target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]]; setContent(ids);
    }
    const ids = state.draftContentIds ?? config?.contentIds ?? [];
    const groups = [...new Set((descriptor?.options ?? []).map(option => option.group ?? '风格参数'))];
    editor = el('aside', { className: 'editor', 'aria-label': '展示设置' },
      el('h2', null, '展示设置'),
      el('form', { onSubmit: (event: { preventDefault(): void }) => { event.preventDefault(); const current = readSelection(); context.dispatch({ type: 'set-theme', themeId: current.id, options: current.options }); } },
        el('p', { className: 'muted' }, descriptor?.options.some(d => d.kind === 'string' || d.kind === 'number') ? '风格和选择项即时生效；文字或数字参数填写后点击“应用风格”。' : '展示选项选择后立即生效；“使用默认”恢复默认外观。'),
        el('label', null, '网页风格', el('select', { 'aria-label': '网页风格', value: selectedTheme, onChange: (e: { target: EventTarget | null }) => changeTheme(valueFrom(e).value) },
          el('option', { value: '' }, '请选择风格'), ...model.themes.map(t => el('option', { key: t.id, value: t.id, disabled: t.availability !== 'available' }, t.label + (t.availability !== 'available' ? '（当前框架不支持）' : ''))))),
        ...groups.map(group => el('fieldset', { key: group, className: 'option-group' }, el('legend', null, group), ...(descriptor?.options ?? []).filter(d => (d.group ?? '风格参数') === group).map(d => {
          // Required means a JSON value must be present, including false, null or an empty string.
          const common = { 'aria-label': d.label, 'aria-required': d.required, name: d.key };
          const value = Object.hasOwn(options, d.key) ? options[d.key] : undefined;
          let control: UIElement;
          if (d.kind === 'boolean') control = el('input', { ...common, type: 'checkbox', checked: value === true, onChange: (e: { target: EventTarget | null }) => changeOption(d.key, valueFrom(e).checked, true) });
          else if (d.kind === 'enum') control = el('select', { ...common, value: Object.hasOwn(options, d.key) ? JSON.stringify(d.choices?.find(choice => semanticEqual(choice, value)) ?? value) : '', onChange: (e: { target: EventTarget | null }) => changeOption(d.key, valueFrom(e).value === '' ? undefined : JSON.parse(valueFrom(e).value), true) },
            el('option', { value: '' }, d.required ? '请选择' : '使用默认'), ...(d.choices ?? []).map((v, i) => el('option', { key: i, value: JSON.stringify(v) }, d.choiceLabels?.[i] ?? (typeof v === 'string' ? v : JSON.stringify(v)))));
          else control = el('input', { ...common, type: d.kind === 'number' ? 'number' : 'text', ...(d.kind === 'number' ? { step: 'any' } : {}), value: String(value ?? ''), onInput: (e: { target: EventTarget | null }) => changeOption(d.key, d.kind === 'number' ? valueFrom(e).value === '' ? undefined : Number(valueFrom(e).value) : valueFrom(e).value) });
          return el('label', { key: d.key }, d.label, control, ...model.themeValidation.filter(issue => issue.key === d.key).map(issue => error(issue.code)));
        }))),
        ...model.themeValidation.filter(issue => !descriptor?.options.some(d => d.key === issue.key)).map(issue => error(issue.code)),
        el('button', { type: 'submit', disabled: !selectedTheme }, '应用风格'),
        button('恢复默认外观', () => {
          const current = readSelection(), next = structuredClone(current.descriptor?.defaults ?? {});
          setState({ ...current.state, draftTheme: current.id, draftOptions: next });
          context.dispatch({ type: 'set-theme', themeId: current.id, options: next });
        }, { disabled: !selectedTheme })),
      catalog ? el('section', { className: 'selection' }, el('h3', null, '选择内容'),
        !config ? el('p', null, '选择风格并完成必填参数后，再选择内容。') : null,
        catalog.status === 'loading' ? el('p', { role: 'status' }, catalog.retained ? '正在刷新目录；保留上次结果。' : '目录加载中') : null,
        catalog.status === 'error' ? el('div', null, error(catalog.error.code), catalog.retained ? el('p', null, '显示上次目录，可能不是最新内容。') : null) : null,
        diagnostics(catalog.snapshot.diagnostics),
        catalog.status === 'ready' && !catalog.snapshot.items.length ? el('p', null, '没有已发布的内容') : null,
        ...catalog.snapshot.items.map(c => el('label', { className: 'content-choice', key: c.id }, el('input', { type: 'checkbox', checked: ids.includes(c.id), disabled: !config, 'aria-label': '选择：' + c.title, onChange: (e: { target: EventTarget | null }) => { const ids = readSelection().ids; setContent(valueFrom(e).checked ? ids.includes(c.id) ? [...ids] : [...ids, c.id] : ids.filter(id => id !== c.id)); } }), c.title)),
        ids.length ? el('ol', { className: 'order' }, ...ids.map((id, i) => el('li', { key: id }, catalog.snapshot.items.find(c => c.id === id)?.title ?? id,
          button('上移', () => moveContent(id, -1), { disabled: i === 0, 'aria-label': '上移：' + id }),
          button('下移', () => moveContent(id, 1), { disabled: i === ids.length - 1, 'aria-label': '下移：' + id }),
          button('移除', () => setContent(readSelection().ids.filter(v => v !== id)), { 'aria-label': '移除：' + id })))) : null,
        button('刷新目录', () => context.dispatch({ type: 'retry-catalog' }), { disabled: catalog.status === 'loading' }),
        catalog.status === 'ready' && catalog.paging.status === 'idle' && catalog.paging.nextCursor ? button('加载更多', () => context.dispatch({ type: 'load-more-catalog' })) : null,
        catalog.status === 'ready' && catalog.paging.status === 'loading' ? el('p', null, '下一页加载中') : null,
        catalog.status === 'ready' && catalog.paging.status === 'error' ? el('div', null, error(catalog.paging.error.code), catalog.paging.error.retryable ? button('重试下一页', () => context.dispatch({ type: 'retry-catalog-page' })) : null) : null) : null,
      el('div', { className: 'recovery-actions' },
        button('采用个人配置', () => context.dispatch({ type: 'use-personal-config' })),
        button('采用作者默认', () => context.dispatch({ type: 'use-author-default-config' })),
        button('重置个人配置', () => context.dispatch({ type: 'reset-to-author-default' }))),
      config ? el('div', { className: 'share-actions' }, button('生成分享链接', context.requestShare),
        model.configuration.persistence === 'explicit' ? button('保存为个人配置', context.saveSharedConfig) : null) : null,
      model.operations.share.status === 'success' ? el('div', { className: 'share-result' },
        el('label', null, '分享链接', el('input', { readOnly: true, value: model.operations.share.url, 'aria-label': '分享链接' })),
        button('复制链接', () => {
          const url = model.operations.share.status === 'success' ? model.operations.share.url : '';
          void (async () => { try { await navigator.clipboard.writeText(url); setState(previous => ({ ...previous, copyUrl: url, copyMessage: '链接已复制' })); } catch { setState(previous => ({ ...previous, copyUrl: url, copyMessage: '复制失败，请手动复制链接。' })); } })();
        }), state.copyMessage && state.copyUrl === model.operations.share.url ? el('p', { role: 'status' }, state.copyMessage) : null) : null);
  }
  let main: UIElement;
  if (model.kind === 'bootstrap') main = el('main', { className: 'main' }, model.bootstrap.status === 'loading' ? el('p', { role: 'status' }, '正在加载内容来源') : el('div', null,
    error(model.bootstrap.failure.kind === 'version' ? 'deployment-changed' : model.bootstrap.failure.error.code),
    model.bootstrap.failure.kind === 'request' && model.bootstrap.failure.error.retryable ? button('重试启动', () => context.dispatch({ type: 'retry-bootstrap' })) : null,
    button('重新加载页面', context.reloadCurrentDeployment)));
  else if (model.kind === 'configure') main = el('main', { className: 'main' }, el('h2', null, '选择风格与内容'), el('p', null, '选择风格后，可以从目录选择内容并调整顺序。'));
  else if (model.kind === 'detail') main = el('main', { className: 'main detail ' + config?.themeId + ' ' + config?.themeOptions.density }, button('返回首页', context.navigateHome), article(model.item, true));
  else main = el('main', { className: 'main' },
    model.page.status === 'empty' ? el('p', { className: 'empty' }, '尚未选择内容') : null,
    el('div', { className: 'posts ' + config?.themeId + ' ' + config?.themeOptions.density }, ...model.page.items.map(item => article(item, config?.themeId === 'minimal-list'))));
  return el('div', { className: 'blog-surface ' + readingClasses(config) }, el('div', { className: 'blog-shell', 'data-framework': FRAMEWORK },
    el('header', { className: 'site-header' }, button('首页', context.navigateHome, { className: 'home' }),
      site?.title === undefined ? null : el('h1', null, site.title),
      site?.description === undefined ? null : el('p', null, site.description),
      site?.author === undefined ? null : el('p', null, site.author)),
    status, el('div', { className: 'workspace' }, main, editor)));
}
