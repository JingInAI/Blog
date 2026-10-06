import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
const api = 'http://127.0.0.1:4305';
const config = { version: 1, contentIds: ['api%+😀'], themeId: 'card-grid', themeVersion: 1, themeOptions: { density: 'comfortable', showTags: true } };
async function configure(page: Page, theme = 'card-grid'): Promise<void> {
  await page.getByLabel('网页风格').selectOption(theme); await page.getByRole('button', { name: '应用风格', exact: true }).click();
}
for (const [index, setup] of [{ framework: 'vue', base: '/' }, { framework: 'react', base: '/' }, { framework: 'vue', base: '/Blog/' }, { framework: 'react', base: '/Blog/' }].entries()) {
  const origin = 'http://127.0.0.1:' + (4306 + index), address = origin + setup.base;
  const share = address + '?share=' + encodeURIComponent(JSON.stringify({ sourceId: 'api-content', config })) + '#/';
  test.describe('HTTP ' + setup.framework + ' ' + setup.base, () => {
    test.beforeEach(async ({ request }) => { await request.get(api + '/__control?reset=true'); });
    test('T03/T10: malformed UTF-8 API bytes fail without fabricated replacement text and recover after reload', async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      const pattern = api + '/api/contents/*';
      await page.route(pattern, async route => {
        const response = await route.fetch(), data = await response.json();
        data.item.title = '__INVALID_UTF8_TITLE__';
        const text = JSON.stringify(data), marker = JSON.stringify(data.item.title), index = text.indexOf(marker);
        expect(index).toBeGreaterThanOrEqual(0);
        const bytes = Buffer.concat([Buffer.from(text.slice(0, index + 1)), Buffer.from([0xc3, 0x28]), Buffer.from(text.slice(index + marker.length - 1))]);
        await route.fulfill({ response, body: bytes });
      });
      await page.goto(share);
      await expect(page.locator('main').getByText('内容响应不符合约定', { exact: true })).toBeVisible();
      await expect(page.locator('main h2')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '重试内容', exact: true })).toHaveCount(0);
      await page.unroute(pattern); await page.reload();
      await expect(page.locator('main article h2')).toHaveText('API 文章 A');
      await page.getByRole('button', { name: '阅读全文：API 文章 A', exact: true }).click();
      await expect(page.locator('.prose')).toContainText('API 作者原文');
      expect(errors).toEqual([]);
    });
    test('T03/T10: duplicate raw API article facts fail visibly and a corrected response loads after reload', async ({ page }) => {
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
      const pattern = api + '/api/contents/*';
      await page.route(pattern, async route => {
        const response = await route.fetch(), text = await response.text();
        expect(text).toContain('"title":');
        await route.fulfill({ response, body: text.replace('"title":', '"title":"不能静默覆盖的作者事实","title":') });
      });
      await page.goto(share);
      await expect(page.locator('main').getByText('内容响应不符合约定', { exact: true })).toBeVisible();
      await expect(page.locator('main h2')).toHaveCount(0);
      await expect(page.locator('main')).not.toContainText('不能静默覆盖的作者事实');
      await expect(page.getByRole('button', { name: '重试内容', exact: true })).toHaveCount(0);
      await page.unroute(pattern); await page.reload();
      await expect(page.locator('main article h2')).toHaveText('API 文章 A');
      await page.getByRole('button', { name: '阅读全文：API 文章 A', exact: true }).click();
      await expect(page.locator('.prose')).toContainText('API 作者原文');
      expect(errors).toEqual([]);
    });
    test('T03/T10/T12: cross-origin API drives catalog/body/images/themes/share and excludes credentials and static requests', async ({ page, context, request }) => {
      const urls: string[] = [], errors: string[] = [];
      page.on('request', req => urls.push(req.url())); page.on('pageerror', error => errors.push(error.message));
      await context.addCookies([{ name: 'api-cookie', value: 'test-only', domain: '127.0.0.1', path: '/' }]);
      await page.goto(address); await expect(page.getByRole('heading', { name: 'API 测试站点' })).toBeVisible();
      await configure(page); await page.getByLabel('选择：API 文章 A').check();
      await expect(page.locator('main article')).toContainText('API 明确摘要');
      await expect(page.locator('main')).not.toContainText('API 站点作者');
      expect(urls.filter(url => url.endsWith('.png'))).toHaveLength(0);
      await page.getByRole('button', { name: '加载更多', exact: true }).click(); await page.getByLabel('选择：API 文章 B').check();
      await expect(page.locator('main article')).toHaveCount(2);
      await page.getByRole('button', { name: '阅读全文：API 文章 A', exact: true }).click();
      await expect(page.locator('.prose')).toContainText('API 作者原文');
      await expect(page.locator('.prose')).toContainText('<script>window.API_INVENTED=true</script>');
      expect(await page.evaluate(() => 'API_INVENTED' in window)).toBe(false);
      await expect(page.locator('.prose img')).toHaveAttribute('src', api + '/assets/photo.png');
      await expect(page.locator('.prose img')).toHaveAttribute('alt', 'API 作者图片说明');
      await expect.poll(() => page.locator('.prose img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await configure(page, 'minimal-list'); await expect(page.locator('.prose')).toContainText('API 作者原文');
      await page.getByRole('button', { name: '生成分享链接', exact: true }).click();
      const shared = await page.getByLabel('分享链接', { exact: true }).inputValue();
      expect(new URL(shared).pathname).toBe(setup.base); expect(new URL(shared).hash).toBe('#/content/' + encodeURIComponent('api%+😀'));
      await page.goto(shared); await expect(page.locator('.prose')).toContainText('API 作者原文'); await page.reload(); await expect(page.locator('.prose')).toContainText('API 作者原文');
      await expect(page.locator('body')).not.toContainText('SITE_UNKNOWN_VALUE');
      await expect(page.locator('body')).not.toContainText('CATALOG_UNKNOWN_VALUE');
      await expect(page.locator('body')).not.toContainText('DETAIL_UNKNOWN_VALUE');
      await expect(page.locator('.feedback')).toContainText('site.extraField');
      await expect(page.locator('main')).toContainText('item.extraField');
      const requests = await (await request.get(api + '/__stats')).json() as Array<{ path: string; cookiePresent: boolean }>;
      expect(requests.length).toBeGreaterThan(0); expect(requests.every(req => !req.cookiePresent)).toBe(true);
      expect(requests.some(req => req.path === '/api/contents/' + encodeURIComponent('api%+😀'))).toBe(true);
      expect(urls.some(url => url.includes('/content/current.json') || url.includes('/content/') && url.endsWith('.json'))).toBe(false);
      expect(errors).toEqual([]);
    });
    test('T03/T04/T10: site failures are independent, unavailable content retries, unauthorized catalog never becomes empty success', async ({ page, request }) => {
      await request.get(api + '/__control?siteStatus=503&detailMode=unavailable');
      await page.goto(share); await expect(page.getByRole('button', { name: '重试站点信息', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '重试内容', exact: true })).toBeVisible();
      await request.get(api + '/__control?detailMode=valid'); await page.getByRole('button', { name: '重试内容', exact: true }).click();
      await expect(page.locator('main article h2')).toHaveText('API 文章 A');
      await expect(page.getByRole('button', { name: '重试站点信息', exact: true })).toBeVisible();
      await request.get(api + '/__control?siteStatus=200'); await page.getByRole('button', { name: '重试站点信息', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'API 测试站点' })).toBeVisible();
      await request.get(api + '/__control?listStatus=401'); await page.getByRole('button', { name: '刷新目录', exact: true }).click();
      await expect(page.getByText('需要授权', { exact: true })).toBeVisible(); await expect(page.locator('main article h2')).toHaveText('API 文章 A');
      await expect(page.getByText('没有已发布的内容', { exact: true })).toHaveCount(0);
      await request.get(api + '/__control?listStatus=200'); await page.getByRole('button', { name: '刷新目录', exact: true }).click();
      await expect(page.getByText('需要授权', { exact: true })).toHaveCount(0); await expect(page.getByLabel('选择：API 文章 A')).toBeVisible();
      await expect(page.getByRole('button', { name: '更新页面', exact: true })).toHaveCount(0);
    });
    test('T03/T04/T10: CORS failure and wrong identity/draft responses have honest recovery without static fallback', async ({ page, request }) => {
      const urls: string[] = []; page.on('request', req => urls.push(req.url()));
      await request.get(api + '/__control?cors=false'); await page.goto(address);
      await expect(page.locator('.feedback').getByText('网络请求失败', { exact: true })).toBeVisible();
      await expect(page.locator('.selection').getByText('网络请求失败', { exact: true })).toBeVisible();
      await expect(page.getByText('没有已发布的内容', { exact: true })).toHaveCount(0);
      await request.get(api + '/__control?cors=true'); await page.getByRole('button', { name: '重试站点信息', exact: true }).click(); await page.getByRole('button', { name: '刷新目录', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'API 测试站点' })).toBeVisible(); await expect(page.getByLabel('选择：API 文章 A')).toBeVisible();
      for (const mode of ['wrong-id', 'draft']) {
        await request.get(api + '/__control?detailMode=' + mode); await page.goto(share);
        await expect(page.locator('main').getByText('内容响应不符合约定', { exact: true })).toBeVisible();
        await expect(page.locator('main article h2')).toHaveCount(0); await expect(page.locator('main')).not.toContainText('错误身份文章'); await expect(page.locator('main')).not.toContainText('未公开文章');
        await expect(page.getByRole('button', { name: '重试内容', exact: true })).toHaveCount(0);
      }
      await request.get(api + '/__control?detailMode=valid'); await page.reload(); await expect(page.locator('main article h2')).toHaveText('API 文章 A');
      await expect(page.getByRole('button', { name: '更新页面', exact: true })).toHaveCount(0);
      expect(urls.some(url => url.includes('/content/') && url.endsWith('.json'))).toBe(false);
    });
  });
}
