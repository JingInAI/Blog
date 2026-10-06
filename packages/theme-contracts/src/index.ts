import { assertJson, freeze, object, string, validId, ValidationError, semanticEqual } from '@blog/contracts';
import type { DisplayConfig, JsonObject, JsonValue, ThemeChoice, ThemeOptionDescriptor, ThemeValidationIssue } from '@blog/contracts';
export interface ThemeRegistration {
  id: string; label: string; version: number; frameworkIds: readonly string[];
  options: ThemeChoice['options']; defaults: JsonObject;
  validate(options: JsonObject): readonly ThemeValidationIssue[];
  migrations?: Readonly<Record<number, (config: DisplayConfig) => DisplayConfig>>;
}
const basicOptions: ThemeChoice['options'] = [
  { key: 'density', label: '间距', kind: 'enum', required: false, defaultValue: 'comfortable', choices: ['comfortable', 'compact'] },
  { key: 'showTags', label: '显示标签', kind: 'boolean', required: false, defaultValue: true }
];
function basicValidate(options: JsonObject): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  for (const key of Object.keys(options)) if (!['density', 'showTags'].includes(key)) issues.push({ key, code: 'unknown-option' });
  if (options.density !== 'comfortable' && options.density !== 'compact') issues.push({ key: 'density', code: 'invalid-value' });
  if (typeof options.showTags !== 'boolean') issues.push({ key: 'showTags', code: 'invalid-value' });
  return issues;
}
export const themeRegistry: readonly ThemeRegistration[] = [
  { id: 'minimal-list', label: '简洁列表', version: 1, frameworkIds: ['vue', 'react'], options: basicOptions, defaults: { density: 'comfortable', showTags: true }, validate: basicValidate },
  { id: 'card-grid', label: '卡片网格', version: 1, frameworkIds: ['vue', 'react'], options: basicOptions, defaults: { density: 'comfortable', showTags: true }, validate: basicValidate }
];
export class ThemeConfigError extends ValidationError {
  constructor(readonly issues: readonly ThemeValidationIssue[]) { super('config', 'invalid-config'); }
}
function matchesDescriptor(value: JsonValue, descriptor: ThemeOptionDescriptor): boolean {
  switch (descriptor.kind) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'boolean': return typeof value === 'boolean';
    case 'enum': return !!descriptor.choices?.some(choice => semanticEqual(value, choice));
  }
}
function descriptorIssues(options: JsonObject, descriptors: ThemeChoice['options']): ThemeValidationIssue[] {
  return [
    ...Object.keys(options).filter(key => !descriptors.some(d => d.key === key)).map(key => ({ key, code: 'unknown-option' as const })),
    ...descriptors.flatMap<ThemeValidationIssue>(d => !Object.hasOwn(options, d.key)
      ? d.required ? [{ key: d.key, code: 'required' as const }] : []
      : matchesDescriptor(options[d.key], d) ? [] : [{ key: d.key, code: 'invalid-value' as const }])
  ];
}
function themeDefaults(theme: ThemeRegistration): JsonObject {
  assertJson(theme.defaults);
  object(theme.defaults, Object.keys(theme.defaults), 'theme.defaults');
  const defaults: JsonObject = { ...theme.defaults };
  const keys = new Set<string>();
  for (const descriptor of theme.options) {
    assertJson(descriptor);
    object(descriptor, ['key', 'label', 'kind', 'required', 'defaultValue', 'choices'], 'theme.options');
    validId(descriptor.key, 'theme.options.key'); string(descriptor.label, 'theme.options.label', true);
    if (!['string', 'number', 'boolean', 'enum'].includes(descriptor.kind) || typeof descriptor.required !== 'boolean') throw new ValidationError('theme.options');
    if (keys.has(descriptor.key)) throw new ValidationError('theme.options', 'duplicate-option');
    keys.add(descriptor.key);
    if (descriptor.kind === 'enum') {
      assertJson(descriptor.choices);
      if (!Array.isArray(descriptor.choices) || !descriptor.choices.length) throw new ValidationError('theme.options.choices');
    }
    if (Object.hasOwn(descriptor, 'defaultValue')) {
      assertJson(descriptor.defaultValue);
      if (Object.hasOwn(defaults, descriptor.key) && !semanticEqual(defaults[descriptor.key], descriptor.defaultValue)) throw new ValidationError('theme.defaults', 'conflicting-default');
      Object.defineProperty(defaults, descriptor.key, { value: descriptor.defaultValue, writable: true, enumerable: true, configurable: true });
    }
  }
  if (descriptorIssues(defaults, theme.options).some(issue => issue.code !== 'required')) throw new ValidationError('theme.defaults');
  return defaults;
}
function registeredDefaults(registry: readonly ThemeRegistration[]): Map<string, JsonObject> {
  const defaults = new Map<string, JsonObject>();
  for (const theme of registry) {
    validId(theme.id, 'theme.id'); string(theme.label, 'theme.label', true);
    if (defaults.has(theme.id)) throw new ValidationError('theme.id', 'duplicate-theme');
    if (!Number.isSafeInteger(theme.version) || theme.version < 1) throw new ValidationError('theme.version');
    if (!Array.isArray(theme.frameworkIds) || !theme.frameworkIds.length || new Set(theme.frameworkIds).size !== theme.frameworkIds.length) throw new ValidationError('theme.frameworkIds');
    Array.from(theme.frameworkIds).forEach(id => validId(id, 'theme.frameworkIds'));
    if (!Array.isArray(theme.options) || typeof theme.validate !== 'function') throw new ValidationError('theme');
    defaults.set(theme.id, themeDefaults(theme));
  }
  return defaults;
}
export function choices(frameworkId: string, registry = themeRegistry): ThemeChoice[] {
  const defaults = registeredDefaults(registry);
  return registry.map(t => ({ id: t.id, label: t.label, version: t.version, options: structuredClone(t.options), defaults: structuredClone(defaults.get(t.id)!),
    availability: t.frameworkIds.includes(frameworkId) ? 'available' : 'unsupported-framework',
    ...(t.frameworkIds.includes(frameworkId) ? {} : { unavailableReason: 'unsupported-framework' as const }) }));
}
export function normalizeConfig(value: unknown, frameworkId: string, registry = themeRegistry): DisplayConfig {
  const defaults = registeredDefaults(registry);
  assertJson(value);
  const o = object(value, ['version', 'contentIds', 'themeId', 'themeVersion', 'themeOptions'], 'config');
  if (o.version !== 1 || !Array.isArray(o.contentIds) || typeof o.themeId !== 'string' || !Number.isInteger(o.themeVersion) || Number(o.themeVersion) < 1) throw new ValidationError('config');
  const ids = o.contentIds.map(id => validId(id)); if (new Set(ids).size !== ids.length) throw new ValidationError('config.contentIds');
  const theme = registry.find(t => t.id === o.themeId && t.frameworkIds.includes(frameworkId));
  if (!theme) throw new ValidationError('config.themeId');
  if (o.themeVersion !== theme.version) {
    const migrate = theme.migrations?.[Number(o.themeVersion)];
    if (!migrate) throw new ValidationError('config.themeVersion');
    // A migration must directly reach the current version; cycles never recurse.
    const migrated = migrate(structuredClone(o) as unknown as DisplayConfig); assertJson(migrated);
    const repeated = migrate(structuredClone(o) as unknown as DisplayConfig); assertJson(repeated);
    if (!semanticEqual(migrated, repeated)) throw new ValidationError('migration', 'non-deterministic-migration');
    if (migrated.themeId !== theme.id || migrated.themeVersion !== theme.version) throw new ValidationError('migration');
    return normalizeConfig(migrated, frameworkId, registry);
  }
  const input = object(o.themeOptions, Object.keys(o.themeOptions as object ?? {}), 'config.themeOptions') as JsonObject;
  const options: JsonObject = structuredClone({ ...defaults.get(theme.id)!, ...input });
  const issues = [...descriptorIssues(options, theme.options), ...theme.validate(freeze(structuredClone(options)))]
    .filter((issue, index, all) => all.findIndex(other => other.key === issue.key && other.code === issue.code) === index);
  if (issues.length) throw new ThemeConfigError(issues);
  assertJson(options); if (!semanticEqual(options, JSON.parse(JSON.stringify(options)))) throw new ValidationError('config.themeOptions');
  return { version: 1, contentIds: ids, themeId: theme.id, themeVersion: theme.version, themeOptions: options };
}
export function verifyThemeImplementations(frameworkId: string, supported: readonly string[], registry = themeRegistry): void {
  registeredDefaults(registry);
  const expected = registry.filter(t => t.frameworkIds.includes(frameworkId)).map(t => t.id);
  if (new Set(supported).size !== supported.length || expected.length !== supported.length || expected.some(id => !supported.includes(id))) throw new ValidationError('renderer.themes');
}
export function optionDefault(value: JsonValue | undefined): JsonValue { return value ?? ''; }
