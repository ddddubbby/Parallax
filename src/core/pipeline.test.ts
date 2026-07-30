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
    expect(resolveProjectStage({ ...done, hasCompletedResonanceRun: true }).nextPath).toBe(
      "dashboard?view=simulation",
    );
    expect(resolveProjectStage({ ...done, hasCompletedResonanceRun: true }).stageLabel).toBe(
      "Message Lift results ready",
    );
    // A GENERIC study can run before any audit run completes.
    expect(resolveProjectStage({ ...base, hasActiveResonanceRun: true }).nextPath).toBe("resonance");
  });
});

describe("resolveProjectStage (M44 / D-114 journey stages)", () => {
  const done = { ...base, hasCompletedRun: true };

  it("walks See -> Pick -> Rewrite -> Test in order", () => {
    // Results, no study yet: the See step.
    expect(resolveProjectStage(done).journey).toBe("see");
    expect(resolveProjectStage(done).nextPath).toBe("dashboard");
    // Draft study without baseline: Pick.
    const started = resolveProjectStage({ ...done, hasStudy: true });
    expect(started.journey).toBe("pick");
    expect(started.nextLabel).toBe("Pick the framing to fight");
    expect(started.nextPath).toBe("resonance");
    // Baseline attached: Rewrite.
    const picked = resolveProjectStage({ ...done, hasStudy: true, hasStudyBaseline: true });
    expect(picked.journey).toBe("rewrite");
    expect(picked.nextLabel).toBe("Write the New message");
    // Challengers drafted: approve (Test boundary).
    const drafted = resolveProjectStage({
      ...done, hasStudy: true, hasStudyBaseline: true, hasStudyChallengers: true,
    });
    expect(drafted.journey).toBe("test");
    expect(drafted.nextLabel).toBe("Approve and run the test");
    // Approved: run.
    expect(resolveProjectStage({ ...done, hasApprovedResonanceStudy: true }).journey).toBe("test");
    // Running and complete stay on Test.
    expect(resolveProjectStage({ ...done, hasActiveResonanceRun: true }).journey).toBe("test");
    expect(resolveProjectStage({ ...done, hasCompletedResonanceRun: true }).journey).toBe("test");
  });

  it("study stages outrank the bare Results stage but never an approved/running/complete study", () => {
    // Approved study wins over draft flags (drafts of a second study do not regress guidance).
    const s = resolveProjectStage({
      ...done, hasStudy: true, hasStudyBaseline: true, hasApprovedResonanceStudy: true,
    });
    expect(s.nextLabel).toBe("Run the Message Lift test");
  });

  it("audit-setup stages carry no journey position", () => {
    expect(resolveProjectStage({ ...base, intakeComplete: false }).journey).toBeNull();
    expect(resolveProjectStage({ ...base, hasMatrix: false }).journey).toBeNull();
    expect(resolveProjectStage(base).journey).toBeNull();
    expect(resolveProjectStage({ ...base, hasActiveRun: true }).journey).toBeNull();
  });

  it("no dead ends: every stage with a nextLabel carries a nextPath and a hint", () => {
    const states = [
      { ...base, intakeComplete: false },
      { ...base, hasMatrix: false },
      { ...base, hasApprovedMatrix: false },
      base,
      { ...base, hasActiveRun: true },
      { ...base, hasActiveResonanceRun: true },
      done,
      { ...done, hasStudy: true },
      { ...done, hasStudy: true, hasStudyBaseline: true },
      { ...done, hasStudy: true, hasStudyBaseline: true, hasStudyChallengers: true },
      { ...done, hasApprovedResonanceStudy: true },
      { ...done, hasActiveResonanceRun: true },
      { ...done, hasCompletedResonanceRun: true },
    ];
    for (const state of states) {
      const stage = resolveProjectStage(state);
      expect(stage.hint.length).toBeGreaterThan(0);
      if (stage.nextLabel !== null) expect(stage.nextPath).not.toBeNull();
    }
  });
});
