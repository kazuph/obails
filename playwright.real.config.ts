import { defineConfig } from '@playwright/test';
import config from './playwright.config';

export default defineConfig({
  ...config,
  testIgnore: [],
  testMatch: '**/note-selection.spec.ts',
  outputDir: 'test-results/real-backend',
  reporter: [['html', { outputFolder: 'playwright-report/real-backend', open: 'never' }]],
  webServer: {
    command: 'node e2e/start-server.mjs 9245',
    url: 'http://127.0.0.1:9245',
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
