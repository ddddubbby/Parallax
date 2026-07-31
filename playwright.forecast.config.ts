import { defineConfig, devices } from "@playwright/test";

/**
 * M50 / D-120: disposable forecast harness. Seeds M50_FORECAST_FIXTURES into
 * its own ephemeral DB with a future-dated worker heartbeat so ready /
 * recalibrating / calibrating / paused can be asserted without fighting the
 * main harness's WORKER OFFLINE contract.
 */
export default defineConfig({
  testDir: "e2e",
  testMatch: /forecast\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_FORECAST_BASE_URL ?? "http://127.0.0.1:3101",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec tsx scripts/playwright-forecast-webserver.ts",
    url: "http://127.0.0.1:3101/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
