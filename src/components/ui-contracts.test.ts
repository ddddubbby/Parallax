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
});
