import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, normalizeConfig, ThemeConfigError, verifyThemeImplementations } from '@blog/theme-contracts';
import type { ThemeRegistration } from '@blog/theme-contracts';
import { config } from './support.ts';
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
