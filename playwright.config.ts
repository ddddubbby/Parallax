import { defineConfig, devices } from "@playwright/test";

/**
 * M33 / D-092: one smoke floor for the critical operator journey + axe.
 * Not a coverage program — do not expand without a separate decision.
 *
 * The webServer boots an ephemeral Postgres (seeded demo project) + Next,
 * so CI does not depend on the operator's local Insta 360 data.
 */
export default defineConfig({
  testDir: "e2e",
  // M50 forecast states need a fresh heartbeat; they run in the dedicated
  // playwright.forecast.config.ts harness (pnpm test:e2e:forecast).
  testIgnore: /forecast\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec tsx scripts/playwright-webserver.ts",
    url: "http://127.0.0.1:3100/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
