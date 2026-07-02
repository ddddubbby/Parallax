// Polling worker (RN-4, RN-5, RN-9): claims queued jobs per provider up to
// its concurrency limit, calls the provider, records results, and enforces
// the circuit breaker. Restart-safe — see reclaimStaleLocks.
import {
  computeFailureRate,
  decideRetry,
  shouldTripBreaker,
} from "@/core/runner";
import {
  appendRunEvent,
  claimJobs,
  completeRun,
  getRun,
  getRunFailureCounts,
  isRunFinished,
  listActiveRunIds,
  pauseRun,
  reclaimStaleLocks,
  recordDeadLetter,
  recordRetry,
  recordSuccess,
} from "@/db/repositories/runner";
import { listRegisteredProviders } from "@/providers/registry";
import type { GenerationMode, ProviderId } from "@/providers/types";

const POLL_INTERVAL_MS = 300;
const HEARTBEAT_MS = 30_000;
// Test-only overrides (scripts/test-mock-e2e.ts): a genuinely crashed
// worker's stuck jobs shouldn't wait a full production-scale window to be
// proven reclaimable. Defaults are conservative for real deploys.
const STALE_LOCK_MS = Number(process.env.WORKER_STALE_LOCK_MS ?? 60_000);
const STALE_RECLAIM_INTERVAL_MS = Number(process.env.WORKER_STALE_RECLAIM_INTERVAL_MS ?? 15_000);

interface FailureInjection {
  rate: number;
  errorType: string;
}

const runInjectionCache = new Map<string, FailureInjection | null>();

async function getFailureInjection(runId: string): Promise<FailureInjection | null> {
  if (runInjectionCache.has(runId)) return runInjectionCache.get(runId) ?? null;
  const run = await getRun(runId);
  const injection = (run?.debugFailureInjectionJson as FailureInjection | null) ?? null;
  runInjectionCache.set(runId, injection);
  return injection;
}

interface ClaimedJob {
  id: string;
  runId: string;
  cellId: string;
  providerId: string;
  generationMode: string;
  repIndex: number;
  attemptCount: number;
  resolvedText: string;
}

async function afterJobFinished(runId: string) {
  const run = await getRun(runId);
  if (!run || run.state !== "running") return;

  const counts = await getRunFailureCounts(runId);
  const breaker = shouldTripBreaker(
    Number(run.actualCostUsd),
    Number(run.costCapUsd),
    counts.succeeded,
    counts.deadLettered,
  );
  if (breaker.trip) {
    await pauseRun(runId);
    await appendRunEvent({
      runId,
      level: "warn",
      eventType: "circuit_breaker_paused",
      message: `Run paused by circuit breaker (${breaker.reason}): failure rate ${(
        computeFailureRate(counts.succeeded, counts.deadLettered) * 100
      ).toFixed(1)}%, cost $${run.actualCostUsd}/$${run.costCapUsd}`,
    });
    return;
  }

  if (await isRunFinished(runId)) {
    await completeRun(runId);
    await appendRunEvent({
      runId,
      level: "info",
      eventType: "run_completed",
      message: `Run completed: ${counts.succeeded} succeeded, ${counts.deadLettered} dead-lettered`,
    });
  }
}

async function processJob(job: ClaimedJob) {
  const injection = await getFailureInjection(job.runId);
  const injected = injection && Math.random() < injection.rate;

  if (injected) {
    await handleFailure(job, injection.errorType, `injected ${injection.errorType} (debug failure injection)`);
    return;
  }

  const provider = listRegisteredProviders().find((p) => p.id === job.providerId);
  if (!provider) {
    await handleFailure(job, "unsupported_mode", `no adapter registered for provider ${job.providerId}`);
    return;
  }

  try {
    const result = await provider.generate({
      promptText: job.resolvedText,
      mode: job.generationMode as GenerationMode,
      repIndex: job.repIndex,
    });
    await recordSuccess(job, {
      modelVersion: result.modelVersion,
      rawText: result.text,
      citations: result.citations,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
    });
  } catch (err) {
    await handleFailure(job, "server_error", err instanceof Error ? err.message : String(err));
  } finally {
    await afterJobFinished(job.runId);
  }
}

async function handleFailure(job: ClaimedJob, errorType: string, message: string) {
  const attemptCount = job.attemptCount + 1;
  const decision = decideRetry(attemptCount);
  if (decision.action === "retry") {
    await recordRetry(job.id, attemptCount, errorType, message, decision.nextAttemptDelayMs);
    await appendRunEvent({
      runId: job.runId,
      jobId: job.id,
      level: "warn",
      eventType: "job_retry",
      message: `Retry ${attemptCount}: ${errorType} — ${message}`,
    });
  } else {
    await recordDeadLetter(job.id, attemptCount, errorType, message);
    await appendRunEvent({
      runId: job.runId,
      jobId: job.id,
      level: "error",
      eventType: "job_dead_lettered",
      message: `Dead-lettered after ${attemptCount} attempts: ${errorType} — ${message}`,
    });
  }
}

const inFlight = new Map<ProviderId, Set<Promise<void>>>();

async function tick() {
  for (const provider of listRegisteredProviders()) {
    const set = inFlight.get(provider.id) ?? new Set<Promise<void>>();
    inFlight.set(provider.id, set);
    const capacity = provider.concurrency - set.size;
    if (capacity <= 0) continue;

    const claimed = (await claimJobs(provider.id, capacity)) as ClaimedJob[];
    for (const job of claimed) {
      const promise = processJob(job).finally(() => set.delete(promise));
      set.add(promise);
    }
  }
}

async function main() {
  console.log(`[worker] parallax-worker started (pid ${process.pid})`);

  const reclaimTimer = setInterval(async () => {
    const reclaimed = await reclaimStaleLocks(STALE_LOCK_MS);
    if (reclaimed.length > 0) {
      console.log(`[worker] reclaimed ${reclaimed.length} stale-locked job(s)`);
      for (const runId of new Set(reclaimed.map((r) => r.runId))) {
        await appendRunEvent({
          runId,
          level: "warn",
          eventType: "stale_lock_reclaimed",
          message: `Worker reclaimed ${reclaimed.filter((r) => r.runId === runId).length} job(s) after a worker restart`,
        });
      }
    }
  }, STALE_RECLAIM_INTERVAL_MS);

  // RN-9: a heartbeat run_events row per active run, so a hung worker is
  // visible in Debug (staleness), distinct from the reclaim mechanism
  // (which handles a *dead* worker's orphaned job locks).
  const heartbeatTimer = setInterval(async () => {
    const activeRunIds = await listActiveRunIds();
    for (const runId of activeRunIds) {
      await appendRunEvent({
        runId,
        level: "debug",
        eventType: "worker_heartbeat",
        message: `Worker alive (pid ${process.pid})`,
      });
    }
    console.log(`[worker] heartbeat ${new Date().toISOString()} — ${activeRunIds.length} active run(s)`);
  }, HEARTBEAT_MS);

  let stopped = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopped = true;
      clearInterval(reclaimTimer);
      clearInterval(heartbeatTimer);
      console.log(`[worker] ${signal} received, shutting down`);
      process.exit(0);
    });
  }

  while (!stopped) {
    runInjectionCache.clear();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
