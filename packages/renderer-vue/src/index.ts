import type { RendererAdapter, RendererContext, ViewModel } from '@blog/contracts';
import { semanticEqual } from '@blog/contracts';
import { createApp, defineComponent, shallowRef, watch } from 'vue';
import type { App } from 'vue';
import { renderUi, initialUiState } from './ui.ts';
function themeSelection(model: ViewModel) {
  const config = model.kind === 'page' ? model.page.config : model.kind === 'detail' ? model.config : undefined;
  return config ? { id: config.themeId, version: config.themeVersion, options: config.themeOptions } : undefined;
}
export function createVueRenderer(): RendererAdapter {
  let app: App | undefined, context: RendererContext;
  const current = shallowRef<ViewModel>();
  return { frameworkId: 'vue', supportedThemeIds: ['minimal-list', 'card-grid'],
    mount(container, model, ctx) {
      if (app) throw new Error('already-mounted'); context = ctx; current.value = model;
      app = createApp(defineComponent({ setup() {
        const state = shallowRef(initialUiState());
        watch(() => themeSelection(current.value!), (next, previous) => {
          if (!semanticEqual(previous, next)) state.value = { ...state.value, draftTheme: '', draftOptions: {} };
        }, { flush: 'sync' });
        return () => renderUi(current.value!, context, state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; });
      } })); app.mount(container);
    },
    update(model) { if (!app) throw new Error('not-mounted'); current.value = model; },
    unmount() { app?.unmount(); app = undefined; current.value = undefined; }
  };
}
