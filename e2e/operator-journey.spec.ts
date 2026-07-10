import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * M33 / D-092: critical operator journey smoke + axe floor.
 * Discovers the seeded demo project from /projects (ledgerfox-demo) so CI
 * never hard-codes the operator's Insta 360 ids.
 */
test.describe("operator journey smoke", () => {
  test("projects → hub → matrix → runs → dashboard → resonance", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

    const open = page.getByRole("link", { name: "Open →" }).first();
    await expect(open).toBeVisible();
    const href = await open.getAttribute("href");
    expect(href).toMatch(/\/projects\/[0-9a-f-]{36}/);
    await page.goto(href!);
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/?$/);
    const projectBase = page.url().replace(/\/$/, "");

    await expect(page.locator("main h1").first()).toBeVisible();

    await page.goto(`${projectBase}/matrix?view=overview`);
    await expect(page.getByRole("heading", { name: "Prompt matrix", exact: true })).toBeVisible();

    await page.goto(`${projectBase}/runs`);
    await expect(page.getByRole("heading", { name: "Runs", exact: true })).toBeVisible();

    await page.goto(`${projectBase}/dashboard?view=overview`);
    await expect(page.getByRole("heading", { name: "Evidence dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("Simulation results").first()).toBeVisible();

    await page.goto(`${projectBase}/dashboard?view=simulation`);
    await expect(page.getByRole("heading", { name: "Simulation results", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "← Evidence dashboard", exact: true })).toBeVisible();

    await page.goto(`${projectBase}/resonance`);
    await expect(page.locator("main h1").first()).toBeVisible();
  });

  test("axe pass on projects and a project hub", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    const projectsAxe = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(projectsAxe.violations, "axe violations on /projects").toEqual([]);

    const open = page.getByRole("link", { name: "Open →" }).first();
    const href = await open.getAttribute("href");
    await page.goto(href!);
    await expect(page.locator("main h1").first()).toBeVisible();
    const hubAxe = await new AxeBuilder({ page })
      .disableRules(["color-contrast"])
      .analyze();
    expect(hubAxe.violations, "axe violations on project hub").toEqual([]);
  });

  test("mobile drawer uses dialog and restores focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    const openBtn = page.getByRole("button", { name: "Open navigation" });
    await openBtn.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(openBtn).toBeFocused();
  });
});
