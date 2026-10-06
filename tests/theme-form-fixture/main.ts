import { BlogController } from '@blog/render-core';
import { createVueRenderer } from '@blog/renderer-vue';
import { createReactRenderer } from '@blog/renderer-react';
import type { ContentSource } from '@blog/contracts';
import type { ThemeRegistration } from '@blog/theme-contracts';

// These descriptors exercise the extension contract; they are never production themes or content.
const registry: ThemeRegistration[] = [
  { id: 'minimal-list', label: '有默认值的测试主题', version: 1, frameworkIds: ['vue', 'react'], defaults: { enabled: false, choice: null },
    options: [{ key: 'enabled', label: '必填布尔值', kind: 'boolean', required: true },
      { key: 'choice', label: 'JSON 枚举', kind: 'enum', required: true, choices: ['named', null, 0, false, { size: 2 }, ['x']] },
      { key: 'amount', label: '可选数字', kind: 'number', required: false },
      { key: 'caption', label: '必填字符串', kind: 'string', required: true, defaultValue: '' },
      { key: 'constructor', label: '作者扩展字符串', kind: 'string', required: false },
      { key: 'toString', label: '作者扩展数字', kind: 'number', required: false },
      { key: '__proto__', label: '作者扩展枚举', kind: 'enum', required: false, choices: [{ tone: 'author' }, 'explicit', null] }], validate: () => [] },
  { id: 'card-grid', label: '无默认值的测试主题', version: 1, frameworkIds: ['vue', 'react'], defaults: {},
    options: [{ key: 'enabled', label: '必填布尔值', kind: 'boolean', required: true },
      { key: 'choice', label: 'JSON 枚举', kind: 'enum', required: true, choices: ['named', null] },
      { key: 'optional', label: '可选枚举', kind: 'enum', required: false, choices: ['first', null] }], validate: () => [] }
];
const source: ContentSource = {
  async getSite() { return { info: { schemaVersion: 1 }, diagnostics: [], source: { kind: 'http', sourceId: 'theme-fixture' } }; },
  async list() { return { items: [], diagnostics: [] }; },
  async get() { throw new Error('The theme fixture has no content.'); }
};
const adapter = __FRAMEWORK__ === 'vue' ? createVueRenderer() : createReactRenderer();
const controller = new BlogController({ frameworkId: adapter.frameworkId, registry, siteId: 'theme-form-fixture',
  factory: { identity: { kind: 'http', sourceId: 'theme-fixture' }, async initialize() { return { kind: 'http', sourceId: 'theme-fixture', sourceInstanceId: 'theme-fixture-instance', source }; } },
  storage: { read: key => localStorage.getItem(key), write: (key, value) => localStorage.setItem(key, value), remove: key => localStorage.removeItem(key) },
  sessionUrl: { removeShare: expected => expected }, shareBaseUrl: window.location.origin + '/', initialLocation: { target: { kind: 'home' }, search: '' } });
adapter.mount(document.getElementById('app')!, controller.getModel(), controller.context(() => {}, () => {}));
controller.subscribe(model => {
  adapter.update(model);
  const config = model.kind === 'page' ? model.page.config : model.kind === 'detail' ? model.config : null;
  document.getElementById('committed')!.textContent = JSON.stringify(config);
});
controller.start();
