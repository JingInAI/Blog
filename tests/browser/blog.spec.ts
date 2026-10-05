import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const config = (ids: string[] = ['a%+😀'], themeId = 'card-grid') => ({ version: 1, contentIds: ids, themeId, themeVersion: 1, themeOptions: { density: 'comfortable', showTags: true } });
async function configure(page: Page, theme = 'card-grid'): Promise<void> {
  await page.getByLabel('网页风格').selectOption(theme); await page.getByRole('button', { name: '应用风格', exact: true }).click();
}
for (const [index, setup] of [{ framework: 'vue', base: '/' }, { framework: 'react', base: '/' }, { framework: 'vue', base: '/Blog/' }, { framework: 'react', base: '/Blog/' }].entries()) {
  const origin = 'http://127.0.0.1:' + (4301 + index), address = origin + setup.base;
  test.describe(setup.framework + ' ' + setup.base, () => {
    test.beforeEach(async ({ request }) => { await request.get(origin + '/__control?version=v1&failImages=false'); });
    test('T10/T12: choose/order/theme/full text/share/save/refresh/history without invented facts', async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(address); await expect(page.getByRole('heading', { name: '测试站点' })).toBeVisible();
      await expect(page.getByRole('heading', { name: '选择风格与内容' })).toBeVisible();
      await configure(page); await page.getByLabel('选择：测试文章 A').check(); await page.getByLabel('选择：测试文章 B').check();
      await expect(page.locator('main article')).toHaveCount(2); await expect(page.locator('main')).not.toContainText('仅站点作者');
      await page.getByRole('button', { name: '上移：b', exact: true }).click(); await expect(page.locator('main article h2').first()).toHaveText('测试文章 B');
      await page.getByRole('button', { name: '生成分享链接', exact: true }).click(); const shared = await page.getByLabel('分享链接', { exact: true }).inputValue();
      expect(new URL(shared).pathname).toBe(setup.base); await page.goto(shared);
      await page.getByLabel('选择：测试文章 B').uncheck(); await expect(page.locator('main article')).toHaveCount(1);
      await page.reload(); await expect(page.locator('main article')).toHaveCount(2);
      await page.getByLabel('选择：测试文章 B').uncheck(); await page.getByRole('button', { name: '保存为个人配置', exact: true }).click(); expect(new URL(page.url()).search).toBe('');
      await page.reload(); await expect(page.locator('main article')).toHaveCount(1);
      await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
      await expect(page.locator('.prose')).toContainText('<script>window.INVENTED=true</script>'); expect(await page.evaluate(() => 'INVENTED' in window)).toBe(false);
      await expect(page.locator('.prose img')).toHaveAttribute('alt', '作者图片描述'); await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
      await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.goBack(); await expect(page.locator('.prose')).toBeVisible();
      await configure(page, 'minimal-list'); await expect(page.locator('.prose')).toContainText('作者原文 v1');
      expect(errors).toEqual([]);
    });
    test('T09b/T13d: summary keeps images idle, same-URL retry restores body, V1→V2 locks retries and explicit reload works', async ({ page, request, browser }) => {
      let imageRequests = 0; page.on('request', req => { if (req.url().endsWith('.png')) ++imageRequests; });
      const shared = address + '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'public-content', config: config() })) + '#/';
      await page.goto(shared); await expect(page.locator('main article h2')).toHaveText('测试文章 A'); expect(imageRequests).toBe(0);
      await request.get(origin + '/__control?version=v1&failImages=true'); await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click();
      await expect(page.getByRole('button', { name: '重试图片', exact: true })).toBeVisible(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
      await request.get(origin + '/__control?version=v1&failImages=false'); await page.getByRole('button', { name: '重试图片', exact: true }).click(); await expect(page.locator('.prose img')).toBeVisible();
      // Use a second, uncached old session: already decoded browser images may legitimately survive deployment.
      const freshContext = await browser.newContext(); const oldPage = await freshContext.newPage();
      try {
        await oldPage.goto(shared); await expect(oldPage.locator('main article h2')).toHaveText('测试文章 A'); await request.get(origin + '/__control?version=v2&failImages=false');
        await oldPage.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click(); await expect(oldPage.getByRole('button', { name: '更新页面', exact: true })).toBeVisible();
        await expect(oldPage.getByRole('button', { name: '重试图片', exact: true })).toHaveCount(0); await configure(oldPage, 'minimal-list'); await expect(oldPage.getByRole('button', { name: '重试图片', exact: true })).toHaveCount(0);
        await oldPage.getByRole('button', { name: '更新页面', exact: true }).click(); await expect(oldPage.locator('.prose')).toContainText('作者原文 v2'); expect(new URL(oldPage.url()).search).toContain('share='); expect(new URL(oldPage.url()).hash).toContain('/content/');
      } finally { await freshContext.close(); }
    });
    test('T08/T10: blocked storage and malformed share remain recoverable; save/reset partial report actual commits', async ({ page }) => {
      await page.addInitScript(() => {
        const original = history.replaceState.bind(history); let calls = 0;
        history.replaceState = (...args) => { ++calls; if (calls <= 2) throw new DOMException('blocked', 'SecurityError'); return original(...args); };
      });
      await page.goto(address + '?share=bad#/'); await expect(page.getByText('分享链接格式无效', { exact: true })).toBeVisible(); await configure(page); await page.getByLabel('选择：测试文章 A').check();
      await page.getByRole('button', { name: '保存为个人配置', exact: true }).click(); await expect(page.getByText('个人配置已保存，分享地址未清理。刷新仍会恢复原分享链接。', { exact: true })).toBeVisible();
      const raw = await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1')); expect(JSON.parse(raw!).contentIds).toEqual(['a%+😀']); expect(new URL(page.url()).search).toBe('?share=bad');
      await page.getByRole('button', { name: '重置个人配置', exact: true }).click(); await expect(page.getByText('个人配置已删除，分享地址未清理；当前展示保留，刷新仍按原链接加载。', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'))).toBeNull(); await expect(page.locator('main article')).toHaveCount(1);
      await page.getByRole('button', { name: '采用作者默认', exact: true }).click(); await expect(page.getByRole('heading', { name: '选择风格与内容' })).toBeVisible(); expect(new URL(page.url()).search).toBe('');
    });
    test('T06/T10/T12: external theme changes synchronize the form, same-target history and duplicate events preserve current state', async ({ page }) => {
      await page.goto(address); await configure(page, 'minimal-list');
      await page.getByLabel('间距', { exact: true }).selectOption(JSON.stringify('compact'));
      await page.getByLabel('选择：测试文章 A').check();
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('compact'));
      await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click();
      await expect(page.locator('.prose')).toContainText('作者原文 v1');
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('compact'));
      await page.getByRole('button', { name: '返回首页', exact: true }).click();
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('compact'));
      const personal = await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'));
      expect(JSON.parse(personal!).themeOptions.density).toBe('comfortable');
      const search = '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'public-content', config: config() }));
      await page.evaluate(search => { history.pushState(null, '', search + '#/'); dispatchEvent(new PopStateEvent('popstate')); dispatchEvent(new HashChangeEvent('hashchange')); }, search);
      await expect(page.locator('.posts')).toHaveClass(/card-grid/);
      await expect(page.getByLabel('网页风格')).toHaveValue('card-grid');
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('comfortable'));
      await page.getByRole('button', { name: '应用风格', exact: true }).click();
      await expect(page.locator('.posts')).toHaveClass(/card-grid/); expect(await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'))).toBe(personal);
      const compactSearch = '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'public-content', config: { ...config(), themeOptions: { density: 'compact', showTags: false } } }));
      await page.evaluate(search => { history.pushState(null, '', search + '#/'); dispatchEvent(new PopStateEvent('popstate')); }, compactSearch);
      await expect(page.getByLabel('网页风格')).toHaveValue('card-grid');
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('compact'));
      await expect(page.getByLabel('显示标签', { exact: true })).not.toBeChecked();
      expect(await page.evaluate(() => localStorage.getItem('blog:blog:public-content:display:v1'))).toBe(personal);
      await page.evaluate(() => { history.pushState(null, '', '?share=bad#/'); dispatchEvent(new PopStateEvent('popstate')); });
      await expect(page.getByText('分享链接格式无效', { exact: true })).toBeVisible();
      await page.goBack(); await expect(page.locator('.posts')).toHaveClass(/card-grid/); await expect(page.getByLabel('网页风格')).toHaveValue('card-grid');
      await expect(page.getByLabel('间距', { exact: true })).toHaveValue(JSON.stringify('compact'));
    });
    test('T04/T10/T13d: boot pointer failure shows retry, storage denied still renders usable configuration', async ({ page }) => {
      await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }));
      let first = true; await page.route('**/content/current.json', route => { if (first) { first = false; return route.abort(); } return route.continue(); });
      await page.goto(address); await expect(page.getByRole('button', { name: '重试启动', exact: true })).toBeVisible(); await page.getByRole('button', { name: '重试启动', exact: true }).click();
      await expect(page.getByText('无法访问个人配置存储', { exact: true })).toBeVisible(); await configure(page); await page.getByLabel('选择：测试文章 A').check(); await expect(page.locator('main article h2')).toHaveText('测试文章 A');
      await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
}
