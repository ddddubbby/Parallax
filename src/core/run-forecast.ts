// M50/D-120: live-run-only remaining-time forecast (pure helpers).
// Supersedes the D-117 point ETA: no historical-run seeding, no EWMA, no
// outlier filter — only the current run's persisted terminal pipeline
// completion timestamps ever feed the range.

import { isRunTerminalState } from "./run-progress";

/** Never forecast before this many terminal pipeline completions (D-120). */
export const RUN_FORECAST_MIN_COMPLETIONS = 10;
/** Rolling window span in completions. */
export const RUN_FORECAST_WINDOW_COMPLETIONS = 5;
/** Only the latest N completions feed the rolling windows. */
export const RUN_FORECAST_RECENT_LIMIT = 20;
/** No completion for more than this multiple of the slow-end cadence → recalibrate. */
export const RUN_FORECAST_STALE_MULTIPLIER = 3;

export type RunForecastState =
  | "calibrating"
  | "ready"
  | "recalibrating"
  | "paused"
  | "offline"
  | "terminal"
  | "complete";

export interface RunForecastRange {
  lowSeconds: number;
  highSeconds: number;
}

export interface RunForecast {
  state: RunForecastState;
  /** Present only in the ready state. */
  range: RunForecastRange | null;
}

/**
 * Per-completion cadence (ms) of every rolling five-completion window across
 * the latest `RUN_FORECAST_RECENT_LIMIT` timestamps, sorted ascending.
 *
 * A five-completion window holds exactly four inter-completion gaps, so
 * span ÷ 4 reproduces a steady serial pace exactly. This measures real
 * aggregate pace — concurrency, extraction time, retries, and provider
 * variation all land inside the observed span. Concurrent bursts are honest:
 * a zero-span window yields a zero cadence (genuinely instant), never NaN.
 */
export function windowCadencesMs(timestamps: readonly Date[]): number[] {
  const sorted = [...timestamps]
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(-RUN_FORECAST_RECENT_LIMIT);
  const span = RUN_FORECAST_WINDOW_COMPLETIONS;
  const gaps = span - 1;
  const cadences: number[] = [];
  for (let i = 0; i + span <= sorted.length; i++) {
    const windowMs = sorted[i + span - 1]!.getTime() - sorted[i]!.getTime();
    cadences.push(windowMs / gaps);
  }
  return cadences;
}

/**
 * Conservative p10–p90 over per-window remaining-time estimates
 * (`remaining × cadence`). Nearest-conservative-rank indices over the sorted
 * estimates: low at floor(0.10·(W−1)), high at ceil(0.90·(W−1)) — small
 * samples resolve to min/max, larger ones trim one extreme window per side.
 */
export function remainingRangeSeconds(
  cadencesMs: readonly number[],
  remainingCount: number,
): RunForecastRange | null {
  if (cadencesMs.length === 0 || remainingCount <= 0) return null;
  const estimates = cadencesMs
    .map((cadence) => (remainingCount * cadence) / 1000)
    .sort((a, b) => a - b);
  const lowIdx = Math.floor(0.1 * (estimates.length - 1));
  const highIdx = Math.ceil(0.9 * (estimates.length - 1));
  return { lowSeconds: estimates[lowIdx]!, highSeconds: estimates[highIdx]! };
}

export function computeRunForecast(input: {
  remainingCount: number;
  /** Terminal pipeline completion timestamps of THIS run only (D-120). */
  completionTimestamps: readonly Date[];
  runState: string;
  workerOffline: boolean;
  now: Date;
}): RunForecast {
  if (input.runState === "paused") return { state: "paused", range: null };
  if (input.workerOffline) return { state: "offline", range: null };
  // Terminal runs (including completed-with-extraction-gap) never forecast —
  // polling has stopped and no further worker progress is expected.
  if (isRunTerminalState(input.runState)) return { state: "terminal", range: null };
  if (input.remainingCount <= 0) return { state: "complete", range: null };

  const sorted = [...input.completionTimestamps].sort((a, b) => a.getTime() - b.getTime());
  if (sorted.length < RUN_FORECAST_MIN_COMPLETIONS) {
    return { state: "calibrating", range: null };
  }

  const cadences = windowCadencesMs(sorted);
  const slowestCadenceMs = Math.max(...cadences);
  const lastCompletionAt = sorted[sorted.length - 1]!.getTime();
  // Stale pace: suppress rather than leave a forecast whose basis has stopped.
  if (
    slowestCadenceMs > 0 &&
    input.now.getTime() - lastCompletionAt > RUN_FORECAST_STALE_MULTIPLIER * slowestCadenceMs
  ) {
    return { state: "recalibrating", range: null };
  }

  const range = remainingRangeSeconds(cadences, input.remainingCount);
  if (!range) return { state: "calibrating", range: null };
  return { state: "ready", range };
}

/**
 * Ready-state copy: exactly `Estimated 8–14 min remaining`. Minute granularity
 * — low rounded down, high rounded up, clamped to at least one minute. Never
 * second-by-second, never basis or sample-count copy (D-120).
 */
export function formatRunForecastRange(range: RunForecastRange | null): string | null {
  if (!range) return null;
  const { lowSeconds, highSeconds } = range;
  if (
    !Number.isFinite(lowSeconds) ||
    !Number.isFinite(highSeconds) ||
    lowSeconds < 0 ||
    highSeconds < 0
  ) {
    return null;
  }
  const lowMin = Math.max(1, Math.floor(lowSeconds / 60));
  const highMin = Math.max(lowMin, Math.ceil(highSeconds / 60));
  return lowMin === highMin
    ? `Estimated ${lowMin} min remaining`
    : `Estimated ${lowMin}–${highMin} min remaining`;
}
