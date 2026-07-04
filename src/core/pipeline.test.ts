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
});
