import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const run = promisify(execFile);
for (const [framework, port, otherPort] of [['vue', 4312, 4313], ['react', 4313, 4312]] as const) {
  test(`T10: ${framework} stays usable while both framework development servers run`, async ({ page, context }) => {
    const errors: string[] = [], failedAssets: string[] = [];
    const other = await context.newPage();
    for (const current of [page, other]) {
      current.on('pageerror', error => errors.push(error.message));
      current.on('response', response => { if (response.status() >= 400 && /\.(?:js|ts)(?:\?|$)/.test(response.url())) failedAssets.push(response.url() + ': ' + response.status()); });
    }
    try {
      await page.goto(`http://127.0.0.1:${port}/`);
      await expect(page.getByRole('heading', { name: '选择风格与内容', exact: true })).toBeVisible();
      await page.getByLabel('网页风格').selectOption('card-grid');
      await page.getByRole('button', { name: '应用风格', exact: true }).click();
      await page.getByLabel('选择：测试文章 A').check();
      await expect(page.locator('main article h2')).toHaveText('测试文章 A');
      await other.goto(`http://127.0.0.1:${otherPort}/`);
      await expect(other.getByRole('heading', { name: '选择风格与内容', exact: true })).toBeVisible();
      await other.getByLabel('网页风格').selectOption('minimal-list');
      await other.getByRole('button', { name: '应用风格', exact: true }).click();
      await other.getByLabel('选择：测试文章 B').check();
      await expect(other.locator('.prose')).toContainText('第二篇作者正文');
      await page.reload();
      await expect(page.getByLabel('网页风格')).toHaveValue('card-grid');
      await page.getByRole('button', { name: '阅读全文：测试文章 A', exact: true }).click();
      await expect(page.locator('.prose')).toContainText('作者原文 v1');
      await other.reload();
      await expect(other.locator('.prose')).toContainText('第二篇作者正文');
      expect(errors).toEqual([]); expect(failedAssets).toEqual([]);
    } finally { await other.close(); }
  });
}
test('T13: separate development ports keep their authored content versions independent', async ({ page, context }) => {
  const other = await context.newPage();
  try {
    for (const [current, port, version] of [[page, 4312, 'v1'], [other, 4314, 'v2']] as const) {
      await current.goto(`http://127.0.0.1:${port}/`);
      await expect(current.getByRole('heading', { name: '选择风格与内容', exact: true })).toBeVisible();
      await current.getByLabel('网页风格').selectOption('minimal-list');
      await current.getByRole('button', { name: '应用风格', exact: true }).click();
      await current.getByLabel('选择：测试文章 A').check();
      await expect(current.locator('.prose')).toContainText('作者原文 ' + version);
    }
    await page.reload(); await expect(page.locator('.prose')).toContainText('作者原文 v1');
    await other.reload(); await expect(other.locator('.prose')).toContainText('作者原文 v2');
    await expect(page.getByRole('button', { name: '更新页面', exact: true })).toHaveCount(0);
    await expect(other.getByRole('button', { name: '更新页面', exact: true })).toHaveCount(0);
  } finally { await other.close(); }
});
for (const [framework, port] of [['vue', 4312], ['react', 4313]] as const) {
  test(`T04/T13: ${framework} rejected duplicate-port startup leaves the running content and dependencies intact`, async ({ page }) => {
    const origin = `http://127.0.0.1:${port}`, root = path.resolve('.generated/e2e');
    const failedAssets: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && /\.(?:js|ts)(?:\?|$)/.test(response.url())) failedAssets.push(response.url()); });
    await page.goto(origin);
    await page.getByLabel('网页风格').selectOption('minimal-list');
    await page.getByRole('button', { name: '应用风格', exact: true }).click();
    await page.getByLabel('选择：测试文章 A').check();
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    const pointer = await (await page.request.get(origin + '/content/current.json')).json();
    await expect(run(process.execPath, ['--import', 'tsx', 'scripts/site.ts', 'dev', framework, '--force'], {
      env: { ...process.env, BLOG_CONFIG: path.join(root, 'dev-config.json'), BLOG_CONTENT_DIR: path.join(root, 'fixtures/v2'), BLOG_DEV_PORT: String(port), BLOG_BASE_PATH: '/' }, timeout: 15000
    })).rejects.toMatchObject({ stderr: expect.stringContaining(`Port ${port} is already in use`) });
    expect(await (await page.request.get(origin + '/content/current.json')).json()).toEqual(pointer);
    await page.reload();
    await expect(page.locator('.prose')).toContainText('作者原文 v1');
    await expect(page.getByRole('button', { name: '更新页面', exact: true })).toHaveCount(0);
    expect(failedAssets).toEqual([]); expect(errors).toEqual([]);
  });
}
