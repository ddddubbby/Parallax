// Pipeline stage resolution (OX-2, extended by M44/D-114): the single primary
// next action for a project, from its intake/matrix/run/study state. Pure —
// the repository supplies the booleans, the component builds hrefs from the
// returned relative path. This is the ONE source of truth for "what should the
// operator do next"; every next-step banner, empty-state CTA, and library hint
// renders from here so guidance can never drift apart across surfaces (the
// no-dead-end contract: every stage with a nextLabel carries a nextPath).

export interface PipelineState {
  intakeComplete: boolean;
  hasMatrix: boolean;
  hasApprovedMatrix: boolean;
  hasActiveRun: boolean; // queued or running
  hasCompletedRun: boolean;
  hasApprovedResonanceStudy?: boolean;
  hasActiveResonanceRun?: boolean;
  hasCompletedResonanceRun?: boolean;
  /** M44: any resonance study exists (draft or approved). */
  hasStudy?: boolean;
  /** M44: a draft study has a measured_ai baseline stimulus attached. */
  hasStudyBaseline?: boolean;
  /** M44: a draft study has at least one challenger stimulus beyond the baseline. */
  hasStudyChallengers?: boolean;
}

/** M44/D-114: the four-step operator journey. Null when the project is still in audit setup. */
export type JourneyStep = "see" | "pick" | "rewrite" | "test";

export const JOURNEY_STEPS: readonly { key: JourneyStep; label: string }[] = [
  { key: "see", label: "SEE" },
  { key: "pick", label: "PICK" },
  { key: "rewrite", label: "REWRITE" },
  { key: "test", label: "TEST" },
];

export interface PipelineStage {
  stageLabel: string;
  /** Null when the project is fully walkable and there is no single next step to push. */
  nextLabel: string | null;
  /** Relative to /projects/[id]; null when nextLabel is null. */
  nextPath: string | null;
  /** One sentence of orientation: why this is the next step. */
  hint: string;
  /** Position on the See → Pick → Rewrite → Test rail; null before audit results exist. */
  journey: JourneyStep | null;
}

export function resolveProjectStage(s: PipelineState): PipelineStage {
  if (!s.intakeComplete) {
    return {
      stageLabel: "Intake in progress",
      nextLabel: "Finish intake",
      nextPath: "",
      hint: "Complete project setup so prompts can be generated from your brand facts.",
      journey: null,
    };
  }
  if (!s.hasMatrix) {
    return {
      stageLabel: "Intake complete",
      nextLabel: "Generate the prompt matrix",
      nextPath: "matrix",
      hint: "The matrix is the set of questions the audit will put to each AI engine.",
      journey: null,
    };
  }
  if (!s.hasApprovedMatrix) {
    return {
      stageLabel: "Matrix drafted",
      nextLabel: "Review and approve the matrix",
      nextPath: "matrix",
      hint: "Approval freezes the exact prompts, so every reported number is traceable.",
      journey: null,
    };
  }
  if (s.hasCompletedRun) {
    // Audit results exist — the See step is satisfied; guide along the
    // See → Pick → Rewrite → Test journey (M44/D-114).
    if (s.hasActiveResonanceRun) {
      return {
        stageLabel: "Simulation running",
        nextLabel: "Watch the simulation",
        nextPath: "resonance",
        hint: "The synthetic panel is reacting to your framings now.",
        journey: "test",
      };
    }
    if (s.hasCompletedResonanceRun) {
      // M32 / D-088: Simulation results live on the walled Dashboard view.
      return {
        stageLabel: "Simulation results ready",
        nextLabel: "View simulation results",
        nextPath: "dashboard?view=simulation",
        hint: "See which framing lifted purchase intent most — comparisons only, never absolutes.",
        journey: "test",
      };
    }
    if (s.hasApprovedResonanceStudy) {
      return {
        stageLabel: "Study ready to run",
        nextLabel: "Run the simulation study",
        nextPath: "resonance",
        hint: "The study is approved and frozen — run the panel to measure ΔPI.",
        journey: "test",
      };
    }
    if (s.hasStudyChallengers) {
      return {
        stageLabel: "Challengers drafted",
        nextLabel: "Approve and run the panel",
        nextPath: "resonance",
        hint: "Baseline and challengers are set. Approval freezes the study for the panel.",
        journey: "test",
      };
    }
    if (s.hasStudyBaseline) {
      return {
        stageLabel: "Baseline picked",
        nextLabel: "Write challenger framings",
        nextPath: "resonance",
        hint: "Draft the messages you want to test against how AI describes you today.",
        journey: "rewrite",
      };
    }
    if (s.hasStudy) {
      return {
        stageLabel: "Study started",
        nextLabel: "Pick the framing to fight",
        nextPath: "resonance",
        hint: "Choose the real AI response your challengers will be measured against.",
        journey: "pick",
      };
    }
    return {
      stageLabel: "Results ready",
      nextLabel: "View the dashboard",
      nextPath: "dashboard",
      hint: "See how AI talks about your brand — then test a better framing against it.",
      journey: "see",
    };
  }
  if (s.hasActiveRun) {
    return {
      stageLabel: "Run in progress",
      nextLabel: "Watch the run",
      nextPath: "runs",
      hint: "Engines are being sampled. Results unlock the dashboard when the run completes.",
      journey: null,
    };
  }
  // A study can exist before any audit run completes (historical GENERIC path).
  if (s.hasActiveResonanceRun) {
    return {
      stageLabel: "Simulation running",
      nextLabel: "Watch the simulation",
      nextPath: "resonance",
      hint: "The synthetic panel is reacting to your framings now.",
      journey: "test",
    };
  }
  return {
    stageLabel: "Matrix approved",
    nextLabel: "Start a run",
    nextPath: "runs/new",
    hint: "Sampling each prompt k=5 times per engine is what makes the numbers honest.",
    journey: null,
  };
}

/**
 * M44: compact library-row hint. The projects table only knows status +
 * intake step, so this is deliberately the two-case cheap form of the map
 * above — full stage resolution stays on the hub, which has the state.
 */
export function projectListHint(status: string, intakeStep: number): string {
  if (status === "draft") return `next: finish intake (step ${Math.max(1, intakeStep)} of 8)`;
  return "open workspace for the next step";
}
