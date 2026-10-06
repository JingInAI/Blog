import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, normalizeConfig, readingClasses, themeSelectionOptions, ThemeConfigError } from '@blog/theme-contracts';
import { createShareUrl, parseShare } from '@blog/render-core';
import { config } from './support.ts';

test('expanded reading: every declared value is valid in both frameworks, unknown values and types are rejected', () => {
  for (const framework of ['vue', 'react']) {
    const theme = choices(framework)[0];
    assert.equal(theme.options.length, 26);
    for (const option of theme.options.filter(option => option.kind === 'enum')) {
      assert.ok(option.choices!.length >= 3); assert.equal(option.choiceLabels!.length, option.choices!.length);
      for (const value of option.choices!) {
        const display = normalizeConfig({ ...config(), themeOptions: { ...config().themeOptions, [option.key]: value } }, framework);
        assert.equal(display.themeOptions[option.key], value);
        if (option.key !== 'density') assert.ok(readingClasses(display).split(' ').includes(`reading-${option.key}-${value}`));
      }
      for (const invalid of ['unknown-value', null, true, 1, ['normal']]) {
        assert.throws(() => normalizeConfig({ ...config(), themeOptions: { ...config().themeOptions, [option.key]: invalid } }, framework), ThemeConfigError);
      }
    }
    assert.deepEqual(normalizeConfig(config(), framework), config());
  }
});
test('expanded reading: complete preferences survive cross-framework sharing and layout changes without adding defaults', () => {
  const options = { ...config().themeOptions, ...Object.fromEntries(choices('vue')[0].options.filter(option => option.kind === 'enum').map(option => [option.key, option.choices!.at(-1)!])) };
  const display = { ...config(['文章%+😀']), themeOptions: options };
  for (const framework of ['vue', 'react']) {
    const normalized = normalizeConfig(display, framework);
    assert.deepEqual(normalized, display);
    const target = choices(framework).find(theme => theme.id === 'card-grid')!;
    assert.deepEqual(themeSelectionOptions(target, normalized), options);
    for (const base of ['https://site.test/', 'https://site.test/Blog/']) {
      const url = new URL(createShareUrl(base, 'test', normalized, { kind: 'detail', id: '文章%+😀' }, framework));
      const parsed = parseShare(url.search, 'test', framework === 'vue' ? 'react' : 'vue');
      assert.equal(parsed.state.status, 'valid'); assert.deepEqual(parsed.config, display);
    }
    assert.deepEqual(target.defaults, { density: 'comfortable', showTags: true });
    assert.equal(normalized.themeVersion, 1);
  }
});
