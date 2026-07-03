// Polling worker (RN-4, RN-5, RN-9): claims queued jobs per provider up to
// its concurrency limit, calls the provider, records results, and enforces
// the circuit breaker. Restart-safe — see reclaimStaleLocks.
//
// Must be the first import: loads .env.local/.env before any module whose
// top-level body reads process.env (db client, crypto KEK).
import "@/env-bootstrap";
import {
  computeFailureRate,
  decideRetry,
  isProviderAllowedForRunMode,
  type RunMode,
  shouldTripBreaker,
} from "@/core/runner";
import {
  appendRunEvent,
  claimJobs,
  completeRun,
  getBreakerCounts,
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
import { listResponsesMissingExtraction, listResponsesWithStaleExtraction } from "@/db/repositories/extraction";
import { extractResponse, reExtractResponse } from "@/modules/extraction/service";
import { extractionProviderId, findExceededDailyBudget } from "@/modules/runner/budget";
import { handleProviderDownAfterDeadLetter } from "@/modules/runner/degradation";
import { resolveRuntimeProvider } from "@/modules/runner/provider-resolver";
import { listRegisteredProviders } from "@/providers/registry";
import { ProviderCallError } from "@/providers/shared";
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
// Hard per-call deadline, passed as AbortSignal.timeout to the provider.
// Must stay comfortably under STALE_LOCK_MS: a call that outlives the
// stale-lock window gets its still-running job reclaimed and re-claimed,
// duplicating a paid call.
const PROVIDER_CALL_TIMEOUT_MS = Number(process.env.WORKER_PROVIDER_TIMEOUT_MS ?? 45_000);

interface FailureInjection {
  rate: number;
  errorType: string;
}

interface RunConfig {
  runMode: string;
  injection: FailureInjection | null;
}

const runConfigCache = new Map<string, RunConfig | null>();

// D-027, nested under `.generation` since D-029 added an independent
// `.extraction` key on the same debug_failure_injection_json column.
// runMode rides along in the same per-tick cache for the C-9 job guard.
async function getRunConfig(runId: string): Promise<RunConfig | null> {
  if (runConfigCache.has(runId)) return runConfigCache.get(runId) ?? null;
  const run = await getRun(runId);
  const injectionConfig = run?.debugFailureInjectionJson as { generation?: FailureInjection } | null;
  const config: RunConfig | null = run
    ? { runMode: run.runMode, injection: injectionConfig?.generation ?? null }
    : null;
  runConfigCache.set(runId, config);
  return config;
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

  // Completion is checked FIRST: the breaker/budget checks below exist to
  // stop FUTURE spend, but once no queued/running jobs remain there is no
  // future spend to stop. Checking them first meant a run whose final job
  // happened to cross the cost cap or daily budget got paused instead of
  // completed — with zero jobs left to ever finish it later, it was
  // stranded in 'paused' forever. A finished run always completes,
  // regardless of what its final cost/spend happened to be.
  if (await isRunFinished(runId)) {
    await completeRun(runId);
    // Raw counts here, not breaker counts — the completion record reports
    // everything that happened, including any downed provider's failures.
    const rawCounts = await getRunFailureCounts(runId);
    await appendRunEvent({
      runId,
      level: "info",
      eventType: "run_completed",
      message: `Run completed: ${rawCounts.succeeded} succeeded, ${rawCounts.deadLettered} dead-lettered`,
    });
    return;
  }

  // D-042: the failure-rate breaker evaluates only providers not marked
  // down — a downed provider's damage is already contained by skipping its
  // jobs, and counting its dead-letters here would pause the run and brick
  // the providers that still work. Cost caps use the run's real total.
  const counts = await getBreakerCounts(runId);
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

  // Live runs also spend on the extraction engine (D-041), which may not be
  // a selected generation provider — include it so its budget is guarded
  // (C-2). Mock runs pass only their mock provider, so no live budget can
  // pause them.
  const budgetProviders = [...((run.selectedProvidersJson as string[]) ?? [])];
  if (run.runMode !== "mock") budgetProviders.push(extractionProviderId());
  const budgetTrip = await findExceededDailyBudget(budgetProviders);
  if (budgetTrip) {
    await pauseRun(runId);
    await appendRunEvent({
      runId,
      level: "warn",
      eventType: "circuit_breaker_paused",
      message: `Run paused by circuit breaker (daily_budget_exceeded): ${budgetTrip.providerId} spent $${budgetTrip.spentUsd.toFixed(2)}/$${budgetTrip.budgetUsd.toFixed(2)} daily budget`,
    });
  }
}

async function processJob(job: ClaimedJob) {
  const config = await getRunConfig(job.runId);

  // C-9 guard, both directions: never spend real money under a MOCK label,
  // never mix fixture output into live aggregates. Run creation validates
  // this too, but scripts/tests insert job rows directly — dead-letter
  // immediately rather than retrying a combination that can never be valid.
  if (config && !isProviderAllowedForRunMode(config.runMode as RunMode, job.providerId)) {
    await recordDeadLetter(
      job.id,
      job.attemptCount + 1,
      "unsupported_mode",
      `provider ${job.providerId} is not allowed in a ${config.runMode} run (C-9)`,
    );
    await appendRunEvent({
      runId: job.runId,
      jobId: job.id,
      level: "error",
      eventType: "job_dead_lettered",
      message: `Dead-lettered: provider ${job.providerId} is not allowed in a ${config.runMode} run (C-9)`,
    });
    await afterJobFinished(job.runId);
    return;
  }

  const injection = config?.injection ?? null;
  const injected = injection && Math.random() < injection.rate;

  if (injected) {
    await handleFailure(job, injection.errorType, `injected ${injection.errorType} (debug failure injection)`);
    // Must run the completion check like every other failure path (the C-9
    // and catch branches do): without it, an injected dead-letter on the
    // run's final job leaves the run stuck 'running' forever.
    await afterJobFinished(job.runId);
    return;
  }

  let responseId: string | null = null;
  try {
    const provider = await resolveRuntimeProvider(job.providerId as ProviderId);
    const result = await provider.generate(
      {
        promptText: job.resolvedText,
        mode: job.generationMode as GenerationMode,
        repIndex: job.repIndex,
      },
      AbortSignal.timeout(PROVIDER_CALL_TIMEOUT_MS),
    );
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
    // Real providers fail in distinguishable ways (401/429/5xx/timeout);
    // mock never did, so this branch only matters from M8 onward.
    const errorType = err instanceof ProviderCallError ? err.errorType : "server_error";
    await handleFailure(job, errorType, err instanceof Error ? err.message : String(err));
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
    // D-042: a provider that keeps dead-lettering with zero successes is
    // down — skip its remaining jobs so the run's other providers finish.
    await handleProviderDownAfterDeadLetter(job.runId, job.providerId);
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

      // Part 2: responses whose latest extraction row exists but is torn
      // (worker died mid-pipeline, between createPendingExtraction/
      // markExtractionRetrying and the next state transition) — invisible
      // to the "no row at all" sweep above, and otherwise permanently
      // ineligible for metrics without a manual re-extract. Re-extracting
      // creates a new version (AD-2, C-3) rather than touching the stale row.
      const stale = await listResponsesWithStaleExtraction(EXTRACTION_SWEEP_AGE_MS, EXTRACTION_SWEEP_BATCH);
      if (stale.length > 0) {
        console.log(`[worker] extraction sweep: re-extracting ${stale.length} stale pending/retrying response(s)`);
      }
      for (const responseId of stale) {
        try {
          await reExtractResponse(responseId);
        } catch (err) {
          console.error(
            `[worker] extraction sweep (stale) failed for response ${responseId}:`,
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
    runConfigCache.clear();
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
