import type { RendererAdapter, RendererContext, ViewModel } from '@blog/contracts';
import { semanticEqual } from '@blog/contracts';
import { createElement, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderUi, initialUiState } from './ui.ts';
function themeSelection(model: ViewModel) {
  const config = model.kind === 'page' ? model.page.config : model.kind === 'detail' ? model.config : undefined;
  return config ? { id: config.themeId, version: config.themeVersion, options: config.themeOptions } : undefined;
}
function App({ model, context }: { model: ViewModel; context: RendererContext }) {
  const [state, setState] = useState(initialUiState);
  const committedTheme = useRef(themeSelection(model));
  useEffect(() => {
    const next = themeSelection(model);
    if (!semanticEqual(committedTheme.current, next)) {
      committedTheme.current = next;
      setState(previous => ({ ...previous, draftTheme: '', draftOptions: {} }));
    }
  }, [model]);
  return renderUi(model, context, state, setState);
}
export function createReactRenderer(): RendererAdapter {
  let root: Root | undefined, context: RendererContext;
  return { frameworkId: 'react', supportedThemeIds: ['minimal-list', 'card-grid'],
    mount(container, model, ctx) { if (root) throw new Error('already-mounted'); context = ctx; root = createRoot(container); root.render(createElement(App, { model, context })); },
    update(model) { if (!root) throw new Error('not-mounted'); root.render(createElement(App, { model, context })); },
    unmount() { root?.unmount(); root = undefined; }
  };
}
