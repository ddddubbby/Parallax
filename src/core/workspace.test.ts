import { describe, expect, it } from "vitest";
import type { PipelineState } from "./pipeline";
import { summarizeSimulationStudy, workspaceHubSections } from "./workspace";

const base: PipelineState = {
  intakeComplete: true,
  hasMatrix: true,
  hasApprovedMatrix: true,
  hasActiveRun: false,
  hasCompletedRun: true,
};

describe("workspaceHubSections (M31 / D-087)", () => {
  it("returns five numbered dossier sections including Message Lift", () => {
    const sections = workspaceHubSections(base, {
      auditRuns: 2,
      resonanceRuns: 1,
      studies: 1,
      approvedStudies: 1,
    });
    expect(sections.map((s) => s.number)).toEqual(["01", "02", "03", "04", "05"]);
    expect(sections.map((s) => s.href)).toEqual([
      "setup",
      "runs",
      "dashboard",
      "resonance",
      "report",
    ]);
    expect(sections[3]?.label).toBe("Message Lift");
  });

  it("reflects resonance pipeline state in Setup and Dashboard status", () => {
    const sections = workspaceHubSections(
      { ...base, hasCompletedResonanceRun: true, hasApprovedResonanceStudy: true },
      { auditRuns: 1, resonanceRuns: 1, studies: 1, approvedStudies: 1 },
    );
    expect(sections[0]?.status).toContain("approved simulation");
    expect(sections[2]?.status).toBe("Audit + simulation results ready");
  });
});

describe("summarizeSimulationStudy (C-12 wall)", () => {
  it("only surfaces per-engine ΔPI from providerGroups — no audit metric keys", () => {
    const summary = summarizeSimulationStudy({
      studyId: "study-1",
      studyName: "Framing repair",
      runId: "run-1",
      runMode: "mock",
      providerGroups: [
        {
          providerId: "deepseek",
          deltas: [
            {
              label: "Fixed framing",
              baselineLabel: "Measured AI",
              deltaPiMean: 0.4,
              directionalOnly: false,
            },
            {
              label: "Alt fix",
              baselineLabel: "Measured AI",
              deltaPiMean: 0.1,
              directionalOnly: true,
            },
          ],
        },
      ],
    });
    expect(summary).toEqual({
      studyId: "study-1",
      studyName: "Framing repair",
      runId: "run-1",
      runMode: "mock",
      engines: [
        {
          providerId: "deepseek",
          topDeltaPiMean: 0.4,
          topDeltaLabel: "Fixed framing",
          baselineLabel: "Measured AI",
          directionalOnly: false,
        },
      ],
    });
    // Guard: the summary shape has no audit metric vocabulary.
    expect(JSON.stringify(summary)).not.toMatch(/mention_rate|share_of_voice|recommendation_rate/);
  });

  it("returns null for missing results (draft study, no run)", () => {
    expect(summarizeSimulationStudy(null)).toBeNull();
  });
});
