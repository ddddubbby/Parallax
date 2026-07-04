// Pipeline stage resolution (OX-2): the single primary next action for a
// project, from its intake/matrix/run state. Pure — the repository supplies
// the booleans, the component builds hrefs from the returned relative path.

export interface PipelineState {
  intakeComplete: boolean;
  hasMatrix: boolean;
  hasApprovedMatrix: boolean;
  hasActiveRun: boolean; // queued or running
  hasCompletedRun: boolean;
}

export interface PipelineStage {
  stageLabel: string;
  /** Null when the project is fully walkable and there is no single next step to push. */
  nextLabel: string | null;
  /** Relative to /projects/[id]; null when nextLabel is null. */
  nextPath: string | null;
}

export function resolveProjectStage(s: PipelineState): PipelineStage {
  if (!s.intakeComplete) {
    return { stageLabel: "Intake in progress", nextLabel: "Finish intake", nextPath: "" };
  }
  if (!s.hasMatrix) {
    return { stageLabel: "Intake complete", nextLabel: "Generate the prompt matrix", nextPath: "matrix" };
  }
  if (!s.hasApprovedMatrix) {
    return { stageLabel: "Matrix drafted", nextLabel: "Review and approve the matrix", nextPath: "matrix" };
  }
  if (s.hasCompletedRun) {
    return { stageLabel: "Results ready", nextLabel: "View the dashboard", nextPath: "dashboard" };
  }
  if (s.hasActiveRun) {
    return { stageLabel: "Run in progress", nextLabel: "Watch the run", nextPath: "runs" };
  }
  return { stageLabel: "Matrix approved", nextLabel: "Start a run", nextPath: "runs/new" };
}
