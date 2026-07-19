// M46/D-117: framing-observation batch progress DTO (presentation + poll contract).

export type FramingObservationBatchState =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "partial"
  | "failed";

export const FRAMING_BATCH_ACTIVE_STATES: FramingObservationBatchState[] = [
  "queued",
  "running",
  "paused",
];

export const FRAMING_BATCH_TERMINAL_STATES: FramingObservationBatchState[] = [
  "completed",
  "partial",
  "failed",
];

export interface FramingObservationBatchProgress {
  batchId: string;
  projectId: string;
  state: FramingObservationBatchState;
  totalCount: number;
  processedCount: number;
  validCount: number;
  failedCount: number;
  costUsd: number;
  /** Approximate seconds remaining; null when suppressed (paused/offline/insufficient evidence). */
  approxRemainingSeconds: number | null;
  pausedReason: string | null;
  error: string | null;
  workerOffline: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export function isFramingBatchTerminal(state: string): boolean {
  return (FRAMING_BATCH_TERMINAL_STATES as string[]).includes(state);
}

export function isFramingBatchActive(state: string): boolean {
  return (FRAMING_BATCH_ACTIVE_STATES as string[]).includes(state);
}

/** Minute-granularity copy; never a second-by-second countdown. */
export function formatApproxRemaining(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 45) return "About a minute remaining";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "About 1 min remaining" : `About ${minutes} min remaining`;
}

/**
 * Crude ETA from elapsed work: remaining * (elapsed / processed).
 * Suppressed when paused, offline, or fewer than 2 completions.
 */
export function estimateFramingBatchRemainingSeconds(input: {
  state: string;
  workerOffline: boolean;
  processedCount: number;
  totalCount: number;
  startedAt: Date | null;
  now?: Date;
}): number | null {
  if (input.state === "paused" || input.workerOffline) return null;
  if (input.processedCount < 2 || !input.startedAt) return null;
  const remaining = input.totalCount - input.processedCount;
  if (remaining <= 0) return 0;
  const elapsedMs = (input.now ?? new Date()).getTime() - input.startedAt.getTime();
  if (elapsedMs < 1_000) return null;
  const perItemMs = elapsedMs / input.processedCount;
  return Math.round((remaining * perItemMs) / 1000);
}
