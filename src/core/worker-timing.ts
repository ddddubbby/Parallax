export interface WorkerTimingConfig {
  staleLockMs: number;
  staleReclaimIntervalMs: number;
  extractionSweepAgeMs: number;
  extractionSweepBatch: number;
  providerCallTimeoutMs: number;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

export function resolveWorkerTiming(env: Record<string, string | undefined> = process.env): WorkerTimingConfig {
  const staleLockMs = positiveInteger(env.WORKER_STALE_LOCK_MS, 60_000);
  const requestedProviderTimeout = positiveInteger(env.WORKER_PROVIDER_TIMEOUT_MS, 45_000);
  const staleMarginMs = Math.min(5_000, Math.max(1, Math.floor(staleLockMs / 2)));
  const maxProviderTimeoutMs = Math.max(1, staleLockMs - staleMarginMs);

  return {
    staleLockMs,
    staleReclaimIntervalMs: positiveInteger(env.WORKER_STALE_RECLAIM_INTERVAL_MS, 15_000),
    extractionSweepAgeMs: positiveInteger(env.WORKER_EXTRACTION_SWEEP_AGE_MS, 60_000),
    extractionSweepBatch: positiveInteger(env.WORKER_EXTRACTION_SWEEP_BATCH, 25),
    // D-039: a provider call must not outlive the stale-lock window, or a
    // still-running paid request can be reclaimed and billed twice.
    providerCallTimeoutMs: Math.min(requestedProviderTimeout, maxProviderTimeoutMs),
  };
}
