import { test, expect, type Page } from "@playwright/test";

/**
 * M50/D-120 forecast states against the dedicated forecast harness
 * (playwright.forecast.config.ts). Seeded fixtures keep the worker online
 * (future-dated heartbeat) with distinctive job counts on the runs index:
 *   "15 / 25 jobs" → ready → "Estimated 40–60 min remaining"
 *   "12 / 26 jobs" → recalibrating (stale pace > 3× slow-end cadence)
 *   "15 / 27 jobs" → pause target (same pace as ready; mutated by pause test)
 * Calibration uses a freshly started mock run (0 completions). Offline is
 * covered by the main operator-journey harness.
 */

async function openLedgerFoxRuns(page: Page): Promise<string> {
  await page.goto("/projects");
  const row = page.getByRole("row").filter({ hasText: "LedgerFox" });
  const href = await row.getByRole("link", { name: "Open →" }).getAttribute("href");
  expect(href).toMatch(/\/projects\/[0-9a-f-]{36}/);
  await page.goto(`${href}/runs`);
  await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();
  return href!;
}

async function openRunByJobProgress(page: Page, jobsText: RegExp) {
  await openLedgerFoxRuns(page);
  await page.getByRole("link").filter({ hasText: jobsText }).first().click();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
}

test.describe("audit run forecast (M50/D-120)", () => {
  test("ready run renders the exact range copy", async ({ page }) => {
    await openRunByJobProgress(page, /15 \/ 25 jobs/);

    await expect(page.locator("[data-forecast-state='ready']")).toBeVisible();
    await expect(page.getByTestId("run-forecast")).toHaveText("Estimated 40–60 min remaining");
    await expect(page.getByTestId("run-forecast-calibrating")).not.toBeVisible();
    await expect(page.getByText("15 / 25 calls")).toBeVisible();
    await expect(page.getByText(/WORKER OFFLINE/)).not.toBeVisible();
  });

  test("recalibrating run suppresses the range after stale pace", async ({ page }) => {
    await openRunByJobProgress(page, /12 \/ 26 jobs/);

    await expect(page.locator("[data-forecast-state='recalibrating']")).toBeVisible();
    await expect(page.getByTestId("run-forecast")).not.toBeVisible();
    await expect(page.getByTestId("run-forecast-calibrating")).not.toBeVisible();
    await expect(page.getByText("12 / 26 calls")).toBeVisible();
  });

  test("a fresh mock run stays in calibration with no estimate", async ({ page }) => {
    const projectHref = await openLedgerFoxRuns(page);
    await page.goto(`${projectHref}/runs/new`);
    await page.getByRole("button", { name: "Start mock run" }).click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);

    await expect(page.locator("[data-forecast-state='calibrating']")).toBeVisible();
    await expect(page.getByTestId("run-forecast")).not.toBeVisible();
    await expect(page.getByTestId("run-forecast-calibrating")).toHaveText(
      "Learning this run’s pace…",
    );
    await expect(page.getByText(/WORKER OFFLINE/)).not.toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Run progress" })).toHaveAttribute(
      "aria-valuetext",
      /0 of \d+ calls complete/,
    );
  });

  test("pausing suppresses the estimate and shows the operator reason", async ({ page }) => {
    await openRunByJobProgress(page, /15 \/ 27 jobs/);
    // Same cadence as ready, 12 remaining → 48–72 min (ready fixture keeps 10 remaining / 40–60).
    await expect(page.getByTestId("run-forecast")).toHaveText("Estimated 48–72 min remaining");

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.locator("[data-forecast-state='paused']")).toBeVisible();
    await expect(page.getByTestId("run-forecast")).not.toBeVisible();
    await expect(page.getByTestId("run-forecast-calibrating")).not.toBeVisible();
    await expect(page.getByText("Paused by operator. Click Resume to continue.")).toBeVisible();
    await expect(page.getByText("15 / 27 calls")).toBeVisible();
  });
});
