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
    const discoveryStage = page.getByRole("button", { name: "01 Discovery" });
    await discoveryStage.click();
    const stageDialog = page.getByRole("dialog", { name: "Discard unsaved stage edits?" });
    await expect(stageDialog).toContainText("Unsaved edits in Codebook");
    await page.keyboard.press("Escape");
    await expect(discoveryStage).toBeFocused();
    await expect(page.getByLabel("Definition")).toHaveValue("The brand is described as durable or rugged.");
    await page.getByRole("button", { name: "Save codebook" }).click();
    await expect(page.getByRole("button", { name: "Attest and lock codebook" })).toBeVisible();
    await page.getByRole("button", { name: "Attest and lock codebook" }).click();
    const lockDialog = page.getByRole("dialog", { name: "Lock this codebook permanently?" });
    await expect(lockDialog).toContainText("cannot prove whether you had prior knowledge outside this review");
    await lockDialog.getByRole("button", { name: "Attest and lock codebook" }).click();
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
    await page.getByRole("button", { name: "Complete review" }).click();
    const completeDialog = page.getByRole("dialog", { name: "Complete the full-sample review?" });
    await expect(completeDialog).toContainText("unavailable rows retained in N");
    await completeDialog.getByRole("button", { name: "Complete full-sample review" }).click();
    await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "05 Gaps" }).click();
    await page.getByLabel("Missing target").fill("Direct-to-share flat video");
    await page.getByLabel("Rationale").fill("The intended product story was absent from the reviewed source jobs.");
    await page.getByRole("button", { name: "Save gaps" }).click();
    await expect(page.getByRole("link", { name: "Open client report →" })).toBeVisible();

    await page.getByRole("button", { name: "06 Handoff" }).click();
    await expect(page.getByText(/full response is not claimed to be representative/i)).toBeVisible();
    await page.getByRole("button", { name: "Create immutable handoff" }).first().click();
    const handoffDialog = page.getByRole("dialog", { name: "Create an immutable Simulation handoff?" });
    await expect(handoffDialog).toContainText("full verbatim source response");
    await handoffDialog.getByRole("button", { name: "Create immutable handoff" }).click();
    await expect(page.getByText(/OBSERVED IN 1\/5 SOURCE JOBS|SINGLE OBSERVED INSTANCE/).first()).toBeVisible();

    await page.getByRole("link", { name: "Open client report →" }).click();
    await expect(page.getByRole("heading", { name: /AI framing evidence/ })).toBeVisible();
    await expect(page.getByText("HUMAN REVIEWED", { exact: true })).toBeVisible();
    await expect(page.getByText("DESCRIPTIVE N/N", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Framing report recurrence table" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Markdown" })).toBeVisible();
    await expect(page.getByRole("link", { name: "JSON evidence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / save PDF" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const framingDocument = page.locator(".framing-report-document");
    await expect(framingDocument).toHaveCSS("position", "fixed");
    const framingContainment = await framingDocument.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(framingContainment.left).toBe(0);
    expect(framingContainment.right).toBe(390);
    expect(framingContainment.bodyScrollWidth).toBe(framingContainment.bodyClientWidth);
    const framingReportAxe = await new AxeBuilder({ page }).analyze();
    expect(
      framingReportAxe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      "critical or serious axe violations on the Framing Evidence report",
    ).toEqual([]);

    await page.goto(`${projectBase}/resonance`);
    await page.getByRole("button", { name: "New study" }).click();
    await page.getByLabel("Study name").fill("M34A handoff E2E");
    await page.getByRole("button", { name: "Create draft" }).click();
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByLabel("Label (required)").fill("");
    await page.getByLabel("Age band (required)").fill("");
    await page.getByLabel("Income band (required)").fill("");
    await page.getByLabel("Location (required)").fill("");
    await page.getByLabel("Buying habits (required)").fill("");
    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByLabel("Label (required)")).toBeFocused();
    await page.getByLabel("Label (required)").fill("Field creator");
    await page.getByLabel("Age band (required)").fill("25–34");
    await page.getByLabel("Income band (required)").fill("$60k–$90k");
    await page.getByLabel("Location (required)").fill("Singapore");
    await page.getByLabel("Buying habits (required)").fill("Researches cameras before purchase");
    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByRole("button", { name: "+ Add framing" }).click();
    const snapshotSelect = page.getByLabel("Reviewed baseline snapshot");
    await expect(snapshotSelect).toBeVisible();
    const snapshotOptions = await snapshotSelect.locator("option").allTextContents();
    expect(snapshotOptions.join(" ")).toContain("durability");
    expect(snapshotOptions.join(" ")).toContain("SINGLE OBSERVED INSTANCE");
    const progress = page.getByLabel("Study design progress");
    const containment = await progress.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(containment.scrollWidth).toBeGreaterThan(containment.clientWidth);
    expect(containment.bodyScrollWidth).toBe(containment.bodyClientWidth);

    await page.getByRole("button", { name: "+ Add framing" }).click();
    const secondFraming = page.getByRole("group", { name: "Framing New framing" }).last();
    await secondFraming.getByLabel("Framing type").selectOption("corrected");
    await secondFraming.getByLabel("Short label").fill("Corrected framing");
    const correctedFraming = page.getByRole("group", { name: "Framing Corrected framing" });
    await correctedFraming.getByLabel("Framing text").fill(
      "LensLoop provides direct-to-share flat video with durable capture hardware.",
    );
    await correctedFraming.getByRole("button", { name: "Save framing" }).click();
    await expect(
      page.getByRole("group", { name: "Framing Corrected framing" }).getByRole("button", { name: "Save framing" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Next →" }).click();
    await page.getByRole("button", { name: "Approve study" }).click();
    const approvalDialog = page.getByRole("dialog", { name: "Approve and lock this study?" });
    await expect(approvalDialog).toContainText("immutable Simulation definition (C-13/C-15)");
    await approvalDialog.getByRole("button", { name: "Approve and lock study" }).click();
    await expect(page.getByRole("heading", { name: "Approved definition" })).toBeVisible();
  });

  test("Simulation results keep engines separate and evidence filters URL-backed", async ({ page }) => {
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/resonance`);
    const studyCard = page.locator("section").filter({ hasText: "M43 positioning clarity study" });
    await expect(studyCard.getByText("SIMULATED", { exact: true })).toBeVisible();
    await expect(studyCard).toContainText("latest run completed · mock");
    const studyHref = await studyCard.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(studyHref).toBeTruthy();

    await page.goto(`${studyHref}?view=results`);
    await expect(page.getByText("MODEL-IMPLIED", { exact: true })).toBeVisible();
    await expect(page.getByText("UNCALIBRATED", { exact: true })).toBeVisible();
    await expect(page.getByText(/never pooled across engines/)).toBeVisible();
    await expect(page.getByText("mean PI · n=30", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("img", { name: /Evidence-led framing Likert distribution/ })).toBeVisible();

    await page.getByRole("link", { name: "Deltas", exact: true }).click();
    await expect(page.getByRole("region", { name: "Simulation deltas table" })).toBeVisible();
    await expect(page.getByText("DRAW FLOOR MET", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Segments", exact: true }).click();
    await expect(page.getByRole("region", { name: "Simulation segment table" })).toBeVisible();
    await expect(page.getByText("DIRECTIONAL SLICE", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Excerpts", exact: true }).click();
    await expect(page.getByText("LOW", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("HIGH", { exact: true }).first()).toBeVisible();

    const resultsAxe = await new AxeBuilder({ page }).analyze();
    expect(
      resultsAxe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      "critical or serious axe violations on Simulation results",
    ).toEqual([]);

    await page.goto(`${studyHref}?view=evidence&engine=mock&page=2`);
    await expect(page.getByText("60 responses · page 2 of 3", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Stimulus" }).selectOption({ label: "Observed AI framing" });
    await expect(page).toHaveURL(/stimulus=[0-9a-f-]{36}.*page=1/);
    await page.getByRole("combobox", { name: "Persona" }).selectOption({ label: "Finance operations lead" });
    await expect(page).toHaveURL(/stimulus=[0-9a-f-]{36}.*persona=finance-ops-lead.*page=1/);
    await expect(page.getByText("30 responses · page 1 of 2", { exact: true })).toBeVisible();
    const evidenceCards = page.locator("main article");
    await expect(evidenceCards).toHaveCount(25);
    await expect(evidenceCards.first().getByText("SIMULATED", { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const containment = await page.locator("main").evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(containment.scrollWidth).toBe(containment.clientWidth);
    expect(containment.bodyScrollWidth).toBe(containment.bodyClientWidth);

    const evidenceAxe = await new AxeBuilder({ page }).analyze();
    expect(
      evidenceAxe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      "critical or serious axe violations on Simulation evidence",
    ).toEqual([]);
  });

  test("axe pass on projects and a project hub", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    const projectsAxe = await new AxeBuilder({ page }).analyze();
    expect(projectsAxe.violations, "axe violations on /projects").toEqual([]);

    const open = page.getByRole("link", { name: "Open →" }).first();
    const href = await open.getAttribute("href");
    await page.goto(href!);
    await expect(page.locator("main h1").first()).toBeVisible();
    const hubAxe = await new AxeBuilder({ page }).analyze();
    expect(hubAxe.violations, "axe violations on project hub").toEqual([]);
  });

  test("projects filters and table stay usable at the narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");

    await expect(page.getByRole("status")).toContainText(/Showing \d+ of \d+ projects/);
    const tableRegion = page.getByRole("region", { name: "Projects table" });
    await expect(tableRegion).toBeVisible();
    const containment = await tableRegion.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(containment.scrollWidth).toBeGreaterThan(containment.clientWidth);
    expect(containment.bodyScrollWidth).toBe(containment.bodyClientWidth);

    await page.getByRole("searchbox", { name: "Search projects" }).fill("not-a-project");
    await expect(page.getByText("No projects match these filters")).toBeVisible();
    await page.getByRole("button", { name: "Show all projects" }).click();
    await expect(page.getByRole("region", { name: "Projects table" })).toBeVisible();
  });

  test("intake validates in place, focuses the first error, autosaves, and resumes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/new");

    await page.getByRole("button", { name: "Next", exact: true }).click();
    const projectName = page.getByRole("textbox", { name: /Project \/ client name/ });
    await expect(projectName).toBeFocused();
    await expect(projectName).toHaveAttribute("aria-invalid", "true");

    await projectName.fill("M43 intake resume E2E");
    await page.getByRole("textbox", { name: /^Category/ }).fill("B2B finance operations");
    await page
      .getByRole("textbox", { name: /^Buyer’s goal|^Buyer's goal/ })
      .fill("compare finance operations tools for a growing team");
    await expect(page.getByRole("status")).toHaveText(/^SAVED \d{2}:\d{2}:\d{2}$/);
    await expect(page).toHaveURL(/\/projects\/new\?id=[0-9a-f-]{36}&step=1$/);

    await page.reload();
    await expect(projectName).toHaveValue("M43 intake resume E2E");
    await expect(page.getByRole("textbox", { name: /^Category/ })).toHaveValue(
      "B2B finance operations",
    );
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

  test("narrow tabs protect unsaved edits with the shared confirmation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/setup?view=basics`);
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill(
      "LedgerFox AI Visibility Demo — unsaved",
    );
    await expect(page.getByRole("status")).toHaveText("Unsaved changes");

    const brandsTab = page.getByRole("link", { name: "Brands", exact: true });
    await brandsTab.click();
    const dialog = page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(brandsTab).toBeFocused();

    await brandsTab.click();
    await page.getByRole("button", { name: "Discard and continue", exact: true }).click();
    await expect(page).toHaveURL(/setup\?view=brands$/);
  });

  test("setup edit cancel restores persisted values and permanent removal is named", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/setup?view=brands`);
    await page.getByRole("button", { name: "Edit", exact: true }).nth(1).click();
    const competitorName = page.getByRole("textbox", { name: "SpendPilot name" });
    await expect(competitorName).toBeFocused();
    await competitorName.fill("Unsaved competitor name");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).nth(1).click();
    await expect(competitorName).toHaveValue("SpendPilot");

    await page.goto(`${projectHref}/setup?view=attributes`);
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Remove attribute?" });
    await expect(dialog).toContainText("easy implementation");
    await expect(
      dialog.getByRole("button", { name: "Remove easy implementation", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("matrix shows capacity, protects edits, and confirms immutable or destructive actions", async ({ page }) => {
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/matrix?view=overview`);
    const generate = page.getByRole("button", { name: "Generate matrix", exact: true });
    if (await generate.isVisible()) await generate.click();
    await expect(page.getByRole("heading", { name: "Prompt matrix", exact: true })).toHaveCount(1);
    await expect(page.getByText(/\d+ used · \d+ remaining · 50 cell maximum/)).toBeVisible();

    await page.getByRole("button", { name: /Approve V\d+/ }).click();
    const approveDialog = page.getByRole("dialog", { name: /Approve matrix V\d+\?/ });
    await expect(approveDialog).toContainText("immutable evidence (C-4)");
    await approveDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("link", { name: "Presence", exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    const prompt = page.getByRole("textbox", { name: /Edit .* prompt/ });
    await expect(prompt).toBeFocused();
    await prompt.fill("Unsaved matrix prompt");
    const positionTab = page.getByRole("link", { name: "Position", exact: true });
    await positionTab.click();
    const dirtyDialog = page.getByRole("dialog", { name: "Discard unsaved changes?" });
    await expect(dirtyDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(positionTab).toBeFocused();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    const removeDialog = page.getByRole("dialog", { name: "Remove matrix cell?" });
    await expect(removeDialog).toContainText(/v\d+ · .* · .*/);
    await expect(removeDialog.getByRole("button", { name: "Remove named cell" })).toBeVisible();
    await removeDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("run configuration exposes projection states and cancellation is explicit", async ({ page }) => {
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LensLoop M34A E2E" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/runs/new`);
    await expect(page.getByRole("status").filter({ hasText: "Cost projection" })).toContainText(
      "READY",
    );
    const cap = page.getByRole("spinbutton", { name: "Run dollar cap (USD)" });
    await cap.fill("0");
    await expect(page.getByRole("status").filter({ hasText: "Cost projection" })).toContainText(
      "OVER CAP",
    );
    await expect(page.getByRole("button", { name: "Start mock run" })).toBeDisabled();
    await cap.fill("25");

    await page
      .getByRole("button", { name: "Live validation: real spend, never client-ready" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Cost projection" })).toContainText(
      "UNAVAILABLE",
    );
    await expect(page.getByRole("link", { name: /add or enable a credential in Settings/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start live validation" })).toBeDisabled();

    await page.getByRole("button", { name: "Mock: fixtures, free" }).click();
    const advanced = page.getByRole("button", { name: /Advanced — failure injection/ });
    await advanced.click();
    await expect(advanced).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Start mock run" }).click();
    await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("progressbar", { name: "Run progress" })).toHaveAttribute(
      "aria-valuetext",
      /0 of \d+ jobs complete/,
    );
    await expect(page.getByText(/WORKER OFFLINE/)).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const cancelDialog = page.getByRole("dialog", { name: "Cancel active run?" });
    await expect(cancelDialog).toContainText("Completed responses and incurred cost remain");
    await cancelDialog.getByRole("button", { name: "Cancel run", exact: true }).click();
    await expect(page.getByText("cancelled", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Run cancelled.");
  });

  test("dashboard retains evidence limits and restores focus through the edge sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/dashboard?view=presence`);
    await expect(page.getByRole("heading", { name: "Evidence dashboard", exact: true })).toBeVisible();
    await expect(page.getByText("80.0%", { exact: true })).toBeVisible();
    await expect(page.getByText(/n=70 \[69–88%\]/)).toBeVisible();
    const funnel = page.getByRole("region", { name: "Intent by persona evidence table" });
    const spectrum = page.getByRole("region", {
      name: "Share of voice — the client vs each competitor evidence table",
    });
    for (const region of [funnel, spectrum]) {
      const containment = await region.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(containment.scrollWidth).toBeGreaterThan(containment.clientWidth);
      expect(containment.bodyScrollWidth).toBe(containment.bodyClientWidth);
    }

    const evidence = page.getByRole("button", { name: "Evidence →", exact: true }).first();
    await evidence.click();
    const sheet = page.getByRole("dialog", { name: "Mention Rate evidence" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(/Raw sampled answers and their extraction state/)).toBeVisible();
    await sheet.locator("button").nth(1).click();
    await expect(sheet.getByRole("button", { name: "Back to evidence list" })).toBeVisible();
    await sheet.getByRole("button", { name: "Close evidence" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(evidence).toBeFocused();

    await page.goto(`${projectHref}/dashboard?view=perception`);
    await expect(page.getByRole("img", { name: "Attribute association radar" })).toBeVisible();
    await expect(page.getByText("Organic", { exact: true })).toBeVisible();
    await expect(page.getByText("Solicited", { exact: true })).toBeVisible();

    await page.goto(`${projectHref}/dashboard?view=proof`);
    await expect(page.getByRole("region", { name: "Cited sources table" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Misinformation Register \(9\)/ })).toBeVisible();
    await page.getByRole("button", { name: "Correct", exact: true }).first().click();
    await expect(page.getByRole("combobox", { name: "Verdict" }).first()).toHaveValue("contradicted");
    await expect(page.getByRole("combobox", { name: "Severity" }).first()).toHaveValue("high");
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();

    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      "critical or serious axe violations on the Proof dashboard",
    ).toEqual([]);
  });

  test("report editing, export, replacement, run switching, and print stay available", async ({ page }) => {
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    await page.goto(`${projectHref}/report`);
    const generate = page.getByRole("button", { name: "Generate report", exact: true });
    if (await generate.isVisible()) await generate.click();
    await expect(page.getByRole("heading", { name: "Executive Summary", exact: true })).toBeVisible();
    const runSelect = page.getByRole("combobox", { name: "Report run" });
    const runOptions = await runSelect.locator("option").allTextContents();
    expect(runOptions.some((option) => option.includes("AUDIT"))).toBe(true);
    expect(runOptions.some((option) => option.includes("SIM"))).toBe(true);
    const runId = await runSelect.inputValue();

    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await exportButton.click();
    await expect(page.getByRole("menuitem", { name: "Report · Markdown" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Report · Print / PDF" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Evidence · JSON" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(exportButton).toBeFocused();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Edit Executive Summary" });
    await expect(editor).toBeFocused();
    await editor.fill(`${await editor.inputValue()}\n\nOperator note.`);
    const methodTab = page.getByRole("link", { name: "Method & Confidence", exact: true });
    await methodTab.click();
    const dirtyDialog = page.getByRole("dialog", { name: "Discard unsaved changes?" });
    await expect(dirtyDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(methodTab).toBeFocused();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("edited", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Regenerate", exact: true }).click();
    const replaceDialog = page.getByRole("dialog", { name: "Replace this edited section?" });
    await expect(replaceDialog).toContainText("Other report sections and exports are unchanged");
    await replaceDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await editor.fill(`${await editor.inputValue()}\nUnsaved run-switch note.`);
    await runSelect.selectOption({ index: 1 });
    const runDialog = page.getByRole("dialog", { name: "Discard this report edit?" });
    await expect(runDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(runSelect).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    const reportAxe = await new AxeBuilder({ page }).analyze();
    expect(
      reportAxe.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? "")),
      "critical or serious axe violations on the report builder",
    ).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${projectHref}/report/print?runId=${runId}`);
    const printDocument = page.locator(".report-print-document");
    await expect(printDocument).toHaveCSS("position", "fixed");
    await expect(page.getByRole("heading", { name: /AI Visibility Audit — LedgerFox/ })).toBeVisible();
    const printContainment = await printDocument.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    expect(printContainment.left).toBe(0);
    expect(printContainment.right).toBe(390);
    expect(printContainment.bodyScrollWidth).toBe(printContainment.bodyClientWidth);
  });

  test("reduced motion keeps feedback but removes spatial movement", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects");
    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS("transform", "none");
    await expect(drawer).toHaveCSS("transition-duration", "0.1s");
  });
});
