import { assertJson, freeze, object, string, validId, ValidationError, semanticEqual, normalizeReaderSelection } from '@blog/contracts';
import type { DisplayConfig, JsonObject, JsonValue, ThemeChoice, ThemeOptionDescriptor, ThemeValidationIssue } from '@blog/contracts';
export interface ThemeRegistration {
  id: string; label: string; version: number; frameworkIds: readonly string[];
  options: ThemeChoice['options']; defaults: JsonObject;
  validate(options: JsonObject): readonly ThemeValidationIssue[];
  migrations?: Readonly<Record<number, (config: DisplayConfig) => DisplayConfig>>;
}
function enumOption(key: string, label: string, group: string, values: readonly (readonly [string, string])[], defaultValue?: string): ThemeOptionDescriptor {
  return { key, label, group, kind: 'enum', required: false, choices: values.map(([value]) => value), choiceLabels: values.map(([, name]) => name),
    ...(defaultValue === undefined ? {} : { defaultValue }) };
}
const basicOptions: ThemeChoice['options'] = freeze([
  enumOption('colorScheme', '配色', '外观', [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色'], ['sepia', '暖纸色'], ['slate', '冷灰色'], ['night', '午夜蓝'], ['contrast', '高对比黑色']]),
  enumOption('fontSize', '字号', '文字', [['small', '较小（87.5%）'], ['normal', '常规（100%）'], ['medium', '稍大（112.5%）'], ['large', '较大（125%）'], ['larger', '大号（150%）'], ['extra', '加大（175%）'], ['largest', '超大（200%）'], ['huge', '特大（250%）']]),
  enumOption('fontFamily', '字体', '文字', [['sans', '无衬线'], ['serif', '衬线'], ['mono', '等宽'], ['system', '系统界面字体'], ['rounded', '圆体'], ['kai', '楷体']]),
  enumOption('fontWeight', '正文字重', '文字', [['regular', '常规（400）'], ['medium', '中等（500）'], ['semibold', '半粗（600）'], ['bold', '粗体（700）']]),
  enumOption('headingScale', '标题大小', '文字', [['compact', '缩小（90%）'], ['normal', '常规（100%）'], ['large', '较大（115%）'], ['larger', '大号（130%）'], ['largest', '超大（150%）']]),
  enumOption('density', '间距', '排版', [['compact', '紧凑'], ['normal', '适中'], ['comfortable', '宽松'], ['loose', '疏朗'], ['airy', '开阔']], 'comfortable'),
  enumOption('contentWidth', '阅读宽度', '排版', [['full', '铺满可用空间'], ['wide', '宽栏（52rem）'], ['comfortable', '适中（40rem）'], ['medium', '中窄（34rem）'], ['narrow', '窄栏（28rem）'], ['slim', '极窄（22rem）']]),
  enumOption('lineHeight', '正文行距', '排版', [['tight', '紧凑（1.3 倍）'], ['normal', '1.5 倍'], ['comfortable', '1.7 倍'], ['relaxed', '1.9 倍'], ['wide', '2 倍'], ['extra', '加宽（2.4 倍）']]),
  enumOption('paragraphSpacing', '段落间距', '排版', [['compact', '紧凑（0.5 倍字号）'], ['normal', '常规（1 倍字号）'], ['relaxed', '宽松（1.5 倍字号）'], ['wide', '加宽（2 倍字号）'], ['extra', '更宽（2.5 倍字号）'], ['spacious', '开阔（3 倍字号）']]),
  enumOption('letterSpacing', '字间距', '排版', [['normal', '常规'], ['fine', '微宽（0.03 倍字号）'], ['relaxed', '稍宽（0.06 倍字号）'], ['wide', '加宽（0.12 倍字号）'], ['extra', '更宽（0.18 倍字号）']]),
  enumOption('wordSpacing', '词间距', '排版', [['normal', '常规'], ['fine', '微宽（0.04 倍字号）'], ['relaxed', '稍宽（0.08 倍字号）'], ['wide', '加宽（0.16 倍字号）'], ['extra', '更宽（0.24 倍字号）']]),
  enumOption('textAlign', '正文对齐', '排版', [['start', '起始侧对齐'], ['justify', '两端对齐'], ['center', '居中'], ['end', '末尾侧对齐']]),
  enumOption('paragraphIndent', '首行缩进', '排版', [['none', '不缩进'], ['small', '1 倍字号'], ['normal', '2 倍字号'], ['large', '3 倍字号']]),
  enumOption('linkStyle', '正文链接样式', '链接', [['underline', '实线下划线'], ['dotted', '点状下划线'], ['thick', '加粗下划线'], ['highlight', '底色突出']]),
  enumOption('codeFontSize', '代码字号', '代码', [['small', '较小（80%）'], ['compact', '稍小（90%）'], ['normal', '常规（100%）'], ['large', '较大（110%）'], ['larger', '大号（125%）']]),
  enumOption('codeWrap', '代码换行', '代码', [['wrap', '保留空白并换行'], ['scroll', '保留原行并横向滚动'], ['break', '长词也换行']]),
  enumOption('imageWidth', '图片宽度', '图片', [['natural', '原始尺寸，限制为可用宽度'], ['full', '铺满可用宽度'], ['large', '75% 可用宽度'], ['medium', '50% 可用宽度'], ['small', '35% 可用宽度']]),
  enumOption('imageAlign', '图片对齐', '图片', [['inline', '随原文行内排列'], ['start', '单独一行，起始侧'], ['center', '单独一行，居中'], ['end', '单独一行，末尾侧']]),
  enumOption('imageCorners', '图片圆角', '图片', [['square', '直角'], ['normal', '小圆角（4px）'], ['soft', '柔和（12px）'], ['round', '大圆角（24px）']]),
  enumOption('imageBorder', '图片边框', '图片', [['none', '无边框'], ['thin', '细线（1px）'], ['medium', '中线（2px）'], ['thick', '粗线（4px）']]),
  enumOption('tableDensity', '表格间距', '表格与列表', [['compact', '紧凑'], ['normal', '常规'], ['relaxed', '宽松'], ['roomy', '开阔']]),
  enumOption('tableStripes', '表格行底色', '表格与列表', [['none', '无交替底色'], ['soft', '轻柔交替'], ['strong', '明显交替']]),
  enumOption('listSpacing', '列表项间距', '表格与列表', [['none', '无额外间距'], ['compact', '紧凑（0.2 倍字号）'], ['normal', '常规（0.4 倍字号）'], ['relaxed', '宽松（0.75 倍字号）'], ['wide', '加宽（1 倍字号）']]),
  enumOption('tagStyle', '标签样式', '内容信息', [['plain', '纯文字'], ['soft', '柔和底色'], ['outline', '描边'], ['pill', '胶囊']]),
  { key: 'showTags', label: '显示标签', group: '内容信息', kind: 'boolean', required: false, defaultValue: true },
  { key: 'hideMetadata', label: '隐藏作者和日期', group: '内容信息', kind: 'boolean', required: false }
]);
function basicValidate(options: JsonObject): ThemeValidationIssue[] {
  const issues: ThemeValidationIssue[] = [];
  if (!['compact', 'normal', 'comfortable', 'loose', 'airy'].includes(options.density as string)) issues.push({ key: 'density', code: 'invalid-value' });
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
  const o = object(value, ['version', 'contentIds', 'themeId', 'themeVersion', 'themeOptions', 'reader'], 'config');
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
  return { version: 1, contentIds: ids, themeId: theme.id, themeVersion: theme.version, themeOptions: options, ...(Object.hasOwn(o, 'reader') ? { reader: normalizeReaderSelection(o.reader) } : {}) };
}
export function verifyThemeImplementations(frameworkId: string, supported: readonly string[], registry = themeRegistry): void {
  registeredDefaults(registry);
  const expected = registry.filter(t => t.frameworkIds.includes(frameworkId)).map(t => t.id);
  if (new Set(supported).size !== supported.length || expected.length !== supported.length || expected.some(id => !supported.includes(id))) throw new ValidationError('renderer.themes');
}
export function optionDefault(value: JsonValue | undefined): JsonValue { return value ?? ''; }
