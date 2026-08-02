import { describe, expect, it } from "vitest";

describe("M43 shared UI contracts", () => {
  it("keeps pending and status behavior in the shared primitive layer", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const source = await fs.readFile(path.join(process.cwd(), "src/components/ui.tsx"), "utf8");
    expect(source).toContain("pendingLabel");
    expect(source).toContain('aria-busy={pending || undefined}');
    expect(source).toContain('aria-hidden={!pending || undefined}');
    expect(source).toContain("label-mono min-h-11");
    expect(source).toContain("React.forwardRef");
    expect(source).toContain("HTMLSelectElement");
    expect(source).toContain('data-field-error={errors?.length ? "true" : undefined}');
    expect(source).toContain("export function InlineStatus");
    expect(source).toContain('tone === "danger" ? "alert" : "status"');
  });

  it("uses the accessible shared confirmation and static dossier loading", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dialog = await fs.readFile(
      path.join(process.cwd(), "src/components/ui/dialog.tsx"),
      "utf8",
    );
    const loading = await fs.readFile(
      path.join(process.cwd(), "src/components/page-loading.tsx"),
      "utf8",
    );
    expect(dialog).toContain("export function AppConfirmDialog");
    expect(dialog).toContain("<AppDialog");
    expect(dialog).toContain("details?: ReactNode");
    expect(dialog).toContain("max-h-48 overflow-y-auto");
    expect(loading).toContain("label = \"Preparing this view\"");
    expect(loading).not.toContain("loading-pulse");
    expect(loading).not.toContain("animate-pulse");
  });

  it("M47/D-118: LocalViewTabs and ReportRunSwitcher use local pending transitions", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const tabs = await fs.readFile(
      path.join(process.cwd(), "src/components/local-view-tabs.tsx"),
      "utf8",
    );
    const switcher = await fs.readFile(
      path.join(process.cwd(), "src/components/report/report-run-switcher.tsx"),
      "utf8",
    );
    expect(tabs).toContain("useTransition");
    expect(tabs).toContain("Opening section…");
    expect(tabs).toContain("aria-busy={isPending || undefined}");
    expect(switcher).toContain("useTransition");
    expect(switcher).toContain("Opening report run…");
    expect(switcher).toContain("aria-busy={isPending || undefined}");
  });

  it("M49/D-119: Message Lift wizard uses buyer profiles, full-response selection, and prompt review", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const wizard = await fs.readFile(
      path.join(process.cwd(), "src/components/resonance/study-wizard.tsx"),
      "utf8",
    );
    expect(wizard).toContain("Profile name (required)");
    expect(wizard).toContain("+ Add buyer profile");
    expect(wizard).toContain("View full response");
    expect(wizard).toContain("Use as Current message");
    expect(wizard).toContain('className="w-[min(100%-2rem,48rem)]"');
    expect(wizard).toContain("PromptDisclosurePanel");
    expect(wizard).toContain("only the message may change");
    expect(wizard).toContain("Early read");
    expect(wizard).not.toContain("Buyer type");
    expect(wizard).not.toContain("Label (required)");
    expect(wizard).not.toContain("+ Add buyer type");

    // Study-level framing batch ring (one poller) — not inside FramingCard.
    const step3 = wizard.slice(
      wizard.indexOf("{/* STEP 3 — framings */}"),
      wizard.indexOf("function FramingCard("),
    );
    const cardBody = wizard.slice(wizard.indexOf("function FramingCard("));
    expect(step3.indexOf("<FramingBatchProgress")).toBeGreaterThanOrEqual(0);
    expect(step3.indexOf("<FramingBatchProgress")).toBeLessThan(step3.indexOf("stimuli.map"));
    expect(cardBody).not.toContain("<FramingBatchProgress");
    expect(wizard.match(/<FramingBatchProgress/g)?.length).toBe(1);

    // The Button primitive reserves width for its pending label. Keep this card's
    // save state name-independent, so a long editable message name cannot widen
    // the action row and clip Delete.
    expect(cardBody).toContain('className="mt-3 flex flex-wrap gap-2"');
    expect(cardBody).toContain('pendingLabel="Saving message"');
    expect(cardBody).not.toContain('pendingLabel={`Saving ${label || "message"}`}');
  });

  it("M50/D-120: run page renders only the ready forecast range; ETA machinery is gone", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const page = await fs.readFile(
      path.join(process.cwd(), "src/components/runner/run-progress.tsx"),
      "utf8",
    );
    // Ready-only rendering behind the exact-copy formatter, with a state hook
    // for tests; paused/offline keep their own banners (no estimate line).
    expect(page).toContain('data-testid="run-forecast"');
    expect(page).toContain("data-forecast-state=");
    expect(page).toContain('detail.forecast?.state === "ready"');
    expect(page).toContain("formatRunForecastRange");
    expect(page).toContain("WORKER OFFLINE");
    expect(page).toContain("resolvePauseReason");
    expect(page).not.toContain("run-eta");
    expect(page).not.toContain("approxRemainingSeconds");
    expect(page).not.toContain("formatApproxRemaining");

    const core = await fs.readFile(
      path.join(process.cwd(), "src/core/run-progress.ts"),
      "utf8",
    );
    expect(core).not.toContain("estimateRunEta");
    expect(core).not.toContain("RunEta");
    expect(core).not.toContain("EWMA");
    expect(core).not.toContain("ewma");

    const forecast = await fs.readFile(
      path.join(process.cwd(), "src/core/run-forecast.ts"),
      "utf8",
    );
    expect(forecast).toContain("RUN_FORECAST_MIN_COMPLETIONS = 10");
    expect(forecast).toContain("RUN_FORECAST_WINDOW_COMPLETIONS = 5");
    expect(forecast).toContain("RUN_FORECAST_RECENT_LIMIT = 20");
    expect(forecast).toContain("RUN_FORECAST_STALE_MULTIPLIER = 3");
    expect(forecast).toContain("Estimated ${lowMin}–${highMin} min remaining");

    // The repository never queries historical runs for the forecast.
    const repo = await fs.readFile(
      path.join(process.cwd(), "src/db/repositories/runner.ts"),
      "utf8",
    );
    expect(repo).not.toContain("listCompatiblePriorCompletionTimestamps");
    expect(repo).not.toContain("estimateRunEta");
    expect(repo).not.toContain("seedIntervals");
    expect(repo).toContain("computeRunForecast");
  });

  it("M51: RunModeStamp maps modes; calibrating copy is exact; baseline picker loads pages", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const stamp = await fs.readFile(
      path.join(process.cwd(), "src/components/run-mode-stamp.tsx"),
      "utf8",
    );
    const progress = await fs.readFile(
      path.join(process.cwd(), "src/components/runner/run-progress.tsx"),
      "utf8",
    );
    const wizard = await fs.readFile(
      path.join(process.cwd(), "src/components/resonance/study-wizard.tsx"),
      "utf8",
    );
    expect(stamp).toContain('runMode === "mock"');
    expect(stamp).toContain("MOCK");
    expect(stamp).toContain("VALIDATION-ONLY");
    expect(stamp).toContain("Completeness stamps (PARTIAL) stay separate");
    expect(stamp).not.toContain("<Stamp tone=\"warn\">PARTIAL</Stamp>");
    expect(progress).toContain("Learning this run&rsquo;s pace…");
    expect(progress).toContain('data-testid="run-forecast-calibrating"');
    expect(wizard).toContain("fetchBaselinePickerPageAction");
    expect(wizard).toContain("Load more responses");
    expect(wizard).not.toContain(".slice(0, 12)");
  });

  it("M52/D-122: Run detail uses Diagnostics; Events/Extraction tabs are gone", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const page = await fs.readFile(
      path.join(process.cwd(), "src/app/projects/[id]/runs/[runId]/page.tsx"),
      "utf8",
    );
    const progress = await fs.readFile(
      path.join(process.cwd(), "src/components/runner/run-progress.tsx"),
      "utf8",
    );
    const views = await fs.readFile(path.join(process.cwd(), "src/core/views.ts"), "utf8");

    expect(page).toContain('label: "Diagnostics"');
    expect(page).toContain('data-testid="run-diagnostics"');
    expect(page).toContain('id: "diagnostics"');
    expect(page).not.toContain('label: "Events"');
    expect(page).not.toContain('label: "Extraction"');
    // Simulation: ExtractionPanel only when !isResonance on diagnostics.
    expect(page).toContain("!isResonance && (");
    expect(page).toContain('panel="extraction"');

    expect(progress).toContain('data-testid="run-recent-activity"');
    expect(progress).toContain("Open Diagnostics →");
    expect(progress).toContain('view=diagnostics');
    expect(progress).not.toContain('view=events');
    expect(progress).not.toContain('view === "events"');

    // M54/D-124: Collecting responses substance section on Overview.
    expect(progress).toContain("CollectingResponses");
    expect(progress).toContain("liveActivity");
    const collecting = await fs.readFile(
      path.join(process.cwd(), "src/components/runner/collecting-responses.tsx"),
      "utf8",
    );
    expect(collecting).toContain('data-testid="run-collecting-responses"');
    expect(collecting).toContain("Collecting responses");
    expect(collecting).toContain("Asking now");
    expect(collecting).toContain("Just collected");
    // Operator-facing string literals only (ignore internal field names).
    const collectingCopy = [...collecting.matchAll(/["'`]([^"'`]{3,})["'`]/g)]
      .map((m) => m[1]!.toLowerCase())
      .join("\n");
    expect(collectingCopy).not.toMatch(/worker offline|api call|heartbeat|dead letter|pipeline/);

    expect(views).toContain('"diagnostics"');
    expect(views).toContain('events: "diagnostics"');
    expect(views).toContain('extraction: "diagnostics"');
    expect(views).not.toContain('"events", "extraction"');
  });

  it("M51 Phase 3: EmptyState exports kinds and projects page uses it", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const emptyState = await fs.readFile(
      path.join(process.cwd(), "src/components/empty-state.tsx"),
      "utf8",
    );
    const projectsPage = await fs.readFile(
      path.join(process.cwd(), "src/app/(global)/projects/page.tsx"),
      "utf8",
    );
    expect(emptyState).toContain('"first-use"');
    expect(emptyState).toContain('"filtered-zero"');
    expect(emptyState).toContain('"unavailable"');
    expect(emptyState).toContain('"completed-success"');
    expect(emptyState).toContain("export type EmptyStateKind");
    expect(projectsPage).toContain('from "@/components/empty-state"');
    expect(projectsPage).toContain("<EmptyState");
    expect(projectsPage).toContain('kind="first-use"');
  });
});
