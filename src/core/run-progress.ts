// M46/D-117: stage-aware run progress (pure helpers). M50/D-120 moved
// remaining-time forecasting to run-forecast.ts (live-run-only range).

import { formatApproxRemaining } from "@/core/framing-batch";

export { formatApproxRemaining };

export const TERMINAL_EXTRACTION_STATES = ["valid", "dead_lettered", "qa_reviewed"] as const;
export const GENERATION_FINISHED_STATES = [
  "succeeded",
  "dead_lettered",
  "cancelled",
  "skipped",
] as const;
export const DIRECT_OVERALL_COMPLETE_STATES = ["dead_lettered", "cancelled", "skipped"] as const;
export const RUN_TERMINAL_STATES = ["completed", "failed", "cancelled"] as const;

export interface JobPipelineRow {
  jobId: string;
  jobState: string;
  jobUpdatedAt: Date;
  hasResponse: boolean;
  latestExtractionState: string | null;
  latestExtractionUpdatedAt: Date | null;
}

export interface RunStageCounts {
  completed: number;
  total: number;
  label: string;
}

export interface RunStageProgress {
  generation: RunStageCounts;
  secondary: RunStageCounts & { applicable: boolean };
  overall: { completed: number; total: number };
  /** Terminal run still missing terminal latest-extraction rows. */
  extractionGap: boolean;
  skipsExtraction: boolean;
}

export function isTerminalExtractionState(state: string | null | undefined): boolean {
  return (
    state === "valid" || state === "dead_lettered" || state === "qa_reviewed"
  );
}

export function isGenerationFinished(jobState: string): boolean {
  return (GENERATION_FINISHED_STATES as readonly string[]).includes(jobState);
}

export function isDirectOverallComplete(jobState: string): boolean {
  return (DIRECT_OVERALL_COMPLETE_STATES as readonly string[]).includes(jobState);
}

export function isRunTerminalState(runState: string): boolean {
  return (RUN_TERMINAL_STATES as readonly string[]).includes(runState);
}

/**
 * A successful job is overall-complete only when its latest extraction/scoring
 * row is terminal. Dead-lettered, cancelled, and skipped jobs count directly.
 * Crypto-agent (no-extraction) treated as complete at generation success.
 */
export function isOverallPipelineComplete(
  row: JobPipelineRow,
  opts: { skipsExtraction: boolean },
): boolean {
  if (isDirectOverallComplete(row.jobState)) return true;
  if (row.jobState !== "succeeded") return false;
  if (opts.skipsExtraction) return true;
  return isTerminalExtractionState(row.latestExtractionState);
}

export function overallCompletionAt(
  row: JobPipelineRow,
  opts: { skipsExtraction: boolean },
): Date | null {
  if (!isOverallPipelineComplete(row, opts)) return null;
  if (
    row.jobState === "succeeded" &&
    !opts.skipsExtraction &&
    row.latestExtractionUpdatedAt
  ) {
    return row.latestExtractionUpdatedAt;
  }
  return row.jobUpdatedAt;
}

export function stageLabels(matrixKind: "audit" | "resonance"): {
  generation: string;
  secondary: string;
} {
  if (matrixKind === "resonance") {
    return {
      generation: "Generating simulated reactions",
      secondary: "Scoring reactions",
    };
  }
  return {
    generation: "Generating AI responses",
    secondary: "Extracting evidence",
  };
}

export function computeStageProgress(input: {
  jobs: JobPipelineRow[];
  plannedCalls: number;
  matrixKind: "audit" | "resonance";
  skipsExtraction: boolean;
  runState: string;
}): RunStageProgress {
  const labels = stageLabels(input.matrixKind);
  const generationCompleted = input.jobs.filter((j) => isGenerationFinished(j.jobState)).length;
  const responses = input.jobs.filter((j) => j.hasResponse);
  const secondaryApplicable = !input.skipsExtraction;
  const secondaryCompleted = secondaryApplicable
    ? responses.filter((j) => isTerminalExtractionState(j.latestExtractionState)).length
    : 0;
  const secondaryTotal = secondaryApplicable ? responses.length : 0;
  const overallCompleted = input.jobs.filter((j) =>
    isOverallPipelineComplete(j, { skipsExtraction: input.skipsExtraction }),
  ).length;
  const overallTotal = Math.max(input.plannedCalls, input.jobs.length);
  const extractionGap =
    isRunTerminalState(input.runState) &&
    secondaryApplicable &&
    responses.some((j) => !isTerminalExtractionState(j.latestExtractionState));

  return {
    generation: {
      completed: generationCompleted,
      total: Math.max(input.plannedCalls, input.jobs.length),
      label: labels.generation,
    },
    secondary: {
      completed: secondaryCompleted,
      total: secondaryTotal,
      label: labels.secondary,
      applicable: secondaryApplicable,
    },
    overall: { completed: overallCompleted, total: overallTotal },
    extractionGap,
    skipsExtraction: input.skipsExtraction,
  };
}

export function completionTimestampsFromJobs(
  jobs: JobPipelineRow[],
  opts: { skipsExtraction: boolean },
): Date[] {
  const stamps: Date[] = [];
  for (const job of jobs) {
    const at = overallCompletionAt(job, opts);
    if (at) stamps.push(at);
  }
  return stamps;
}
