import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/native-wails.spec.ts'],
  // The real Wails backend and fixture vault are shared, so mutations must be serialized.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  // globalSetup/Teardown disabled - run setup manually before tests
  // globalSetup: './e2e/global-setup.ts',
  // globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:9245',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node ${path.join(__dirname, 'e2e/start-server.mjs')} 9245`,
    url: 'http://127.0.0.1:9245',
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
