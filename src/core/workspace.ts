// M31 / D-087: pure helpers for the project workspace hub and the walled
// Simulation summary on the Dashboard. Status copy is derived from the same
// PipelineState OX-2 already uses; simulation headlines are shaped from
// ResonanceStudyResults only — never from audit metric scopes (C-12).

import type { PipelineState } from "./pipeline";

export interface WorkspaceHubCounts {
  auditRuns: number;
  resonanceRuns: number;
  studies: number;
  approvedStudies: number;
}

export interface WorkspaceHubSection {
  number: string;
  label: string;
  /** Relative to /projects/[id]. */
  href: string;
  status: string;
}

export function workspaceHubSections(
  state: PipelineState,
  counts: WorkspaceHubCounts,
): WorkspaceHubSection[] {
  const setupStatus = (() => {
    if (!state.intakeComplete) return "Intake incomplete — finish the wizard";
    if (!state.hasMatrix) return "Inputs ready — generate the prompt matrix";
    if (!state.hasApprovedMatrix) return "Matrix drafted — review and approve";
    if (counts.approvedStudies > 0) {
      return `Inputs + matrix ready · ${counts.approvedStudies} approved simulation stud${counts.approvedStudies === 1 ? "y" : "ies"}`;
    }
    if (counts.studies > 0) return "Inputs + matrix ready · simulation study in draft";
    return "Inputs + matrix ready";
  })();

  const runsStatus = (() => {
    if (state.hasActiveRun || state.hasActiveResonanceRun) {
      return state.hasActiveResonanceRun && !state.hasActiveRun
        ? "Simulation run in progress"
        : state.hasActiveRun && !state.hasActiveResonanceRun
          ? "Audit run in progress"
          : "Runs in progress";
    }
    const parts: string[] = [];
    parts.push(
      counts.auditRuns === 0
        ? "No audit runs"
        : `${counts.auditRuns} audit run${counts.auditRuns === 1 ? "" : "s"}`,
    );
    parts.push(
      counts.resonanceRuns === 0
        ? "no simulation runs"
        : `${counts.resonanceRuns} simulation run${counts.resonanceRuns === 1 ? "" : "s"}`,
    );
    return parts.join(" · ");
  })();

  const dashboardStatus = (() => {
    if (state.hasCompletedResonanceRun && state.hasCompletedRun) {
      return "Audit + simulation results ready";
    }
    if (state.hasCompletedResonanceRun) return "Simulation results ready";
    if (state.hasCompletedRun) return "Audit results ready";
    return "No completed runs yet";
  })();

  const reportStatus = state.hasCompletedRun || state.hasCompletedResonanceRun
    ? "Reportable runs on file"
    : "Needs a completed run";

  return [
    { number: "01", label: "Setup", href: "setup", status: setupStatus },
    { number: "02", label: "Runs", href: "runs", status: runsStatus },
    { number: "03", label: "Dashboard", href: "dashboard", status: dashboardStatus },
    { number: "04", label: "Report", href: "report", status: reportStatus },
  ];
}

/** One engine's headline ΔPI for the Dashboard Simulation summary (D-080). */
export interface SimulationEngineHeadline {
  providerId: string;
  /** Best (highest) ΔPI among variants for this engine; null if no deltas. */
  topDeltaPiMean: number | null;
  topDeltaLabel: string | null;
  baselineLabel: string | null;
  directionalOnly: boolean;
}

export interface SimulationStudySummary {
  studyId: string;
  studyName: string;
  runId: string | null;
  runMode: string | null;
  engines: SimulationEngineHeadline[];
}

/**
 * Shape ResonanceStudyResults into Dashboard summary cards. Input is already
 * resonance-scoped (getResonanceStudyResults); this function never accepts
 * audit metric rows — the type boundary is the C-12 wall for the UI layer.
 */
export function summarizeSimulationStudy(input: {
  studyId: string;
  studyName: string;
  runId: string | null;
  runMode: string | null;
  providerGroups: Array<{
    providerId: string;
    deltas: Array<{
      label: string;
      baselineLabel: string;
      deltaPiMean: number;
      directionalOnly: boolean;
    }>;
  }>;
} | null): SimulationStudySummary | null {
  if (!input) return null;
  return {
    studyId: input.studyId,
    studyName: input.studyName,
    runId: input.runId,
    runMode: input.runMode,
    engines: input.providerGroups.map((group) => {
      const top = [...group.deltas].sort(
        (a, b) => b.deltaPiMean - a.deltaPiMean || a.label.localeCompare(b.label),
      )[0];
      return {
        providerId: group.providerId,
        topDeltaPiMean: top?.deltaPiMean ?? null,
        topDeltaLabel: top?.label ?? null,
        baselineLabel: top?.baselineLabel ?? null,
        directionalOnly: top?.directionalOnly ?? false,
      };
    }),
  };
}
