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

  test("D-114: framing is historical and the guided path routes to the Simulation picker", async ({ page }) => {
    // The hub always shows exactly one guided next step (M44 contract).
    await page.goto("/projects");
    const ledgerFoxRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const href = await ledgerFoxRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(href).toMatch(/\/projects\/[0-9a-f-]{36}/);
    await page.goto(href!);
    const nextStep = page.getByRole("region", { name: "Next step" });
    await expect(nextStep).toBeVisible();
    await expect(nextStep.getByRole("link")).toHaveCount(1);

    // The library rows carry the compact guidance hint.
    await page.goto("/projects");
    await expect(ledgerFoxRow.getByText(/next: finish intake|open workspace/)).toBeVisible();

    // Framing evidence is read-only historical: no review can start, stored
    // reviews stay readable, and the surface routes to Simulation.
    await page.goto(`${href}/framing`);
    await expect(page.getByText("HISTORICAL — RETIRED BY D-114")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start review →" })).toHaveCount(0);
    const toSimulation = page.getByRole("link", { name: "Open Simulation studies →" });
    await expect(toSimulation).toBeVisible();
    await toSimulation.click();
    await expect(page).toHaveURL(/\/resonance$/);

    // The Simulation library wears the journey rail once audit results exist.
    await expect(page.getByRole("list", { name: "Journey progress" })).toBeVisible();
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

  test("M46: Simulation math, below-floor live audit block, Persona copy, full-response dialog", async ({
    page,
  }) => {
    await page.goto("/projects");
    const projectRow = page.getByRole("row").filter({ hasText: "LedgerFox" });
    const projectHref = await projectRow.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(projectHref).toBeTruthy();

    // Floor-met evidence: seeded study results already label DRAW FLOOR MET (n=30).
    await page.goto(`${projectHref}/resonance`);
    const studyCard = page.locator("section").filter({ hasText: "M43 positioning clarity study" });
    const studyHref = await studyCard.getByRole("link", { name: "Open →" }).getAttribute("href");
    expect(studyHref).toBeTruthy();
    await page.goto(`${studyHref}?view=overview`);
    await expect(page.getByText(/1 persona · 2 framings/)).toBeVisible();
    await page.goto(`${studyHref}?view=results`);
    await page.getByRole("link", { name: "Deltas", exact: true }).click();
    await expect(page.getByText("DRAW FLOOR MET", { exact: true }).first()).toBeVisible();

    // Below-floor creation: 1 persona × k=5 is preview-only; live audit blocked.
    await page.goto(`${studyHref}?view=runs`);
    await page.getByRole("link", { name: "Configure simulation run →" }).click();
    await expect(page).toHaveURL(/matrixVersionId=/);
    await expect(page.getByText("Simulation math")).toBeVisible();
    await expect(page.getByText(/1 personas × 5 repetitions = 5 draws per framing\/provider/)).toBeVisible();
    await expect(page.getByText(/Preview only — directional/)).toBeVisible();
    await page.getByRole("button", { name: /Live audit: real spend, k=5 locked/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Cost projection" })).toContainText(
      "BELOW FLOOR",
    );
    await expect(page.getByText(/Live audit blocked/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start live audit" })).toBeDisabled();

    // Persona copy + full-response dialog on a template draft (has Measured AI framing).
    await page.goto(`${projectHref}/resonance`);
    await page.getByRole("button", { name: "New study", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New study" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Template", exact: true }).click();
    await dialog.getByRole("button", { name: "Create draft" }).first().click();
    await expect(page).toHaveURL(/\/resonance\/[0-9a-f-]{36}\?view=design/);

    await expect(page.getByText(/STEP 1 OF 4 — Name your study/)).toBeVisible();
    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByText(/STEP 2 OF 4 — Who reacts — the panel/)).toBeVisible();
    await expect(page.getByText("Persona name (required)")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add persona" })).toBeVisible();
    await expect(page.getByText("Buyer type")).toHaveCount(0);

    await page.getByRole("button", { name: "Next →" }).click();
    await expect(page.getByText(/STEP 3 OF 4/)).toBeVisible();
    await expect(page.getByText(/Pick the framing to fight/)).toBeVisible();

    const viewFull = page.getByRole("button", { name: "View full response" }).first();
    await expect(viewFull).toBeVisible();
    await viewFull.click();
    const fullDialog = page.getByRole("dialog", { name: "Full stored response" });
    await expect(fullDialog).toBeVisible();
    await expect(fullDialog.getByText("Original prompt")).toBeVisible();
    await expect(fullDialog.getByText("Full response")).toBeVisible();
    const chooseBaseline = fullDialog.getByRole("button", { name: "Choose as baseline" });
    await expect(chooseBaseline).toBeVisible();
    await chooseBaseline.click();
    await expect(fullDialog).toHaveCount(0);
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
    // Focus returns to the picker after Escape/choose (keyboard path covered above via dialog).
    await page.keyboard.press("Escape");
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
      /0 of \d+ calls complete/,
    );
    await expect(page.getByText("Generating AI responses")).toBeVisible();
    await expect(page.getByText("Extracting evidence")).toBeVisible();
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
