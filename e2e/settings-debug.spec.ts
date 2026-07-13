import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function seriousOrCritical(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
}

test.describe("Settings and debug refinement", () => {
  test("Settings keeps credentials private, focuses errors, and confirms named deletion", async ({ page }) => {
    await page.goto("/settings?view=providers");
    await expect(page.getByRole("heading", { name: "Provider credentials" })).toBeVisible();

    await page.getByRole("button", { name: "Add provider" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "API key is required" })).toBeVisible();
    await expect(page.getByLabel("API key")).toBeFocused();

    const safeKey = "m43-safe-test-key-1234";
    await page.getByLabel("API key").fill(safeKey);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toContainText("DeepSeek credential saved");
    const credentialRegion = page.getByRole("region", { name: "Provider credential table" });
    await expect(credentialRegion).toContainText("••••1234");
    await expect(page.getByText(safeKey, { exact: true })).toHaveCount(0);

    const trigger = page.getByRole("button", { name: "More actions for deepseek" });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Disable" }).click();
    await expect(credentialRegion).toContainText("disabled");
    await expect(credentialRegion.getByRole("status")).toContainText("deepseek credential disabled");

    await trigger.click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete DeepSeek credential?" });
    await expect(deleteDialog).toContainText("permanently removes the encrypted credential");
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const containment = await credentialRegion.evaluate((element) => ({
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(containment.bodyScrollWidth).toBe(containment.bodyClientWidth);
    expect(containment.scrollWidth).toBeGreaterThan(containment.clientWidth);
    const settingsAxe = await new AxeBuilder({ page }).analyze();
    expect(seriousOrCritical(settingsAxe.violations), "critical or serious Settings axe violations").toEqual([]);

    await trigger.click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete DeepSeek credential" }).click();
    await expect(page.getByText("No provider credentials on file")).toBeVisible();

    await page.getByRole("link", { name: "Defaults" }).click();
    await expect(page.getByRole("heading", { name: "Run defaults" })).toBeVisible();
    await expect(page.getByText(/Deployment-managed.*read-only/)).toBeVisible();
    const defaultsContainment = await page.evaluate(() => ({
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(defaultsContainment.bodyScrollWidth).toBe(defaultsContainment.bodyClientWidth);
  });

  test("Debug contains long data and reports safe repair success and failure", async ({ page }) => {
    await page.goto("/debug");
    await expect(page.getByRole("heading", { name: "Debug" })).toBeVisible();
    await expect(page.getByText(/heartbeat \d+s ago/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Debug jobs table" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Run events tail" })).toContainText(
      "Disposable debug states are ready.",
    );

    const rejectedRow = page.getByRole("row").filter({ hasText: "Finalized fixture" });
    await rejectedRow.getByRole("button", { name: "Requeue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "run is already finalized" })).toBeVisible();

    const repairableRow = page.getByRole("row").filter({ hasText: "Fixture timeout" });
    await repairableRow.getByRole("button", { name: "Requeue" }).click();
    await expect(page.getByRole("status").filter({ hasText: /Job .* requeued/ })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Fixture timeout" })).toHaveCount(0);

    await page.getByRole("button", { name: "Re-extract" }).click();
    await expect(page.getByRole("status").filter({ hasText: /queued for re-extraction/ })).toBeVisible();
    await expect(page.getByText("No dead-lettered extractions")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const regions = await page.getByRole("region").evaluateAll((elements) => ({
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      tableRegions: elements
        .filter((element) => element.getAttribute("aria-label")?.includes("table"))
        .map((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth })),
    }));
    expect(regions.bodyScrollWidth).toBe(regions.bodyClientWidth);
    expect(regions.tableRegions.every((region) => region.scrollWidth >= region.clientWidth)).toBe(true);
    const debugAxe = await new AxeBuilder({ page }).analyze();
    expect(seriousOrCritical(debugAxe.violations), "critical or serious debug axe violations").toEqual([]);
  });
});
