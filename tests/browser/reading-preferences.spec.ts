import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const key = 'blog:blog:public-content:display:v1';
const select = async (page: Page, label: string, value: string) => page.getByLabel(label, { exact: true }).selectOption(value ? JSON.stringify(value) : '');
async function reading(page: Page) {
  return page.locator('main article').first().evaluate(article => {
    const prose = article.querySelector('.prose')!;
    const p = prose.querySelector('p')!, style = getComputedStyle(prose);
    const surface = document.querySelector('.blog-surface')!;
    return { text: prose.textContent, size: parseFloat(style.fontSize), font: style.fontFamily, line: parseFloat(style.lineHeight),
      paragraph: parseFloat(getComputedStyle(p).marginBottom), letter: style.letterSpacing, word: style.wordSpacing, align: getComputedStyle(p).textAlign,
      mainWidth: article.closest('main')!.getBoundingClientRect().width, background: getComputedStyle(surface).backgroundColor,
      imageCount: prose.querySelectorAll('img').length, codeLetter: getComputedStyle(prose.querySelector('code')!).letterSpacing };
  });
}
async function contrasts(page: Page) {
  return page.evaluate(() => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    };
    return ['main article', '.metadata', '.tags span', '.editor select', '.muted', '.prose a', '.post button', '.editor button', '.prose pre'].map(selector => {
      const element = document.querySelector(selector)!;
      let backgroundElement: Element = element;
      while (getComputedStyle(backgroundElement).backgroundColor === 'rgba(0, 0, 0, 0)') backgroundElement = backgroundElement.parentElement!;
      const foreground = luminance(getComputedStyle(element).color), background = luminance(getComputedStyle(backgroundElement).backgroundColor);
      return { selector, ratio: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
    });
  });
}
for (const [index, setup] of [
  { framework: 'vue', base: '/' }, { framework: 'react', base: '/' },
  { framework: 'vue', base: '/Blog/' }, { framework: 'react', base: '/Blog/' }
].entries()) {
  test(`${setup.framework} ${setup.base}: same-task changes preserve every reading option`, async ({ page, request }) => {
    const origin = `http://127.0.0.1:${4301 + index}`;
    await request.get(origin + '/__control?version=v1&failImages=false');
    await page.goto(origin + setup.base);
    await page.getByLabel('网页风格').selectOption('minimal-list');
    await expect(page.locator('.posts')).toHaveClass(/minimal-list/);
    await page.evaluate(() => {
      for (const [label, value] of [['字号', 'largest'], ['配色', 'dark'], ['网页风格', 'card-grid']]) {
        const control = document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
        control.value = label === '网页风格' ? value : JSON.stringify(value); control.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await expect.poll(async () => JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toMatchObject({ fontSize: 'largest', colorScheme: 'dark' });
    await expect(page.locator('.posts')).toHaveClass(/card-grid/);
    await page.reload();
    await expect(page.getByLabel('字号', { exact: true })).toHaveValue('"largest"');
    await expect(page.getByLabel('配色', { exact: true })).toHaveValue('"dark"');
  });
  test(`${setup.framework} ${setup.base}: same-task content additions and removals preserve selected order`, async ({ page, request }) => {
    const origin = `http://127.0.0.1:${4301 + index}`;
    await request.get(origin + '/__control?version=v1&failImages=false');
    await page.goto(origin + setup.base);
    await page.getByLabel('网页风格').selectOption('minimal-list');
    await expect(page.locator('.posts')).toHaveClass(/minimal-list/);
    await page.evaluate(() => {
      for (const label of ['选择：测试文章 A', '选择：测试文章 B']) {
        const control = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
        control.click();
      }
    });
    await expect(page.locator('main article')).toHaveCount(2);
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).contentIds).toEqual(['a%+😀', 'b']);
    await page.reload(); await expect(page.locator('main article')).toHaveCount(2);
    await page.evaluate(() => {
      const control = document.querySelector<HTMLInputElement>('input[aria-label="选择：测试文章 A"]')!;
      control.click(); control.click();
    });
    await expect(page.locator('main article')).toHaveCount(2);
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).contentIds).toEqual(['b', 'a%+😀']);
    await page.evaluate(() => {
      for (const label of ['移除：a%+😀', '移除：b']) document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    });
    await expect(page.locator('main article')).toHaveCount(0);
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).contentIds).toEqual([]);
  });
  test(`${setup.framework} ${setup.base}: every reading dimension changes appearance immediately, survives saving and respects share isolation`, async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const origin = `http://127.0.0.1:${4301 + index}`;
    await request.get(origin + '/__control?version=v1&failImages=false');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + setup.base);
    await page.getByLabel('网页风格').selectOption('minimal-list');
    await page.getByLabel('选择：测试文章 A').check();
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    const baseline = await reading(page);
    for (const sample of await contrasts(page)) expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
    for (const group of ['外观', '文字', '排版', '内容信息']) await expect(page.getByRole('group', { name: group, exact: true })).toBeVisible();
    await expect(page.getByLabel('配色')).toContainText('跟随系统');
    await select(page, '字号', 'largest');
    await expect.poll(async () => (await reading(page)).size).toBe(baseline.size * 2);
    await select(page, '字体', 'serif');
    await expect.poll(async () => (await reading(page)).font).toContain('serif');
    await select(page, '阅读宽度', 'narrow');
    await expect.poll(async () => (await reading(page)).mainWidth).toBeLessThan(baseline.mainWidth);
    await select(page, '正文行距', 'wide');
    await expect.poll(async () => (await reading(page)).line).toBe(baseline.size * 4);
    await select(page, '间距', 'compact');
    expect((await reading(page)).line).toBe(baseline.size * 4);
    await select(page, '段落间距', 'wide');
    await expect.poll(async () => (await reading(page)).paragraph).toBe(baseline.size * 4);
    await select(page, '字间距', 'wide');
    await expect.poll(async () => parseFloat((await reading(page)).letter)).toBeCloseTo(baseline.size * 2 * .12);
    await select(page, '词间距', 'wide');
    await expect.poll(async () => parseFloat((await reading(page)).word)).toBeCloseTo(baseline.size * 2 * .16);
    expect((await reading(page)).codeLetter).toBe('normal');
    await select(page, '正文对齐', 'justify');
    await expect.poll(async () => (await reading(page)).align).toBe('justify');
    await page.getByLabel('隐藏作者和日期').check();
    await expect(page.locator('.metadata time')).toHaveCount(0);
    await expect(page.locator('.metadata > span:not(.tags)')).toHaveCount(0);
    await expect(page.locator('.tags')).toHaveCount(1);
    await select(page, '配色', 'dark');
    await expect.poll(async () => (await reading(page)).background).not.toBe(baseline.background);
    const dark = (await reading(page)).background;
    for (const sample of await contrasts(page)) expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
    await select(page, '配色', 'sepia');
    await expect.poll(async () => (await reading(page)).background).not.toBe(dark);
    for (const sample of await contrasts(page)) expect(sample.ratio, sample.selector).toBeGreaterThanOrEqual(4.5);
    await select(page, '配色', 'auto');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => (await reading(page)).background).toBe(dark);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(async () => (await reading(page)).background).toBe(baseline.background);
    await select(page, '配色', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await reading(page)).background).toBe(baseline.background);
    await select(page, '配色', 'dark');
    const stored = await page.evaluate(key => localStorage.getItem(key), key);
    const expectedOptions = { density: 'compact', showTags: true, colorScheme: 'dark', fontSize: 'largest', fontFamily: 'serif', contentWidth: 'narrow', lineHeight: 'wide', paragraphSpacing: 'wide', letterSpacing: 'wide', wordSpacing: 'wide', textAlign: 'justify', hideMetadata: true };
    expect(JSON.parse(stored!).themeOptions).toEqual(expectedOptions);
    await page.getByLabel('网页风格').selectOption('card-grid');
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual(expectedOptions);
    await expect(page.locator('.summary')).toHaveText('明确摘要 A');
    expect(await page.locator('.summary').evaluate(p => parseFloat(getComputedStyle(p).fontSize))).toBe(baseline.size * 2);
    await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click();
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    const detail = await reading(page);
    expect(detail.text).toBe(baseline.text);
    expect(detail.imageCount).toBe(baseline.imageCount);
    const readingTarget = new URL(page.url()).hash;
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect((await reading(page)).size).toBe(baseline.size * 2);
    await page.getByRole('button', { name: '生成分享链接', exact: true }).click();
    const share = await page.getByLabel('分享链接', { exact: true }).inputValue();
    const record = await page.evaluate(key => localStorage.getItem(key), key);
    await page.goto(share); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    await select(page, '字号', '');
    await expect.poll(async () => (await reading(page)).size).toBe(baseline.size);
    expect(page.url()).toBe(share);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(record);
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect((await reading(page)).size).toBe(baseline.size * 2);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect((await reading(page)).text).toBe(baseline.text);
      if (width <= 390) {
        const panel = await page.getByLabel('展示设置', { exact: true }).evaluate(editor => ({ height: editor.getBoundingClientRect().height, scroll: editor.scrollHeight, client: editor.clientHeight }));
        expect(panel.height).toBeLessThanOrEqual(540);
        expect(panel.scroll).toBeGreaterThan(panel.client);
      }
    }
    await page.getByRole('button', { name: '恢复默认外观', exact: true }).click();
    await expect.poll(async () => (await reading(page)).size).toBe(baseline.size);
    expect((await reading(page)).background).toBe(baseline.background);
    await expect(page.locator('.metadata time')).toHaveCount(1);
    expect(new URL(page.url()).hash).toBe(readingTarget);
    await page.getByRole('button', { name: '保存为个人配置', exact: true }).click();
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect(JSON.parse((await page.evaluate(key => localStorage.getItem(key), key))!).themeOptions).toEqual({ density: 'comfortable', showTags: true });
    expect((await reading(page)).size).toBe(baseline.size);
    expect(errors).toEqual([]);
  });
}
