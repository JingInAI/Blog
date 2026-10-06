import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
const key = 'blog:blog:public-content:display:v1';
const select = (page: Page, label: string, value: string) => page.getByLabel(label, { exact: true }).selectOption(value ? JSON.stringify(value) : '');
async function css(page: Page, selector: string, property: string) {
  return page.locator(selector).first().evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property);
}
async function paletteContrast(page: Page) {
  return page.evaluate(() => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    };
    return ['main article', '.metadata', '.tags span', '.editor select', '.muted', '.prose a[href="https://example.com/authored"]', '.post button', '.editor button', '.prose pre'].map(selector => {
      const element = document.querySelector(selector)!; let backgroundElement = element;
      while (getComputedStyle(backgroundElement).backgroundColor === 'rgba(0, 0, 0, 0)') backgroundElement = backgroundElement.parentElement!;
      const a = luminance(getComputedStyle(element).color), b = luminance(getComputedStyle(backgroundElement).backgroundColor);
      return { selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
}
const numericCases: [string, string, string, Record<string, number>][] = [
  ['字号', '.prose', 'font-size', { small: 14, normal: 16, medium: 18, large: 20, larger: 24, extra: 28, largest: 32, huge: 40 }],
  ['正文字重', '.prose', 'font-weight', { regular: 400, medium: 500, semibold: 600, bold: 700 }],
  ['标题大小', 'article > h2', 'font-size', { compact: 21.6, normal: 24, large: 27.6, larger: 31.2, largest: 36 }],
  ['间距', 'main article', 'padding-top', { compact: 16, normal: 22.4, comfortable: 28.8, loose: 35.2, airy: 41.6 }],
  ['正文行距', '.prose', 'line-height', { tight: 20.8, normal: 24, comfortable: 27.2, relaxed: 30.4, wide: 32, extra: 38.4 }],
  ['段落间距', '.prose > p', 'margin-bottom', { compact: 8, normal: 16, relaxed: 24, wide: 32, extra: 40, spacious: 48 }],
  ['首行缩进', '.prose > p', 'text-indent', { none: 0, small: 16, normal: 32, large: 48 }],
  ['代码字号', '.prose pre code', 'font-size', { small: 12.8, compact: 14.4, normal: 16, large: 17.6, larger: 20 }],
  ['图片圆角', '.prose img', 'border-top-left-radius', { square: 0, normal: 4, soft: 12, round: 24 }],
  ['图片边框', '.prose img', 'border-top-width', { none: 0, thin: 1, medium: 2, thick: 4 }],
  ['表格间距', '.prose td', 'padding-top', { compact: 4, normal: 6.4, relaxed: 10.4, roomy: 16 }],
  ['列表项间距', '.prose li', 'margin-bottom', { none: 0, compact: 3.2, normal: 6.4, relaxed: 12, wide: 16 }]
];
for (const [index, setup] of [{ framework: 'vue', base: '/' }, { framework: 'react', base: '/' }, { framework: 'vue', base: '/Blog/' }, { framework: 'react', base: '/Blog/' }].entries()) {
  const origin = `http://127.0.0.1:${4301 + index}`;
  test(`${setup.framework} ${setup.base}: all expanded choices change computed styles and preserve author content`, async ({ page, request }) => {
    test.setTimeout(120000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await request.get(origin + '/__control?version=v1&failImages=false');
    await page.setViewportSize({ width: 1920, height: 1000 }); await page.goto(origin + setup.base);
    await page.getByLabel('网页风格').selectOption('card-grid'); await page.getByLabel('选择：测试文章 A').check();
    await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click();
    await expect(page.locator('.prose img')).toBeVisible();
    await expect.poll(() => page.locator('.prose img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const original = await page.locator('.prose').textContent(), code = await page.locator('.prose pre code').textContent();
    const image = await page.locator('.prose img').getAttribute('src'), alt = await page.locator('.prose img').getAttribute('alt');
    for (const group of ['外观', '文字', '排版', '链接', '代码', '图片', '表格与列表', '内容信息']) await expect(page.getByRole('group', { name: group, exact: true })).toBeVisible();
    for (const [label, selector, property, values] of numericCases) {
      for (const [value, expected] of Object.entries(values)) {
        await select(page, label, value);
        await expect.poll(async () => parseFloat(await css(page, selector, property)), `${label} ${value}`).toBeCloseTo(expected, 2);
      }
      await select(page, label, '');
    }
    for (const [value, expected] of Object.entries({ sans: 'Noto Sans SC', serif: 'Noto Serif SC', mono: 'ui-monospace', system: 'system-ui', rounded: 'ui-rounded', kai: 'KaiTi' })) {
      await select(page, '字体', value); await expect.poll(() => css(page, '.prose', 'font-family')).toContain(expected);
    }
    await select(page, '字体', '');
    for (const [value, expected] of Object.entries({ full: 'none', wide: '832px', comfortable: '640px', medium: '544px', narrow: '448px', slim: '352px' })) {
      await select(page, '阅读宽度', value); await expect.poll(() => css(page, 'main', 'max-width')).toBe(expected);
    }
    await select(page, '阅读宽度', '');
    for (const [label, property, values] of [['字间距', 'letter-spacing', { normal: 'normal', fine: '.48px', relaxed: '.96px', wide: '1.92px', extra: '2.88px' }], ['词间距', 'word-spacing', { normal: 'normal', fine: '.64px', relaxed: '1.28px', wide: '2.56px', extra: '3.84px' }]] as const) {
      for (const [value, expected] of Object.entries(values)) {
        await select(page, label, value);
        if (expected === 'normal') await expect.poll(() => css(page, '.prose', property)).toBe(property === 'word-spacing' ? '0px' : 'normal');
        else await expect.poll(async () => parseFloat(await css(page, '.prose', property))).toBeCloseTo(parseFloat(expected), 2);
        expect(await css(page, '.prose code', property)).toBe(property === 'word-spacing' ? '0px' : 'normal');
      }
      await select(page, label, '');
    }
    for (const value of ['start', 'justify', 'center', 'end']) { await select(page, '正文对齐', value); await expect.poll(() => css(page, '.prose > p', 'text-align')).toBe(value); }
    await select(page, '正文对齐', '');
    const link = '.prose a[href="https://example.com/authored"]';
    for (const value of ['underline', 'dotted', 'thick', 'highlight']) {
      await select(page, '正文链接样式', value);
      await expect.poll(() => css(page, link, 'text-decoration-style')).toBe(value === 'dotted' ? 'dotted' : 'solid');
      expect(await css(page, link, 'text-decoration-line')).toBe('underline');
      if (value === 'thick') expect(parseFloat(await css(page, link, 'text-decoration-thickness'))).toBeCloseTo(2.4);
      expect(await css(page, link, 'background-color')).toBe(value === 'highlight' ? 'rgb(239, 243, 233)' : 'rgba(0, 0, 0, 0)');
    }
    await select(page, '正文链接样式', '');
    for (const value of ['wrap', 'scroll', 'break']) {
      await select(page, '代码换行', value); await expect.poll(() => css(page, '.prose pre', 'white-space')).toBe(value === 'scroll' ? 'pre' : 'pre-wrap');
      expect(await css(page, '.prose pre', 'overflow-wrap')).toBe(value === 'break' ? 'anywhere' : 'normal');
      expect(await page.locator('.prose pre code').textContent()).toBe(code);
    }
    await select(page, '代码换行', '');
    const available = await page.locator('.prose img').evaluate(img => img.closest('p')!.getBoundingClientRect().width);
    for (const [value, scale] of Object.entries({ natural: 0, full: 1, large: .75, medium: .5, small: .35 })) {
      await select(page, '图片宽度', value);
      await expect.poll(async () => parseFloat(await css(page, '.prose img', 'width'))).toBeCloseTo(scale ? available * scale : 1, 1);
    }
    await select(page, '图片宽度', '');
    for (const value of ['inline', 'start', 'center', 'end']) {
      await select(page, '图片对齐', value); await expect.poll(() => css(page, '.prose img', 'display')).toBe(value === 'inline' ? 'inline' : 'block');
      if (value !== 'inline') {
        const position = await page.locator('.prose img').evaluate(img => { const a = img.getBoundingClientRect(), b = img.closest('p')!.getBoundingClientRect(); return { left: a.left - b.left, right: b.right - a.right }; });
        if (value === 'start') expect(position.left).toBeCloseTo(0);
        if (value === 'end') expect(position.right).toBeCloseTo(0);
        if (value === 'center') expect(position.left).toBeCloseTo(position.right);
      }
    }
    await select(page, '图片对齐', '');
    for (const [value, expected] of Object.entries({ none: 'rgba(0, 0, 0, 0)', soft: 'rgb(233, 241, 233)', strong: 'rgb(239, 243, 233)' })) {
      await select(page, '表格行底色', value); await expect.poll(() => css(page, '.prose tbody tr', 'background-color')).toBe(expected);
    }
    await select(page, '表格行底色', '');
    for (const [value, radius] of Object.entries({ plain: 0, soft: 3, outline: 3, pill: 999 })) {
      await select(page, '标签样式', value); await expect.poll(async () => parseFloat(await css(page, '.tags span', 'border-top-left-radius'))).toBe(radius);
      expect(await css(page, '.tags span', 'border-top-width')).toBe(value === 'outline' ? '1px' : '0px');
      expect(await css(page, '.tags span', 'background-color')).toBe(['plain', 'outline'].includes(value) ? 'rgba(0, 0, 0, 0)' : 'rgb(239, 243, 233)');
    }
    await select(page, '标签样式', '');
    for (const [value, expected] of Object.entries({ light: 'rgb(246, 247, 243)', dark: 'rgb(20, 32, 28)', sepia: 'rgb(244, 234, 215)', slate: 'rgb(238, 242, 246)', night: 'rgb(15, 21, 34)', contrast: 'rgb(0, 0, 0)', auto: 'rgb(246, 247, 243)' })) {
      await select(page, '配色', value); await expect.poll(() => css(page, '.blog-surface', 'background-color')).toBe(expected);
      for (const sample of await paletteContrast(page)) expect(sample.ratio, `${value} ${sample.selector}`).toBeGreaterThanOrEqual(4.5);
    }
    await select(page, '配色', '');
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual({ density: 'comfortable', showTags: true });
    expect(await page.locator('.prose').textContent()).toBe(original); expect(await page.locator('.prose img').getAttribute('src')).toBe(image);
    expect(await page.locator('.prose img').getAttribute('alt')).toBe(alt); expect(errors).toEqual([]);
  });
  test(`${setup.framework} ${setup.base}: expanded preferences combine immediately, restore from shares and fit small screens`, async ({ page, request }) => {
    test.setTimeout(60000);
    await request.get(origin + '/__control?version=v1&failImages=false'); await page.goto(origin + setup.base);
    await page.getByLabel('网页风格').selectOption('minimal-list'); await page.getByLabel('选择：测试文章 A').check(); await expect(page.locator('.prose img')).toBeVisible();
    const original = await page.locator('.prose').textContent(), code = await page.locator('.prose pre code').textContent();
    const options = { colorScheme: 'contrast', fontSize: 'huge', fontFamily: 'kai', fontWeight: 'bold', headingScale: 'largest', density: 'airy', contentWidth: 'slim', lineHeight: 'extra', paragraphSpacing: 'spacious', letterSpacing: 'extra', wordSpacing: 'extra', textAlign: 'end', paragraphIndent: 'large', linkStyle: 'highlight', codeFontSize: 'larger', codeWrap: 'scroll', imageWidth: 'full', imageAlign: 'center', imageCorners: 'round', imageBorder: 'thick', tableDensity: 'roomy', tableStripes: 'strong', listSpacing: 'wide', tagStyle: 'pill', showTags: true };
    const labels = { 配色: 'contrast', 字号: 'huge', 字体: 'kai', 正文字重: 'bold', 标题大小: 'largest', 间距: 'airy', 阅读宽度: 'slim', 正文行距: 'extra', 段落间距: 'spacious', 字间距: 'extra', 词间距: 'extra', 正文对齐: 'end', 首行缩进: 'large', 正文链接样式: 'highlight', 代码字号: 'larger', 代码换行: 'scroll', 图片宽度: 'full', 图片对齐: 'center', 图片圆角: 'round', 图片边框: 'thick', 表格间距: 'roomy', 表格行底色: 'strong', 列表项间距: 'wide', 标签样式: 'pill' };
    await page.evaluate(labels => {
      for (const [label, value] of Object.entries(labels)) { const control = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!; control.value = JSON.stringify(value); control.dispatchEvent(new Event('change', { bubbles: true })); }
    }, labels);
    await expect.poll(async () => JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual(options);
    await expect.poll(async () => parseFloat(await css(page, '.prose', 'font-size'))).toBe(40);
    await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click(); await page.getByLabel('网页风格').selectOption('card-grid');
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual(options);
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    await page.getByRole('button', { name: '生成分享链接', exact: true }).click(); const share = await page.getByLabel('分享链接', { exact: true }).inputValue();
    const record = await page.evaluate(key => localStorage.getItem(key), key); await page.goto(share); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    await select(page, '字号', 'small'); await expect.poll(async () => parseFloat(await css(page, '.prose', 'font-size'))).toBe(14);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(record); expect(page.url()).toBe(share);
    await page.reload(); await expect.poll(async () => parseFloat(await css(page, '.prose', 'font-size'))).toBe(40);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.prose').textContent()).toBe(original); expect(await page.locator('.prose pre code').textContent()).toBe(code);
      if (width <= 390) expect(await page.getByLabel('展示设置', { exact: true }).evaluate(panel => panel.getBoundingClientRect().height)).toBeLessThanOrEqual(540);
    }
    expect(await page.locator('.prose pre').evaluate(pre => pre.scrollWidth > pre.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '保存为个人配置', exact: true }).click(); await page.reload();
    await expect.poll(async () => JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual(options);
    await page.getByRole('button', { name: '恢复默认外观', exact: true }).click();
    await expect.poll(async () => parseFloat(await css(page, '.prose', 'font-size'))).toBe(16);
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual({ density: 'comfortable', showTags: true });
    expect(await page.locator('.prose').textContent()).toBe(original);
  });
}
