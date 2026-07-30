import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const primaryFiles = [
  "src/components/resonance/new-study-dialog.tsx",
  "src/components/resonance/study-wizard.tsx",
  "src/components/resonance/study-results-panel.tsx",
  "src/components/resonance/recommendation-results-panel.tsx",
  "src/components/resonance/prompt-disclosure-panel.tsx",
  "src/components/resonance/evidence-filters.tsx",
  "src/components/resonance/baseline-provenance.tsx",
  "src/components/dashboard/simulation-summary.tsx",
  "src/app/projects/[id]/resonance/page.tsx",
  "src/app/projects/[id]/resonance/[studyId]/page.tsx",
  "src/app/projects/[id]/dashboard/page.tsx",
  "src/core/nav.ts",
  "src/core/pipeline.ts",
  "src/core/report-templates.ts",
];

describe("M49 primary-surface language", () => {
  it("keeps retired methodology jargon out of the Message Lift workflow", () => {
    const source = primaryFiles
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    for (const retired of [
      "Simulation Layer",
      "MODEL-IMPLIED",
      "UNCALIBRATED",
      "Measured AI framing",
      "New study",
      "Simulation studies",
      "Mean PI",
      "ΔPI",
      "DRAW FLOOR",
      "Variant ranking",
      "Engine ·",
    ]) {
      expect(source, retired).not.toContain(retired);
    }
  });

  it("keeps the retired product name off human-facing source", () => {
    const source = [
      ...primaryFiles,
      "src/app/login/page.tsx",
      "src/components/shell/operator-shell.tsx",
    ]
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bParallax\b/);
  });
});
