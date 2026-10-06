import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, normalizeConfig, readingClasses, themeSelectionOptions, ThemeConfigError, verifyThemeImplementations } from '@blog/theme-contracts';
import type { ThemeRegistration } from '@blog/theme-contracts';
import { config } from './support.ts';
test('reading preferences keep legacy defaults, reject invalid values and round-trip across frameworks', () => {
  const options = { ...config().themeOptions, colorScheme: 'auto', fontSize: 'largest', fontFamily: 'serif', contentWidth: 'narrow', lineHeight: 'wide', paragraphSpacing: 'wide', letterSpacing: 'wide', wordSpacing: 'wide', textAlign: 'start', hideMetadata: true };
  for (const framework of ['vue', 'react']) {
    assert.deepEqual(normalizeConfig(config(), framework), config());
    const normalized = normalizeConfig({ ...config(), themeOptions: options }, framework);
    assert.deepEqual(normalized.themeOptions, options);
    assert.deepEqual(normalizeConfig(JSON.parse(JSON.stringify(normalized)), framework), normalized);
    for (const key of Object.keys(options)) {
      assert.throws(() => normalizeConfig({ ...config(), themeOptions: { ...options, [key]: key === 'hideMetadata' || key === 'showTags' ? 'true' : 'invented' } }, framework), ThemeConfigError);
    }
    const target = choices(framework).find(theme => theme.id === 'card-grid')!;
    assert.deepEqual(themeSelectionOptions(target, normalized), options);
    const selected = themeSelectionOptions(target, normalized);
    selected.fontSize = 'normal'; assert.equal(normalized.themeOptions.fontSize, 'largest');
    assert.equal(readingClasses({ ...normalized, themeId: 'custom' }), '');
    assert.equal(readingClasses({ ...normalized, themeOptions: { fontSize: 'largest bad-class', colorScheme: ['dark'] } }), '');
    assert.match(readingClasses(normalized), /reading-fontSize-largest/);
    assert.deepEqual(themeSelectionOptions(target, { ...normalized, themeId: 'custom' }), target.defaults);
  }
});
test('option labels and groups are validated without changing JSON enum values', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['vue'], defaults: {}, validate: () => [],
    options: [{ key: 'tone', label: 'tone', group: '外观', kind: 'enum', required: false, choices: [null, { mode: 'author' }], choiceLabels: ['无', '作者风格'] }] };
  assert.deepEqual(choices('vue', [theme])[0].options, theme.options);
  for (const changes of [{ group: '' }, { group: 1 }, { choiceLabels: ['无'] }, { choiceLabels: ['无', ''] }, { choiceLabels: ['无', 1] }, { choiceLabels: '无' }, { kind: 'string' }]) {
    assert.throws(() => choices('vue', [{ ...theme, options: [{ ...theme.options[0], ...changes } as ThemeRegistration['options'][number]] }]));
  }
  assert.deepEqual(normalizeConfig({ ...config([], 'test'), themeOptions: { tone: { mode: 'author' } } }, 'vue', [theme]).themeOptions, { tone: { mode: 'author' } });
});
test('T08: enum parameters reject JSON arrays instead of coercing them into a valid choice', () => {
  assert.throws(() => normalizeConfig({ ...config(), themeOptions: { density: ['compact'] } }, 'react'), error => error instanceof ThemeConfigError && error.issues.length === 1 && error.issues[0].key === 'density' && error.issues[0].code === 'invalid-value');
});
test('T08/T10: descriptors enforce field types even when a custom validator accepts its input', () => {
  const registry: ThemeRegistration[] = [{ id: 'test', label: 'test', version: 1, frameworkIds: ['react'],
    options: [{ key: 'enabled', label: 'enabled', kind: 'boolean', required: true }, { key: 'size', label: 'size', kind: 'number', required: false }], defaults: {}, validate: () => [] }];
  for (const options of [{ enabled: 'true' }, { enabled: [] }, { enabled: true, size: '12' }]) assert.throws(() => normalizeConfig({ ...config([], 'test'), themeOptions: options }, 'react', registry), error => error instanceof ThemeConfigError && error.issues.length === 1 && error.issues[0].code === 'invalid-value');
});
test('T08/T10: descriptor defaults are shared by normalization and controls, contradictory defaults are rejected', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [{ key: 'enabled', label: 'enabled', kind: 'boolean', required: false, defaultValue: true }], defaults: {}, validate: () => [] };
  assert.deepEqual(normalizeConfig({ ...config([], 'test'), themeOptions: {} }, 'react', [theme]).themeOptions, { enabled: true });
  assert.deepEqual(choices('react', [theme])[0].defaults, { enabled: true });
  assert.throws(() => choices('react', [{ ...theme, defaults: { enabled: false } }]));
  assert.throws(() => choices('react', [{ ...theme, defaults: { unknown: true } }]));
  assert.throws(() => choices('react', [{ ...theme, options: [{ ...theme.options[0], defaultValue: 'true' }] }]));
});
test('T08/T11: ambiguous or invalid theme registrations fail before choosing a framework implementation', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react'], options: [], defaults: {}, validate: () => [] };
  const registries: ThemeRegistration[][] = [
    [theme, { ...theme, version: 2 }], [theme, { ...theme, frameworkIds: ['vue'] }],
    [{ ...theme, version: 0 }], [{ ...theme, version: NaN }], [{ ...theme, id: 'bad/id' }],
    [{ ...theme, frameworkIds: ['react', 'react'] }], [{ ...theme, frameworkIds: [] }],
    [{ ...theme, options: [{ key: 'enabled', label: 'enabled', kind: 'invented', required: false } as unknown as ThemeRegistration['options'][number]] }]
  ];
  for (const registry of registries) {
    assert.throws(() => choices('react', registry));
    assert.throws(() => normalizeConfig({ ...config([], 'test'), themeOptions: {} }, 'react', registry));
    assert.throws(() => verifyThemeImplementations('react', ['test'], registry));
  }
});
test('T08/T10: legal prototype-named option keys preserve own JSON values and do not inherit absent defaults', () => {
  const theme: ThemeRegistration = { id: 'test', label: 'test', version: 1, frameworkIds: ['react', 'vue'], defaults: {},
    options: [{ key: '__proto__', label: 'enum', kind: 'enum', required: false, choices: [{ tone: 'author' }, 'explicit', null] },
      { key: 'constructor', label: 'string', kind: 'string', required: false },
      { key: 'toString', label: 'number', kind: 'number', required: false }], validate: () => [] };
  for (const framework of ['vue', 'react']) {
    assert.deepEqual(normalizeConfig({ ...config([], 'test'), themeOptions: {} }, framework, [theme]).themeOptions, {});
    for (const value of [{ tone: 'author' }, 'explicit', null]) {
      const options = Object.fromEntries([['__proto__', value], ['constructor', '作者明确填写的样式文字'], ['toString', 2.75]]);
      const normalized = normalizeConfig({ ...config([], 'test'), themeOptions: options }, framework, [theme]);
      assert.deepEqual(normalized.themeOptions, options); assert.ok(Object.hasOwn(normalized.themeOptions, '__proto__'));
      assert.equal(Object.getPrototypeOf(normalized.themeOptions), Object.prototype);
      assert.deepEqual(JSON.parse(JSON.stringify(normalized)).themeOptions, options);
    }
    const withDefault = { ...theme, options: theme.options.map(option => option.key === '__proto__' ? { ...option, defaultValue: { tone: 'author' } } : option) };
    assert.deepEqual(choices(framework, [withDefault])[0].defaults, Object.fromEntries([['__proto__', { tone: 'author' }]]));
  }
  assert.equal(Object.hasOwn(Object.prototype, 'tone'), false);
});
