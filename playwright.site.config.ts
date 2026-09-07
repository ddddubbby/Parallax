import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:8097', viewport: { width: 1280, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/site-preview.mjs',
    url: 'http://127.0.0.1:8097',
    reuseExistingServer: !process.env.CI,
  },
});
