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
import { listResponsesMissingExtraction } from "@/db/repositories/extraction";
import { extractResponse } from "@/modules/extraction/service";
import { listRegisteredProviders } from "@/providers/registry";
import type { GenerationMode, ProviderId } from "@/providers/types";

const POLL_INTERVAL_MS = 300;
const HEARTBEAT_MS = 30_000;
// Test-only overrides (scripts/test-mock-e2e.ts): a genuinely crashed
// worker's stuck jobs shouldn't wait a full production-scale window to be
// proven reclaimable. Defaults are conservative for real deploys.
const STALE_LOCK_MS = Number(process.env.WORKER_STALE_LOCK_MS ?? 60_000);
const STALE_RECLAIM_INTERVAL_MS = Number(process.env.WORKER_STALE_RECLAIM_INTERVAL_MS ?? 15_000);
// Extraction reconcile sweep: backfills responses that missed their
// synchronous extraction (worker crash between response commit and
// extraction commit, an unexpected extraction throw, or responses that
// predate the extraction pipeline). Age threshold avoids racing an
// in-flight extraction that's about to commit.
const EXTRACTION_SWEEP_AGE_MS = Number(process.env.WORKER_EXTRACTION_SWEEP_AGE_MS ?? 60_000);
const EXTRACTION_SWEEP_BATCH = 25;

interface FailureInjection {
  rate: number;
  errorType: string;
}

const runInjectionCache = new Map<string, FailureInjection | null>();

// D-027, nested under `.generation` since D-029 added an independent
// `.extraction` key on the same debug_failure_injection_json column.
async function getFailureInjection(runId: string): Promise<FailureInjection | null> {
  if (runInjectionCache.has(runId)) return runInjectionCache.get(runId) ?? null;
  const run = await getRun(runId);
  const config = run?.debugFailureInjectionJson as { generation?: FailureInjection } | null;
  const injection = config?.generation ?? null;
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

  let responseId: string | null = null;
  try {
    const result = await provider.generate({
      promptText: job.resolvedText,
      mode: job.generationMode as GenerationMode,
      repIndex: job.repIndex,
    });
    responseId = await recordSuccess(job, {
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
    await afterJobFinished(job.runId);
    return;
  }

  // Extraction is a separate state machine from the job (SM-1..SM-3): the
  // job already succeeded once the response was stored, so an extraction
  // bug must never retroactively fail it. extractResponse owns its own
  // retry/dead-letter handling; a thrown error here means something
  // outside that contract broke (e.g. a corrupt fixture lookup) and is
  // logged, not retried as a job failure.
  try {
    await extractResponse(responseId);
  } catch (err) {
    await appendRunEvent({
      runId: job.runId,
      jobId: job.id,
      level: "error",
      eventType: "extraction_error",
      message: `Extraction threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
    });
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

  let sweepInFlight = false;
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

    // Extraction reconcile sweep — see EXTRACTION_SWEEP_AGE_MS above.
    if (sweepInFlight) return;
    sweepInFlight = true;
    try {
      const missing = await listResponsesMissingExtraction(
        EXTRACTION_SWEEP_AGE_MS,
        EXTRACTION_SWEEP_BATCH,
      );
      if (missing.length > 0) {
        console.log(`[worker] extraction sweep: backfilling ${missing.length} response(s)`);
      }
      for (const responseId of missing) {
        try {
          await extractResponse(responseId);
        } catch (err) {
          // Per-response isolation: one bad response must not starve the
          // rest of the batch. A unique-violation here just means the
          // synchronous path won the race — harmless.
          console.error(
            `[worker] extraction sweep failed for response ${responseId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } finally {
      sweepInFlight = false;
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
