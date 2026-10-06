import { assertJson, freeze, object, string, validId, ValidationError, semanticEqual } from '@blog/contracts';
import type { DisplayConfig, JsonObject, JsonValue, ThemeChoice, ThemeOptionDescriptor, ThemeValidationIssue } from '@blog/contracts';
export interface ThemeRegistration {
  id: string; label: string; version: number; frameworkIds: readonly string[];
  options: ThemeChoice['options']; defaults: JsonObject;
  validate(options: JsonObject): readonly ThemeValidationIssue[];
  migrations?: Readonly<Record<number, (config: DisplayConfig) => DisplayConfig>>;
}
const basicOptions: ThemeChoice['options'] = freeze([
  { key: 'colorScheme', label: '配色', group: '外观', kind: 'enum', required: false, choices: ['auto', 'light', 'dark', 'sepia'], choiceLabels: ['跟随系统', '浅色', '深色', '暖纸色'] },
  { key: 'fontSize', label: '字号', group: '文字', kind: 'enum', required: false, choices: ['normal', 'large', 'larger', 'largest'], choiceLabels: ['常规（100%）', '较大（125%）', '大号（150%）', '超大（200%）'] },
  { key: 'fontFamily', label: '字体', group: '文字', kind: 'enum', required: false, choices: ['sans', 'serif', 'mono'], choiceLabels: ['无衬线', '衬线', '等宽'] },
  { key: 'density', label: '间距', group: '排版', kind: 'enum', required: false, defaultValue: 'comfortable', choices: ['comfortable', 'compact'], choiceLabels: ['宽松', '紧凑'] },
  { key: 'contentWidth', label: '阅读宽度', group: '排版', kind: 'enum', required: false, choices: ['full', 'comfortable', 'narrow'], choiceLabels: ['铺满可用空间', '适中', '窄栏'] },
  { key: 'lineHeight', label: '正文行距', group: '排版', kind: 'enum', required: false, choices: ['normal', 'relaxed', 'wide'], choiceLabels: ['1.5 倍', '1.9 倍', '2 倍'] },
  { key: 'paragraphSpacing', label: '段落间距', group: '排版', kind: 'enum', required: false, choices: ['normal', 'relaxed', 'wide'], choiceLabels: ['常规（1 倍字号）', '宽松（1.5 倍字号）', '加宽（2 倍字号）'] },
  { key: 'letterSpacing', label: '字间距', group: '排版', kind: 'enum', required: false, choices: ['normal', 'wide'], choiceLabels: ['常规', '加宽（0.12 倍字号）'] },
  { key: 'wordSpacing', label: '词间距', group: '排版', kind: 'enum', required: false, choices: ['normal', 'wide'], choiceLabels: ['常规', '加宽（0.16 倍字号）'] },
  { key: 'textAlign', label: '正文对齐', group: '排版', kind: 'enum', required: false, choices: ['start', 'justify'], choiceLabels: ['起始侧对齐', '两端对齐'] },
  { key: 'showTags', label: '显示标签', group: '内容信息', kind: 'boolean', required: false, defaultValue: true },
  { key: 'hideMetadata', label: '隐藏作者和日期', group: '内容信息', kind: 'boolean', required: false }
]);
function basicValidate(options: JsonObject): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  if (options.density !== 'comfortable' && options.density !== 'compact') issues.push({ key: 'density', code: 'invalid-value' });
  if (typeof options.showTags !== 'boolean') issues.push({ key: 'showTags', code: 'invalid-value' });
  return issues;
}
export const themeRegistry: readonly ThemeRegistration[] = freeze([
  { id: 'minimal-list', label: '简洁列表', version: 1, frameworkIds: ['vue', 'react'], options: basicOptions, defaults: { density: 'comfortable', showTags: true }, validate: basicValidate },
  { id: 'card-grid', label: '卡片网格', version: 1, frameworkIds: ['vue', 'react'], options: basicOptions, defaults: { density: 'comfortable', showTags: true }, validate: basicValidate }
]);
// Only declared values become CSS classes. Optional reading preferences preserve
// the version-1 defaults when absent, including old personal and share records.
export function readingClasses(config: DisplayConfig | undefined): string {
  if (!config || !['minimal-list', 'card-grid'].includes(config.themeId)) return '';
  return basicOptions.filter(option => option.kind === 'enum' && option.key !== 'density' &&
    Object.hasOwn(config.themeOptions, option.key) && option.choices?.includes(config.themeOptions[option.key]))
    .map(option => `reading-${option.key}-${config.themeOptions[option.key]}`).join(' ');
}
export function themeSelectionOptions(theme: ThemeChoice | undefined, config: DisplayConfig | undefined): JsonObject {
  const next = structuredClone(theme?.defaults ?? {});
  if (config && theme && ['minimal-list', 'card-grid'].includes(config.themeId) && ['minimal-list', 'card-grid'].includes(theme.id)) {
    for (const option of basicOptions) {
      const descriptor = theme.options.find(candidate => candidate.key === option.key && candidate.kind === option.kind);
      if (descriptor && Object.hasOwn(config.themeOptions, option.key) && matchesDescriptor(config.themeOptions[option.key], descriptor)) {
        next[option.key] = structuredClone(config.themeOptions[option.key]);
      }
    }
  }
  return next;
}
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
    object(descriptor, ['key', 'label', 'kind', 'required', 'defaultValue', 'choices', 'choiceLabels', 'group'], 'theme.options');
    validId(descriptor.key, 'theme.options.key'); string(descriptor.label, 'theme.options.label', true);
    if (!['string', 'number', 'boolean', 'enum'].includes(descriptor.kind) || typeof descriptor.required !== 'boolean') throw new ValidationError('theme.options');
    if (keys.has(descriptor.key)) throw new ValidationError('theme.options', 'duplicate-option');
    keys.add(descriptor.key);
    if (descriptor.group !== undefined) string(descriptor.group, 'theme.options.group', true);
    if (descriptor.kind === 'enum') {
      assertJson(descriptor.choices);
      if (!Array.isArray(descriptor.choices) || !descriptor.choices.length) throw new ValidationError('theme.options.choices');
      if (descriptor.choices.some((value, index, values) => values.slice(0, index).some(previous => semanticEqual(previous, value)))) throw new ValidationError('theme.options.choices', 'duplicate-choice');
    }
    if (descriptor.choiceLabels !== undefined) {
      if (descriptor.kind !== 'enum' || !Array.isArray(descriptor.choiceLabels) || descriptor.choiceLabels.length !== descriptor.choices?.length) throw new ValidationError('theme.options.choiceLabels');
      descriptor.choiceLabels.forEach(label => string(label, 'theme.options.choiceLabels', true));
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
export function snapshotRegistry(registry = themeRegistry): readonly ThemeRegistration[] {
  registeredDefaults(registry);
  return freeze(registry.map(theme => ({ id: theme.id, label: theme.label, version: theme.version, validate: theme.validate,
    frameworkIds: [...theme.frameworkIds], options: structuredClone(theme.options), defaults: structuredClone(theme.defaults),
    ...(theme.migrations ? { migrations: { ...theme.migrations } } : {}) })));
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
    const migrate = theme.migrations && Object.hasOwn(theme.migrations, String(o.themeVersion)) ? theme.migrations[Number(o.themeVersion)] : undefined;
    if (typeof migrate !== 'function') throw new ValidationError('config.themeVersion');
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
