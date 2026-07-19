// M46/D-117: stage-aware run progress + EWMA ETA (pure helpers).

import { formatApproxRemaining } from "@/core/framing-batch";

export { formatApproxRemaining };

export const RUN_ETA_EWMA_ALPHA = 0.35;
export const RUN_ETA_INTERVAL_WINDOW = 20;
export const RUN_ETA_OUTLIER_MEDIAN_MULTIPLIER = 3;
/** Minimum filtered intervals before an ETA is shown. */
export const RUN_ETA_MIN_INTERVALS = 2;

export const TERMINAL_EXTRACTION_STATES = ["valid", "dead_lettered", "qa_reviewed"] as const;
export const GENERATION_FINISHED_STATES = [
  "succeeded",
  "dead_lettered",
  "cancelled",
  "skipped",
] as const;
export const DIRECT_OVERALL_COMPLETE_STATES = ["dead_lettered", "cancelled", "skipped"] as const;
export const RUN_TERMINAL_STATES = ["completed", "failed", "cancelled"] as const;

export type RunEtaEstimateState =
  | "ready"
  | "complete"
  | "suppressed_paused"
  | "suppressed_offline"
  | "suppressed_terminal"
  | "insufficient_evidence";

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

export interface RunEta {
  approxRemainingSeconds: number | null;
  state: RunEtaEstimateState;
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

/** Sorted ascending completion timestamps → consecutive intervals in ms. */
export function intervalsFromTimestamps(timestamps: Date[]): number[] {
  if (timestamps.length < 2) return [];
  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i]!.getTime() - sorted[i - 1]!.getTime();
    if (delta > 0) intervals.push(delta);
  }
  return intervals;
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Drop intervals above 3× the rolling median of intervals kept so far.
 * The first interval is always kept (no median yet).
 */
export function filterOutlierIntervals(
  intervalsMs: number[],
  multiplier = RUN_ETA_OUTLIER_MEDIAN_MULTIPLIER,
): number[] {
  const kept: number[] = [];
  for (const interval of intervalsMs) {
    if (kept.length === 0) {
      kept.push(interval);
      continue;
    }
    const median = medianOf(kept);
    if (median === null || interval <= multiplier * median) {
      kept.push(interval);
    }
  }
  return kept;
}

/** EWMA of intervals; returns mean interval in ms, or null if empty. */
export function ewmaIntervalMs(
  intervalsMs: number[],
  alpha = RUN_ETA_EWMA_ALPHA,
): number | null {
  if (intervalsMs.length === 0) return null;
  let value = intervalsMs[0]!;
  for (let i = 1; i < intervalsMs.length; i++) {
    value = alpha * intervalsMs[i]! + (1 - alpha) * value;
  }
  return value;
}

/**
 * Build the interval series used for ETA: current-run intervals after outlier
 * filter, seeded from compatible prior runs when sparse, capped at latest 20.
 */
export function buildEtaIntervalSeries(
  currentIntervalsMs: number[],
  seedIntervalsMs: number[],
): number[] {
  const current = filterOutlierIntervals(currentIntervalsMs);
  let series = current;
  if (series.length < RUN_ETA_MIN_INTERVALS) {
    const seed = filterOutlierIntervals(seedIntervalsMs);
    series = [...seed, ...current];
  }
  return series.slice(-RUN_ETA_INTERVAL_WINDOW);
}

export function estimateRunEta(input: {
  remainingCount: number;
  currentIntervalsMs: number[];
  seedIntervalsMs: number[];
  runState: string;
  workerOffline: boolean;
}): RunEta {
  if (input.runState === "paused") {
    return { approxRemainingSeconds: null, state: "suppressed_paused" };
  }
  if (input.workerOffline) {
    return { approxRemainingSeconds: null, state: "suppressed_offline" };
  }
  // Terminal runs (including completed-with-extraction-gap) must not show an ETA —
  // polling has stopped and no further worker progress is expected.
  if (isRunTerminalState(input.runState)) {
    return { approxRemainingSeconds: null, state: "suppressed_terminal" };
  }
  if (input.remainingCount <= 0) {
    return { approxRemainingSeconds: 0, state: "complete" };
  }

  const series = buildEtaIntervalSeries(input.currentIntervalsMs, input.seedIntervalsMs);
  if (series.length < RUN_ETA_MIN_INTERVALS) {
    return { approxRemainingSeconds: null, state: "insufficient_evidence" };
  }

  const meanMs = ewmaIntervalMs(series);
  if (meanMs === null || !Number.isFinite(meanMs) || meanMs <= 0) {
    return { approxRemainingSeconds: null, state: "insufficient_evidence" };
  }

  return {
    approxRemainingSeconds: Math.round((input.remainingCount * meanMs) / 1000),
    state: "ready",
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
