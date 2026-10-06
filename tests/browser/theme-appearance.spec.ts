import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function appearance(page: Page) {
  return page.locator('main article').evaluate(article => {
    const style = getComputedStyle(article);
    const prose = article.querySelector('.prose')!;
    const paragraph = prose.querySelector('p')!;
    return {
      padding: Number.parseFloat(style.paddingTop),
      border: Number.parseFloat(style.borderTopWidth),
      background: style.backgroundColor,
      lineHeight: Number.parseFloat(getComputedStyle(prose).lineHeight),
      paragraphMargin: Number.parseFloat(getComputedStyle(paragraph).marginBottom),
      text: prose.textContent,
      width: article.getBoundingClientRect().width,
      mainWidth: article.closest('main')!.getBoundingClientRect().width
    };
  });
}

for (const [index, setup] of [
  { framework: 'vue', base: '/' }, { framework: 'react', base: '/' },
  { framework: 'vue', base: '/Blog/' }, { framework: 'react', base: '/Blog/' }
].entries()) {
  test(`${setup.framework} ${setup.base}: detail themes and spacing change computed appearance and preserve full text`, async ({ page, request }) => {
    const origin = `http://127.0.0.1:${4301 + index}`;
    await request.get(origin + '/__control?version=v1&failImages=false');
    const config = { version: 1, contentIds: ['a%+😀'], themeId: 'card-grid', themeVersion: 1, themeOptions: { density: 'comfortable', showTags: true } };
    const address = origin + setup.base + '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'public-content', config })) + '#/content/' + encodeURIComponent('a%+😀');
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(address);
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    const comfortable = await appearance(page);
    expect(comfortable.border).toBeGreaterThan(0);
    expect(comfortable.width / comfortable.mainWidth).toBeGreaterThan(.95);

    await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('compact'));
    await expect.poll(async () => (await appearance(page)).padding).toBeLessThan(comfortable.padding);
    const compact = await appearance(page);
    expect(compact.lineHeight).toBeLessThan(comfortable.lineHeight);
    expect(compact.paragraphMargin).toBeLessThan(comfortable.paragraphMargin);
    expect(compact.text).toBe(comfortable.text);

    await page.getByLabel('网页风格').selectOption('minimal-list');
    await expect.poll(async () => (await appearance(page)).border).toBe(0);
    const minimal = await appearance(page);
    expect(minimal.background).not.toBe(comfortable.background);
    expect(minimal.text).toBe(comfortable.text);
    await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('compact'));
    await expect.poll(async () => (await appearance(page)).padding).toBeLessThan(minimal.padding);
    expect((await appearance(page)).text).toBe(comfortable.text);

    await page.getByRole('button', { name: '生成分享链接', exact: true }).click();
    const share = await page.getByLabel('分享链接', { exact: true }).inputValue();
    await page.goto(share);
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect((await appearance(page)).border).toBe(0);
    expect((await appearance(page)).lineHeight).toBe(compact.lineHeight);
    await page.getByRole('button', { name: '保存为个人配置', exact: true }).click();
    await page.reload();
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect((await appearance(page)).lineHeight).toBe(compact.lineHeight);
    expect(new URL(page.url()).hash).toContain('/content/');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const layout = await appearance(page);
      expect(layout.width / layout.mainWidth).toBeGreaterThan(.95);
      expect(layout.text).toBe(comfortable.text);
    }
    await page.getByRole('button', { name: '返回首页', exact: true }).click();
    await expect(page.locator('.posts')).toHaveClass(/minimal-list.*compact/);
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    expect((await appearance(page)).lineHeight).toBe(compact.lineHeight);
    expect(errors).toEqual([]);
  });

  test(`${setup.framework} ${setup.base}: home selects apply immediately, ordinary changes save and share edits stay temporary`, async ({ page, request }) => {
    const origin = `http://127.0.0.1:${4301 + index}`, address = origin + setup.base;
    await request.get(origin + '/__control?version=v1&failImages=false');
    await page.goto(address);
    await page.getByLabel('网页风格').selectOption('card-grid');
    await expect(page.locator('.posts')).toHaveClass(/card-grid/);
    await expect(page.locator('main article')).toHaveCount(0);
    await page.getByLabel('选择：测试文章 A').check();
    await expect(page.locator('.summary')).toHaveText('明确摘要 A');
    await page.getByLabel('网页风格').selectOption('minimal-list');
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    const comfortable = await appearance(page);
    await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('compact'));
    await expect.poll(async () => (await appearance(page)).lineHeight).toBeLessThan(comfortable.lineHeight);
    await page.getByLabel('显示标签', { exact: true }).uncheck();
    await expect(page.locator('.tags')).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'));
    expect(JSON.parse(stored!).themeOptions).toEqual({ density: 'compact', showTags: false });
    await page.reload();
    await expect(page.locator('.posts')).toHaveClass(/minimal-list.*compact/);
    await expect(page.locator('.tags')).toHaveCount(0);
    await page.getByRole('button', { name: '生成分享链接', exact: true }).click();
    const share = await page.getByLabel('分享链接', { exact: true }).inputValue();
    await page.goto(share);
    await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('comfortable'));
    await expect.poll(async () => (await appearance(page)).lineHeight).toBe(comfortable.lineHeight);
    await page.getByLabel('网页风格').selectOption('card-grid');
    await expect(page.locator('.prose')).toHaveCount(0);
    await expect(page.locator('.posts')).toHaveClass(/card-grid/);
    expect(page.url()).toBe(share);
    expect(await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'))).toBe(stored);
    await page.reload();
    await expect(page.locator('.posts')).toHaveClass(/minimal-list.*compact/);
    await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('comfortable'));
    await page.getByRole('button', { name: '保存为个人配置', exact: true }).click();
    expect(new URL(page.url()).search).toBe('');
    await page.reload();
    await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('comfortable'));
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
  });
}
