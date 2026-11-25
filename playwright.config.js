import { defineConfig } from '@playwright/test';

const live = process.env.BASE_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 240_000,
  use: { baseURL: live ?? 'http://localhost:4791/ask-your-spreadsheet/', viewport: { width: 1280, height: 900 } },
  webServer: live ? undefined : { command: 'npm run build && npm run preview', url: 'http://localhost:4791/ask-your-spreadsheet/', reuseExistingServer: false, timeout: 120_000 },
});
