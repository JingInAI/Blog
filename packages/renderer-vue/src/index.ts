import type { RendererAdapter, ViewModel } from '@blog/contracts';
import { createApp, defineComponent, shallowRef } from 'vue';
import type { App } from 'vue';
import { renderUi, createUiStore } from './ui.ts';
import type { UiStore } from './ui.ts';
export function createVueRenderer(): RendererAdapter {
  let app: App | undefined, store: UiStore | undefined, refresh: (() => void) | undefined;
  return { frameworkId: 'vue', supportedThemeIds: ['minimal-list', 'card-grid'],
    mount(container, model, context) {
      if (app) throw new Error('already-mounted');
      const mountedStore = createUiStore(model), revision = shallowRef(0);
      store = mountedStore; refresh = () => { ++revision.value; };
      app = createApp(defineComponent({ setup() {
        return () => {
          void revision.value;
          return renderUi(mountedStore.model, context, mountedStore.state,
            next => { mountedStore.setState(next); ++revision.value; }, () => mountedStore);
        };
      } })); app.mount(container);
    },
    update(model: ViewModel) { if (!app || !store) throw new Error('not-mounted'); store.update(model); refresh!(); },
    unmount() { app?.unmount(); app = undefined; store = undefined; refresh = undefined; }
  };
}
