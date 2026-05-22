import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eConfigPath = path.resolve(__dirname, 'e2e/fixtures/config.e2e.toml');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // globalSetup/Teardown disabled - run setup manually before tests
  // globalSetup: './e2e/global-setup.ts',
  // globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:9245',
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
    command: `OBAILS_CONFIG_FILE=${e2eConfigPath} wails3 dev -config ./build/config.yml -port 9245`,
    url: 'http://localhost:9245',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
});
