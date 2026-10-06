import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const setups = ['vue', 'react'].flatMap(framework => [false, true].flatMap(api => ['/', '/Blog/'].map(base => ({ framework, api, base,
  port: (api ? 4306 : 4301) + (framework === 'react' ? 1 : 0) + (base === '/Blog/' ? 2 : 0) }))));
async function checkParameters(page: Page) {
  await page.getByLabel('阅读标签：参数与训练', { exact: true }).check();
  await expect(page.locator('.prose')).toContainText('参数段原文');
  await expect(page.locator('.prose')).toContainText('实现段原文');
  await expect(page.locator('.prose')).not.toContainText('记忆段原文');
  await expect(page.locator('.prose')).not.toContainText('反馈段原文');
}
for (const setup of setups) {
  const origin = 'http://127.0.0.1:' + setup.port, address = origin + setup.base;
  test.describe(`Reader ${setup.framework} ${setup.api ? 'API' : 'static'} ${setup.base}`, () => {
    test.beforeEach(async ({ request }) => { await request.get((setup.api ? 'http://127.0.0.1:4305' : origin) + (setup.api ? '/__control?reset=true&reader=true' : '/__control?version=reader&failImages=false')); });
    test('tags filter actual sections immediately, preserve evidence/resources and restore full text', async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(address); await page.getByLabel('网页风格').selectOption('card-grid');
      await checkParameters(page); await expect(page.locator('main article')).toHaveCount(1);
      await expect(page.getByLabel('选择：' + (setup.api ? 'API 文章 A' : '测试文章 A'), { exact: true })).not.toBeChecked();
      await page.getByLabel('阅读标签：工程实践', { exact: true }).check();
      await expect(page.locator('.prose')).toContainText('导读原文');
      await expect(page.locator('.prose img')).toHaveAttribute('alt', '参数图原始说明');
      await expect.poll(() => page.locator('.prose img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.getByText('查看匹配依据与原文位置', { exact: true }).click();
      await expect(page.locator('.reader-evidence').first()).toBeVisible();
      await expect(page.locator('.reader-match')).toContainText('参数与训练');
      await page.getByRole('button', { name: /^定位片段：/ }).first().click();
      await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-reader-section'))).toBe(true);
      // Rapid events must merge the newest reader and style state in both frameworks.
      await page.evaluate(() => {
        const label = (name: string) => document.querySelector<HTMLInputElement>(`[aria-label="${name}"]`)!;
        label('阅读标签：记忆').click(); label('阅读标签：记忆').click();
        const select = document.querySelector<HTMLSelectElement>('[aria-label="间距"]')!;
        select.value = JSON.stringify('compact'); select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await expect(page.getByLabel('阅读标签：参数与训练', { exact: true })).toBeChecked();
      await expect(page.getByLabel('阅读标签：工程实践', { exact: true })).toBeChecked();
      await expect(page.getByLabel('阅读标签：记忆', { exact: true })).not.toBeChecked();
      await expect(page.locator('.prose')).not.toContainText('记忆段原文');
      await page.reload(); await expect(page.locator('.prose')).toContainText('参数段原文');
      await page.getByLabel('阅读视图', { exact: true }).selectOption('full');
      await expect(page.locator('main article')).toHaveCount(setup.api ? 1 : 2);
      await expect(page.locator('.prose').first()).toContainText('记忆段原文');
      await page.getByRole('button', { name: '清除阅读标签', exact: true }).click();
      await expect(page.locator('main article')).toHaveCount(0);
      await page.getByLabel('候选范围', { exact: true }).selectOption('selected');
      await page.getByLabel('阅读标签：记忆', { exact: true }).check();
      await expect(page.locator('main')).toContainText('当前范围没有候选文章');
      await expect(page.locator('main')).not.toContainText('没有符合所选标签');
      await page.getByLabel('候选范围', { exact: true }).selectOption('catalog');
      await expect(page.locator('.prose')).toContainText('记忆段原文');
      await page.route(setup.api ? '**/api/contents?**' : '**/catalog-*.json', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
      await page.reload(); await expect(page.locator('.reader-status')).toContainText('部分内容未能完成分析');
      await expect(page.locator('main')).not.toContainText('没有符合所选标签');
      expect(errors).toEqual([]);
    });
    test('footnotes, explicit scope, no matches and shared reader settings remain faithful', async ({ page }) => {
      await page.goto(address); await page.getByLabel('网页风格').selectOption('minimal-list');
      const title = setup.api ? 'API 文章 A' : '测试文章 A'; await page.getByLabel('选择：' + title, { exact: true }).check();
      await page.getByLabel('候选范围', { exact: true }).selectOption('selected');
      await page.getByLabel('阅读标签：反馈与验收', { exact: true }).check();
      await expect(page.locator('.prose')).toContainText('反馈段原文'); await expect(page.locator('.prose')).toContainText('脚注原文');
      await expect(page.locator('.prose')).not.toContainText('参数段原文');
      const ref = page.locator('.prose a[href^="#fn-"]'); await expect(ref).toHaveCount(1); const href = await ref.getAttribute('href');
      await ref.click(); await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(href!.slice(1));
      await page.getByRole('button', { name: '生成分享链接', exact: true }).click(); const shared = await page.getByLabel('分享链接', { exact: true }).inputValue();
      expect(JSON.parse(new URL(shared).searchParams.get('share')!).config.reader.tagIds).toEqual(['feedback']);
      await page.goto(shared); await expect(page.locator('.prose')).toContainText('反馈段原文');
      await page.getByLabel('阅读标签：反馈与验收', { exact: true }).uncheck(); await page.getByLabel('阅读标签：记忆', { exact: true }).check();
      await expect(page.locator('.prose')).toContainText('记忆段原文'); await expect(page.locator('.prose')).not.toContainText('反馈段原文');
      await page.reload(); await expect(page.locator('.prose')).toContainText('反馈段原文');
      await page.getByLabel('阅读标签：反馈与验收', { exact: true }).uncheck();
      await page.getByLabel('阅读标签：记忆', { exact: true }).check(); await page.getByLabel('阅读标签：了解基本概念', { exact: true }).check();
      await expect(page.locator('main article')).toHaveCount(0); await expect(page.locator('main')).toContainText('没有符合所选标签的片段');
      await page.getByRole('button', { name: '查看候选文章全文', exact: true }).click(); await expect(page.locator('.prose')).toContainText('参数段原文');
      await page.getByRole('button', { name: '保存为个人配置', exact: true }).click(); expect(new URL(page.url()).search).toBe('');
      await page.reload(); await expect(page.getByLabel('阅读标签：记忆', { exact: true })).toBeChecked();
      await page.getByRole('button', { name: '清除阅读标签', exact: true }).click(); await expect(page.locator('main article')).toHaveCount(1); await expect(page.locator('.prose')).toContainText('参考段原文');
    });
  });
}
