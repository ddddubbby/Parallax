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

    const ledgerFoxRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const open = ledgerFoxRow.getByRole("link", { name: "Open →" });
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

  test("M34A final review → actionable gap → immutable handoff → Simulation selector", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LensLoop M34A E2E" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toMatch(/\/projects\/[0-9a-f-]{36}/);
    const projectBase = projectHref!;

    await page.goto(`${projectBase}/framing`);
    await page.getByRole("button", { name: "Start review →" }).click();
    await expect(page.getByRole("heading", { name: /Framing review/ })).toBeVisible();

    await page.getByRole("button", { name: "02 Codebook" }).click();
    await page.getByLabel("Codebook creator").fill("E2E analyst");
    await page.getByLabel("Association id").fill("durability");
    await page.getByLabel("Label", { exact: true }).fill("Durability");
    await page.getByLabel("Definition").fill("The brand is described as durable or rugged.");
    await page.getByRole("button", { name: "Save codebook" }).click();
    await expect(page.getByRole("button", { name: "Attest and lock codebook" })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Attest and lock codebook" }).click();
    await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "03 Reveal" }).click();
    await page.getByLabel("Positioning and source disclosure").fill(
      "CLIENT-SUPPLIED POSITIONING — direct-to-share flat video without mandatory reframing.",
    );
    await page.getByLabel("Revealed by").fill("E2E analyst");
    await page.getByLabel("Full-sample reviewer").fill("E2E analyst");
    await page.getByRole("button", { name: "Reveal and start review" }).click();
    await expect(page.getByRole("heading", { name: "Positioning revealed" })).toBeVisible();

    await page.getByRole("button", { name: "04 Review" }).click();
    const reviewCards = page.locator("article");
    const first = reviewCards.nth(0);
    await first.getByRole("button", { name: "Add annotation" }).click();
    await first.getByLabel("Exact evidence quote").fill("durable action cameras");
    await first.getByRole("button", { name: "Save row" }).click();
    await expect(first.getByText("coded", { exact: true })).toBeVisible();
    for (let index = 1; index < 5; index += 1) {
      const card = reviewCards.nth(index);
      await card.getByRole("button", { name: "Save row" }).click();
      await expect(card.getByText("none", { exact: true })).toBeVisible();
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Complete review" }).click();
    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "05 Gaps" }).click();
    await page.getByLabel("Missing target").fill("Direct-to-share flat video");
    await page.getByLabel("Rationale").fill("The intended product story was absent from the reviewed source jobs.");
    await page.getByRole("button", { name: "Save gaps" }).click();
    await expect(page.getByRole("link", { name: "Open client report →" })).toBeVisible();

    await page.getByRole("button", { name: "06 Handoff" }).click();
    await expect(page.getByText(/full response is not claimed to be representative/i)).toBeVisible();
    await page.getByRole("button", { name: "Create immutable handoff" }).first().click();
    await expect(page.getByText(/OBSERVED IN 1\/5 SOURCE JOBS|SINGLE OBSERVED INSTANCE/).first()).toBeVisible();

    await page.goto(`${projectBase}/resonance`);
    await page.getByRole("button", { name: "New study" }).click();
    await page.getByLabel("Study name").fill("M34A handoff E2E");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByRole("button", { name: "03 · What they react to — framings" }).click();
    await page.getByRole("button", { name: "+ Add framing" }).click();
    const snapshotSelect = page.getByLabel("Reviewed baseline snapshot");
    await expect(snapshotSelect).toBeVisible();
    await expect(snapshotSelect.locator("option")).toContainText(["durability", "SINGLE OBSERVED INSTANCE"]);
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
