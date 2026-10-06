import type { RendererAdapter, RendererContext } from '@blog/contracts';
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderUi, createUiStore } from './ui.ts';
import type { UiStore } from './ui.ts';
function App({ store, context }: { store: UiStore; context: RendererContext }) {
  const [, refresh] = useState(0);
  return renderUi(store.model, context, store.state,
    next => { store.setState(next); refresh(value => value + 1); }, () => store);
}
export function createReactRenderer(): RendererAdapter {
  let root: Root | undefined, store: UiStore | undefined, context: RendererContext;
  return { frameworkId: 'react', supportedThemeIds: ['minimal-list', 'card-grid'],
    mount(container, model, ctx) {
      if (root) throw new Error('already-mounted'); context = ctx; store = createUiStore(model);
      root = createRoot(container); root.render(createElement(App, { store, context }));
    },
    update(model) { if (!root || !store) throw new Error('not-mounted'); store.update(model); root.render(createElement(App, { store, context })); },
    unmount() { root?.unmount(); root = undefined; store = undefined; }
  };
}
