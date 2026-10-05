import { defineComponent, h, onUnmounted, watchEffect } from 'vue';
import type { PropType } from 'vue';
import type { RenderedResource, RendererContext, SafeNode } from '@blog/contracts';
interface ImageProps { id: string; node: Extract<SafeNode, { type: 'image' }>; resource: RenderedResource; context: RendererContext; }

export const ImageSlot = defineComponent({
  props: { id: { type: String, required: true }, node: { type: Object as PropType<ImageProps['node']>, required: true }, resource: { type: Object as PropType<RenderedResource>, required: true }, context: { type: Object as PropType<RendererContext>, required: true } },
  setup(props) {
    watchEffect(() => { const r = props.resource; if (r.state.status === 'idle') props.context.dispatch({ type: 'start-resource', id: props.id, resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision }); });
    onUnmounted(() => { const r = props.resource; props.context.dispatch({ type: 'detach-resource', id: props.id, resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision }); });
    return () => {
      const { resource: r, node, id, context } = props;
      const complete = (failed: boolean) => context.dispatch({ type: failed ? 'resource-load-failed' : 'resource-loaded', id, resourceKey: r.key, resourceRevision: r.resourceRevision, attemptRevision: r.attemptRevision });
      if (r.state.status === 'idle') return h('span', { role: 'status' }, node.alt || '图片尚未加载');
      if (r.state.status === 'error') return h('span', { class: 'image-error', role: 'alert' }, [node.alt ? node.alt + '：' : '', r.state.error.code === 'deployment-changed' ? '站点已更新，图片无法加载' : '图片加载失败', r.state.error.retryable ? h('button', { type: 'button', onClick: () => context.dispatch({ type: 'retry-resource', id, resourceKey: r.key, resourceRevision: r.resourceRevision }) }, '重试图片') : null]);
      return h('img', { key: r.resourceRevision + ':' + r.attemptRevision, src: r.url, alt: node.alt, title: node.title, onLoad: () => complete(false), onError: () => complete(true),
        onVnodeMounted: (vnode) => { const img = vnode.el as HTMLImageElement; if (img.complete) queueMicrotask(() => complete(img.naturalWidth === 0)); } });
    };
  }
});
