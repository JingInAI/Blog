import { createElement as h, useEffect, useRef } from 'react';
import type { RenderedResource, RendererContext, SafeNode } from '@blog/contracts';
interface ImageProps { id: string; node: Extract<SafeNode, { type: 'image' }>; resource: RenderedResource; context: RendererContext; }

export function ImageSlot(props: ImageProps) {
  const latest = useRef(props); latest.current = props;
  const { resource: r, node, id, context } = props;
  useEffect(() => { if (r.state.status === 'idle') context.dispatch({ type: 'start-resource', id, resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision }); }, [r.state.status, r.resourceRevision, r.attemptRevision, id, context]);
  useEffect(() => () => { const p = latest.current; p.context.dispatch({ type: 'detach-resource', id: p.id, resourceKey: p.resource.key, resourceRevision: p.resource.resourceRevision, attemptRevision: p.resource.attemptRevision }); }, []);
  const complete = (failed: boolean) => context.dispatch({ type: failed ? 'resource-load-failed' : 'resource-loaded', id, resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision });
  if (r.state.status === 'idle') return h('span', { role: 'status' }, node.alt || '图片尚未加载');
  if (r.state.status === 'error') return h('span', { className: 'image-error', role: 'alert' }, node.alt ? node.alt + '：' : '', r.state.error.code === 'deployment-changed' ? '站点已更新，图片无法加载' : '图片加载失败', r.state.error.retryable ? h('button', { type: 'button', onClick: () => context.dispatch({ type: 'retry-resource', id, resourceKey: r.key, resourceRevision: r.resourceRevision }) }, '重试图片') : null);
  return h('img', { key: r.resourceRevision + ':' + r.attemptRevision, src: r.url, alt: node.alt, title: node.title, onLoad: () => complete(false), onError: () => complete(true),
    ref: (img: HTMLImageElement | null) => { if (img?.complete) queueMicrotask(() => complete(img.naturalWidth === 0)); } });
}
