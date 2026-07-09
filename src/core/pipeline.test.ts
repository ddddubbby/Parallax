import { describe, expect, it } from "vitest";
import { resolveProjectStage } from "./pipeline";

const base = {
  intakeComplete: true,
  hasMatrix: true,
  hasApprovedMatrix: true,
  hasActiveRun: false,
  hasCompletedRun: false,
};

describe("resolveProjectStage (OX-2)", () => {
  it("walks the pipeline to the single next action", () => {
    expect(resolveProjectStage({ ...base, intakeComplete: false }).nextPath).toBe("");
    expect(resolveProjectStage({ ...base, hasMatrix: false }).nextPath).toBe("matrix");
    expect(resolveProjectStage({ ...base, hasApprovedMatrix: false }).nextPath).toBe("matrix");
    expect(resolveProjectStage(base).nextPath).toBe("runs/new");
    expect(resolveProjectStage({ ...base, hasActiveRun: true }).nextPath).toBe("runs");
    expect(resolveProjectStage({ ...base, hasCompletedRun: true }).nextPath).toBe("dashboard");
  });

  it("prefers results over an in-flight run when both exist", () => {
    const stage = resolveProjectStage({ ...base, hasActiveRun: true, hasCompletedRun: true });
    expect(stage.nextPath).toBe("dashboard");
    expect(stage.stageLabel).toBe("Results ready");
  });

  it("surfaces the lower funnel once it has state (was previously blind — the banner ignored resonance)", () => {
    const done = { ...base, hasCompletedRun: true };
    // Audit complete, no resonance yet → unchanged.
    expect(resolveProjectStage(done).nextPath).toBe("dashboard");
    // Approved study / active sim run still route to resonance (definition + watch).
    // Completed sim results land on the Dashboard Simulation section (M31 / D-087).
    expect(resolveProjectStage({ ...done, hasApprovedResonanceStudy: true }).nextPath).toBe("resonance");
    expect(resolveProjectStage({ ...done, hasActiveResonanceRun: true }).nextPath).toBe("resonance");
    expect(resolveProjectStage({ ...done, hasCompletedResonanceRun: true }).nextPath).toBe("dashboard");
    expect(resolveProjectStage({ ...done, hasCompletedResonanceRun: true }).stageLabel).toBe(
      "Simulation results ready",
    );
    // A GENERIC study can run before any audit run completes.
    expect(resolveProjectStage({ ...base, hasActiveResonanceRun: true }).nextPath).toBe("resonance");
  });
});
