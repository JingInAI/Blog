import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30000,
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'node --import tsx tests/browser-server.ts', url: 'http://127.0.0.1:4300/health', reuseExistingServer: false, timeout: 120000 }
});
