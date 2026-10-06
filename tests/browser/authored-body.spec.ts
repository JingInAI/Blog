import { test, expect } from '@playwright/test';
import { authoredMetadata } from '../authored-body-fixture.ts';

for (const source of ['static', 'http'] as const) for (const [index, framework, base] of [[0, 'vue', '/'], [1, 'react', '/'], [2, 'vue', '/Blog/'], [3, 'react', '/Blog/']] as const) {
  const port = (source === 'static' ? 4301 : 4306) + index, origin = `http://127.0.0.1:${port}`;
  test(`T01/T09/T10: ${source} ${framework} ${base} preserves authored metadata and rich Markdown with inert unsafe links`, async ({ page, request }) => {
    await request.get(source === 'static' ? origin + '/__control?version=v1&failImages=false' : 'http://127.0.0.1:4305/__control?reset=true');
    const title = source === 'static' ? '测试文章 A' : 'API 文章 A', id = source === 'static' ? 'a%+😀' : 'api%+😀';
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + base);
    await page.getByLabel('网页风格').selectOption('card-grid'); await page.getByRole('button', { name: '应用风格', exact: true }).click();
    await page.getByLabel('选择：' + title).check();
    const article = page.locator('main article');
    await expect(article.locator('.metadata > span').first()).toHaveText(authoredMetadata.author);
    await expect(article.locator('time')).toHaveText(authoredMetadata.publishedAt); await expect(article.locator('time')).toHaveAttribute('datetime', authoredMetadata.publishedAt);
    await expect(article.locator('.tags span')).toHaveText(authoredMetadata.tags); await expect(article.locator('.prose')).toHaveCount(0);
    if (source === 'http') await page.getByRole('button', { name: '加载更多', exact: true }).click();
    await page.getByLabel('选择：' + (source === 'static' ? '测试文章 B' : 'API 文章 B')).check();
    await expect(page.locator('main article').nth(1).locator('.metadata > *')).toHaveCount(0);
    await page.getByRole('button', { name: '阅读全文：' + title, exact: true }).click();
    for (const theme of ['card-grid', 'minimal-list']) {
      await page.getByLabel('网页风格').selectOption(theme); await page.getByRole('button', { name: '应用风格', exact: true }).click();
      const prose = page.locator('.prose');
      await expect(prose).toContainText('直接链接'); await expect(prose).toContainText('引用链接');
      await expect(prose.locator('a').filter({ hasText: '直接链接' })).toHaveCount(0); await expect(prose.locator('a').filter({ hasText: '引用链接' })).toHaveCount(0);
      await expect(prose.getByRole('link', { name: '作者安全链接', exact: true })).toHaveAttribute('href', 'https://example.com/authored');
      await expect(prose.getByRole('link', { name: '作者安全链接', exact: true })).toHaveAttribute('title', '作者链接提示');
      await expect(prose.getByRole('link', { name: '作者空目标链接', exact: true })).toHaveAttribute('href', '');
      await expect(prose.getByRole('link', { name: '作者空目标链接', exact: true })).toHaveAttribute('title', '作者空目标提示');
      await expect(prose.locator('a:has(img)')).toHaveAttribute('href', '');
      const sections = prose.locator('section[id^="fn-"]'); await expect(sections).toHaveCount(2);
      const definitionIds = await sections.evaluateAll(nodes => nodes.map(node => node.id)); expect(new Set(definitionIds).size).toBe(2);
      await expect(sections.nth(1)).toContainText('作者重复脚注原文');
      await expect(prose.locator('h2')).toHaveText('作者二级标题');
      await expect(prose.locator('strong')).toHaveText('作者强调');
      expect(await prose.locator('pre code').textContent()).toBe('作者代码第一行\n  作者代码第二行');
      await expect(prose.locator('thead th')).toHaveText(['作者列一', '作者列二']); await expect(prose.locator('tbody td')).toHaveText(['作者值一', '作者值二']);
      await expect(prose.locator('thead th').first()).toHaveAttribute('align', 'left'); await expect(prose.locator('thead th').last()).toHaveAttribute('align', 'right');
      await expect(prose.locator('ol')).toHaveAttribute('start', '7'); await expect(prose.locator('ol li')).toHaveText(['作者列表一', '作者列表二']);
      await expect(prose.locator('input[type=checkbox]').first()).toBeChecked(); await expect(prose.locator('input[type=checkbox]').last()).not.toBeChecked();
      for (const checkbox of await prose.locator('input[type=checkbox]').all()) await expect(checkbox).toBeDisabled();
      const diagnostics = page.locator('main article .diagnostics');
      if (await diagnostics.getAttribute('open') === null) await diagnostics.locator('summary').click();
      const linkDiagnostics = diagnostics.locator('p').filter({ hasText: '不安全链接按文本显示' });
      await expect(linkDiagnostics).toHaveCount(2); for (const notice of await linkDiagnostics.all()) await expect(notice).toBeVisible();
      const location = page.url(); await prose.getByRole('link', { name: '作者-注', exact: true }).click();
      const footnoteId = `fn-${encodeURIComponent(id)}-${encodeURIComponent('作者-注').replace(/-/g, '%2D')}`;
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(footnoteId); expect(page.url()).toBe(location);
      expect(await page.evaluate(() => 'UNSAFE_LINK_EXECUTED' in window)).toBe(false);
    }
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者脚注原文'); await expect(page.locator('time')).toHaveText(authoredMetadata.publishedAt);
    await page.setViewportSize({ width: 375, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
