import { defineConfig } from "@playwright/test";

if (process.env.OBAILS_ALLOW_FOREGROUND_NATIVE !== "1") {
  throw new Error(
    "Native E2E is disabled because it activates Obails and steals keyboard focus. " +
    "Run background-only verification unless the user explicitly authorizes foreground native testing.",
  );
}

// Matches the existing Wails startup allowance in playwright.config.ts.
export const NATIVE_WAILS_TIMEOUT_MS = 180 * 1000;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "native-wails.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: NATIVE_WAILS_TIMEOUT_MS,
  retries: 0,
  reporter: "line",
  use: {
    trace: "off",
    screenshot: "off",
  },
});
