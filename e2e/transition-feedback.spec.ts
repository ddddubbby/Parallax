import { expect, test } from "@playwright/test";

/**
 * M47 / D-118: presence checks for reachable loading + local pending.
 * Server delay is test-only via `E2E_NAV_DELAY_MS` on the Playwright webServer.
 */

test.describe.configure({ timeout: 120_000 });

test.describe("M47 transition feedback", () => {
  test("library → workspace and nested nav show reachable loading; local tabs pending", async ({
    page,
    baseURL,
  }) => {
    // Opt into server-side RSC stretch for this spec only (see e2eNavDelay).
    await page.context().addCookies([
      {
        name: "e2e-nav-delay",
        value: "1",
        url: baseURL ?? "http://127.0.0.1:3100",
      },
    ]);

    await page.goto("/projects");
    const open = page.getByRole("row").filter({ hasText: "LedgerFox" }).getByRole("link", {
      name: "Open →",
    });
    await expect(open).toBeVisible();

    await open.click();
    await expect(page.getByLabel("Opening project workspace")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/?$/, { timeout: 60_000 });
    await expect(page.locator("main h1").first()).toBeVisible({ timeout: 60_000 });
    const projectBase = page.url().replace(/\/$/, "");

    const matrixLink = page
      .getByRole("navigation", { name: "Operator navigation" })
      .getByRole("link", { name: "Prompt matrix", exact: true });
    await expect(matrixLink).toBeVisible();
    await matrixLink.click();
    await expect(page.getByLabel("Preparing project view")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("LedgerFox").first()).toBeVisible();
    await expect(page).toHaveURL(/\/matrix/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Prompt matrix", exact: true })).toBeVisible({
      timeout: 60_000,
    });

    const presenceTab = page
      .getByRole("navigation", { name: "Matrix sections" })
      .getByRole("link", { name: "Presence", exact: true });
    await expect(presenceTab).toBeVisible();
    await presenceTab.click();
    await expect(page.getByRole("status").filter({ hasText: "Opening section" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/view=presence/, { timeout: 60_000 });

    await page.goto(`${projectBase}/report`);
    const runSelect = page.getByLabel("Report run");
    if ((await runSelect.count()) === 0) return;
    const options = runSelect.locator("option");
    if ((await options.count()) < 2) return;
    const second = await options.nth(1).getAttribute("value");
    expect(second).toBeTruthy();
    await runSelect.selectOption(second!);
    await expect(page.getByRole("status").filter({ hasText: "Opening report run" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(new RegExp(`runId=${second}`), { timeout: 60_000 });
  });
});
