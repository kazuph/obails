import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/native-wails.spec.ts', '**/note-selection.spec.ts'],
  // Keep fixture mutations serialized across the existing browser suite.
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
    // GitHub's macOS image already includes Chrome; do not download a browser.
    channel: process.env.CI ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --dir frontend run dev --host 127.0.0.1',
    url: 'http://127.0.0.1:9245',
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
