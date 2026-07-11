import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import {
  findUnsupportedEngineModePairs,
  isProviderAllowedForRunMode,
  isProviderId,
  isRunMode,
  type EngineModePair,
  type GenerationMode,
  validateDebugFailureInjection,
} from "@/core/runner";
import { embeddingProviderId, extractionProviderId } from "@/modules/runner/provider-ids";
import { isWorkerLikelyOffline } from "@/core/worker-timing";
import { db } from "../client";
import {
  auditRuns,
  extractions,
  jobs,
  matrixVersions,
  projects,
  resonanceStudies,
  promptCells,
  responses,
  runEvents,
} from "../schema";

/**
 * Test-only chaos config (D-027, extended by D-029): `generation` corrupts
 * the worker's job processing (transport-level errors); `extraction`
 * corrupts extraction validation (SM-2/SM-3). Independently controllable.
 */
export interface DebugFailureInjection {
  generation?: { rate: number; errorType: string };
  extraction?: { invalidRate: number };
}

export interface CreateRunInput {
  projectId: string;
  matrixVersionId: string;
  runMode: "mock" | "live_validation" | "live_audit";
  repetitions: number;
  providers: string[];
  modes: ("grounded" | "ungrounded")[];
  costCapUsd: number;
  debugFailureInjection?: DebugFailureInjection | null;
}

/** Provider capability lookup, so unsupported-mode jobs are skipped at planning (spec's `queued -> skipped`). */
export interface ProviderCapability {
  id: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
}

export class JobNoLongerRunningError extends Error {
  constructor(jobId: string, readonly state: string | null) {
    super(`Job ${jobId} is no longer running; late provider result ignored`);
    this.name = "JobNoLongerRunningError";
  }
}

function supportsMode(cap: ProviderCapability, mode: "grounded" | "ungrounded"): boolean {
  return mode === "grounded" ? cap.supportsGrounded : cap.supportsUngrounded;
}

function validateCreateRunInput(input: CreateRunInput): string | null {
  if (!isRunMode(input.runMode)) return `Unknown run mode: ${String(input.runMode)}`;
  if (!Array.isArray(input.providers) || input.providers.length === 0) return "Select at least one provider";
  if (!Array.isArray(input.modes) || input.modes.length === 0) return "Select at least one generation mode";
  if (!Number.isInteger(input.repetitions) || input.repetitions < 1 || input.repetitions > 5) {
    return "Repetitions must be an integer from 1 to 5";
  }
  if (!Number.isFinite(input.costCapUsd) || input.costCapUsd < 0) {
    return "Run dollar cap must be a finite non-negative number";
  }
  const unknownProviders = input.providers.filter((providerId) => !isProviderId(providerId));
  if (unknownProviders.length > 0) return `Unknown provider selection: ${unknownProviders.join(", ")}`;
  const validModes = new Set<GenerationMode>(["grounded", "ungrounded"]);
  const unknownModes = input.modes.filter((mode) => !validModes.has(mode));
  if (unknownModes.length > 0) return `Unknown generation mode selection: ${unknownModes.join(", ")}`;
  if (new Set(input.providers).size !== input.providers.length) return "Provider selections must be unique";
  if (new Set(input.modes).size !== input.modes.length) return "Generation mode selections must be unique";
  const disallowed = input.providers.filter((providerId) => !isProviderAllowedForRunMode(input.runMode, providerId));
  if (disallowed.length > 0) {
    return input.runMode === "mock"
      ? `A mock run can only use the mock provider — ${disallowed.join(", ")} would spend real money under a MOCK label (C-9)`
      : `A live run cannot include the mock provider — fixture output must never mix into live aggregates (C-9)`;
  }
  if (input.runMode === "live_audit" && input.repetitions !== 5) {
    return "Audit-grade runs are locked to k=5 repetitions (C-1)";
  }
  if (input.runMode !== "mock" && input.debugFailureInjection) {
    return "Failure injection is a mock-run test tool (D-027) — not available on runs that spend real money";
  }
  return validateDebugFailureInjection(input.debugFailureInjection);
}

/** RN-1/RN-3: create the run and every job row (queued, or skipped per PV-5/unsupported-mode) in one transaction. */
export async function createRun(
  input: CreateRunInput,
  capabilities: ProviderCapability[],
  plannedCalls: number,
) {
  const inputError = validateCreateRunInput(input);
  if (inputError) throw new Error(inputError);

  const [version] = await db
    .select({
      id: matrixVersions.id,
      projectId: matrixVersions.projectId,
      kind: matrixVersions.kind,
      state: matrixVersions.state,
    })
    .from(matrixVersions)
    .where(eq(matrixVersions.id, input.matrixVersionId));
  if (!version || version.projectId !== input.projectId) {
    throw new Error("Matrix version not found for this project");
  }
  if (version.state !== "approved") {
    throw new Error("Runs require an approved matrix version");
  }
  // D-080 (supersedes D-067): >=1 providers allowed for resonance — each is
  // its own synthetic population (metrics.ts scores them separately, never
  // pooled) — but exactly one generation mode (no mode dimension in scopes).
  if (version.kind === "resonance" && input.modes.length !== 1) {
    throw new Error("A Resonance run must select exactly one generation mode (D-080)");
  }

  const cells = await db
    .select({ id: promptCells.id })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, input.matrixVersionId));

  // PV-5 backstop (the action validates too, but scripts call this repo
  // directly): a run whose every job would be skipped never has a job
  // finish, so afterJobFinished never runs and the run sits in 'queued'
  // forever. Reject it here rather than creating an unfinishable run.
  if (cells.length === 0) {
    throw new Error("Matrix version has no cells — cannot create a run");
  }
  if (cells.length > MAX_CELLS_PER_RUN) {
    throw new Error(`Matrix version exceeds the ${MAX_CELLS_PER_RUN}-cell run cap (C-1)`);
  }
  const unsupportedPairs = findUnsupportedEngineModePairs(input.providers, input.modes, capabilities);
  if (unsupportedPairs.length > 0) {
    throw new Error(
      `Unsupported provider/mode selection (C-10/PV-5): ${unsupportedPairs.map((pair) => `${pair.providerId}+${pair.mode}`).join(", ")}`,
    );
  }

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(auditRuns)
      .values({
        projectId: input.projectId,
        matrixVersionId: input.matrixVersionId,
        runMode: input.runMode,
        state: "queued",
        repetitions: input.repetitions,
        selectedProvidersJson: input.providers,
        selectedModesJson: input.modes,
        plannedCalls,
        costCapUsd: String(input.costCapUsd),
        debugFailureInjectionJson: input.debugFailureInjection ?? null,
      })
      .returning({ id: auditRuns.id });

    const pairs: EngineModePair[] = input.providers.flatMap((providerId) =>
      input.modes.map((mode) => ({ providerId, mode })),
    );
    for (const cell of cells) {
      for (const { providerId, mode } of pairs) {
        const cap = capabilities.find((c) => c.id === providerId);
        const skipped = !cap || !supportsMode(cap, mode);
        for (let rep = 0; rep < input.repetitions; rep++) {
          await tx.insert(jobs).values({
            runId: run.id,
            cellId: cell.id,
            providerId: providerId as (typeof jobs.$inferInsert)["providerId"],
            generationMode: mode,
            repIndex: rep,
            state: skipped ? "skipped" : "queued",
            lastErrorType: skipped ? "unsupported_mode" : null,
          });
        }
      }
    }
    return run;
  });
}

export async function getRun(runId: string) {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId));
  return run ?? null;
}

/**
 * Runs for a project's index page, newest first, each with total and
 * succeeded job counts (one grouped query, no N+1). Powers the runs list
 * that is the only navigation path back to an in-progress run's page.
 */
export async function listRunsWithProgress(projectId: string) {
  // M32 / D-088: list rows carry matrix version, providers, modes, and study
  // name so the operator can identify a run without opening it. Short run ids
  // remain secondary metadata on the row.
  return db
    .select({
      id: auditRuns.id,
      runMode: auditRuns.runMode,
      state: auditRuns.state,
      createdAt: auditRuns.createdAt,
      selectedProvidersJson: auditRuns.selectedProvidersJson,
      selectedModesJson: auditRuns.selectedModesJson,
      matrixKind: matrixVersions.kind,
      matrixVersion: matrixVersions.version,
      resonanceStudyId: matrixVersions.resonanceStudyId,
      studyName: resonanceStudies.name,
      total: sql<number>`count(${jobs.id})::int`,
      succeeded: sql<number>`count(${jobs.id}) filter (where ${jobs.state} = 'succeeded')::int`,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .leftJoin(resonanceStudies, eq(resonanceStudies.id, matrixVersions.resonanceStudyId))
    .leftJoin(jobs, eq(jobs.runId, auditRuns.id))
    .where(eq(auditRuns.projectId, projectId))
    .groupBy(
      auditRuns.id,
      matrixVersions.kind,
      matrixVersions.version,
      matrixVersions.resonanceStudyId,
      resonanceStudies.name,
    )
    .orderBy(desc(auditRuns.createdAt));
}

export async function getRunProgress(runId: string) {
  const rows = await db
    .select({ state: jobs.state, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(eq(jobs.runId, runId))
    .groupBy(jobs.state);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = row.n;
  return counts;
}

export async function listRunEvents(runId: string, limit = 100) {
  return db
    .select()
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(desc(runEvents.createdAt))
    .limit(limit);
}

export async function appendRunEvent(input: {
  runId: string;
  jobId?: string | null;
  level: "debug" | "info" | "warn" | "error";
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(runEvents).values({
    runId: input.runId,
    jobId: input.jobId ?? null,
    level: input.level,
    eventType: input.eventType,
    message: input.message,
    metadataJson: input.metadata ?? {},
  });
}

export async function hasRunEvent(runId: string, eventType: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), eq(runEvents.eventType, eventType)))
    .limit(1);
  return (row?.n ?? 0) > 0;
}

/**
 * RN-5: claim up to `limit` queued jobs for a provider using
 * FOR UPDATE SKIP LOCKED, restricted to runs the worker should be
 * processing (queued or running — never draft/paused/cancelled/completed).
 * Transitions the run queued -> running on its first claimed job.
 */
export async function claimJobs(providerId: string, limit: number) {
  if (limit <= 0) return [];
  return db.transaction(async (tx) => {
    const eligible = await tx.execute<{ id: string; run_id: string }>(sql`
      select j.id, j.run_id
      from ${jobs} j
      join ${auditRuns} r on r.id = j.run_id
      where j.provider_id = ${providerId}
        and j.state = 'queued'
        and (j.next_attempt_at is null or j.next_attempt_at <= now())
        and r.state in ('queued', 'running')
      order by j.created_at asc
      limit ${limit}
      for update of j skip locked
    `);
    const ids = eligible.rows.map((r) => r.id);
    if (ids.length === 0) return [];

    await tx
      .update(jobs)
      .set({ state: "running", lockedAt: new Date(), updatedAt: new Date() })
      .where(inArray(jobs.id, ids));

    const runIds = [...new Set(eligible.rows.map((r) => r.run_id))];
    await tx
      .update(auditRuns)
      .set({ state: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(auditRuns.id, runIds), eq(auditRuns.state, "queued")));

    return tx
      .select({
        id: jobs.id,
        runId: jobs.runId,
        cellId: jobs.cellId,
        providerId: jobs.providerId,
        generationMode: jobs.generationMode,
        repIndex: jobs.repIndex,
        attemptCount: jobs.attemptCount,
        resolvedText: promptCells.resolvedText,
      })
      .from(jobs)
      .innerJoin(promptCells, eq(promptCells.id, jobs.cellId))
      .where(inArray(jobs.id, ids));
  });
}

/** RN-4: jobs stuck 'running' past the staleness window (dead worker) are requeued without incrementing attempts. */
export async function reclaimStaleLocks(staleMs: number) {
  const threshold = new Date(Date.now() - staleMs);
  const reclaimed = await db
    .update(jobs)
    .set({ state: "queued", lockedAt: null, updatedAt: new Date() })
    .where(and(eq(jobs.state, "running"), lt(jobs.lockedAt, threshold)))
    .returning({ id: jobs.id, runId: jobs.runId });
  return reclaimed;
}

/** Immutable response insert + job succeeded + run cost update, atomically (C-3, D-011). */
export async function recordSuccess(
  job: { id: string; runId: string; cellId: string; providerId: string; generationMode: string },
  result: {
    modelVersion: string;
    rawText: string;
    citations: unknown[];
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    latencyMs: number;
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ state: string }>(sql`
      select state
      from ${jobs}
      where id = ${job.id}
      for update
    `);
    const row = locked.rows[0];
    if (!row || row.state !== "running") {
      throw new JobNoLongerRunningError(job.id, row?.state ?? null);
    }

    const [response] = await tx
      .insert(responses)
      .values({
        jobId: job.id,
        runId: job.runId,
        cellId: job.cellId,
        providerId: job.providerId as (typeof responses.$inferInsert)["providerId"],
        generationMode: job.generationMode as (typeof responses.$inferInsert)["generationMode"],
        modelVersion: result.modelVersion,
        rawText: result.rawText,
        citationsJson: result.citations,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: String(result.costUsd),
        latencyMs: result.latencyMs,
      })
      .returning({ id: responses.id });
    await tx
      .update(jobs)
      .set({ state: "succeeded", updatedAt: new Date() })
      .where(eq(jobs.id, job.id));
    await tx
      .update(auditRuns)
      .set({
        actualCostUsd: sql`${auditRuns.actualCostUsd} + ${result.costUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(auditRuns.id, job.runId));
    return response.id;
  });
}

/**
 * C-2/D-011: if a live provider call returns after the operator cancelled
 * the run, the job must stay cancelled and must not feed extraction/metrics.
 * The paid call still happened, so store the raw response as immutable
 * evidence and count its cost in the same generation-spend ledger used by
 * daily budgets. The unique job_id keeps this idempotent under duplicate
 * late completions.
 */
export async function recordCancelledProviderResult(
  job: { id: string; runId: string; cellId: string; providerId: string; generationMode: string },
  result: {
    modelVersion: string;
    rawText: string;
    citations: unknown[];
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    latencyMs: number;
  },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ state: string }>(sql`
      select state
      from ${jobs}
      where id = ${job.id}
      for update
    `);
    const row = locked.rows[0];
    if (!row || row.state !== "cancelled") return null;

    const inserted = await tx
      .insert(responses)
      .values({
        jobId: job.id,
        runId: job.runId,
        cellId: job.cellId,
        providerId: job.providerId as (typeof responses.$inferInsert)["providerId"],
        generationMode: job.generationMode as (typeof responses.$inferInsert)["generationMode"],
        modelVersion: result.modelVersion,
        rawText: result.rawText,
        citationsJson: result.citations,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: String(result.costUsd),
        latencyMs: result.latencyMs,
      })
      .onConflictDoNothing()
      .returning({ id: responses.id });
    const response = inserted[0];
    if (!response) return null;

    await tx
      .update(auditRuns)
      .set({
        actualCostUsd: sql`${auditRuns.actualCostUsd} + ${result.costUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(auditRuns.id, job.runId));
    return response.id;
  });
}

// Both failure recorders are guarded to `state = 'running'`: reclaim-based
// claiming is at-least-once, so a job can be double-processed after an
// over-eager stale-lock reclaim. The duplicate invocation's recordSuccess
// hits the unique job_id and throws — the resulting failure handling must
// never downgrade the job the first invocation already marked succeeded.
export async function recordRetry(
  jobId: string,
  attemptCount: number,
  errorType: string,
  errorMessage: string,
  nextAttemptDelayMs: number,
) {
  await db
    .update(jobs)
    .set({
      state: "queued",
      attemptCount,
      lastErrorType: errorType as (typeof jobs.$inferInsert)["lastErrorType"],
      lastErrorMessage: errorMessage,
      nextAttemptAt: new Date(Date.now() + nextAttemptDelayMs),
      lockedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.state, "running")));
}

export async function recordDeadLetter(
  jobId: string,
  attemptCount: number,
  errorType: string,
  errorMessage: string,
) {
  await db
    .update(jobs)
    .set({
      state: "dead_lettered",
      attemptCount,
      lastErrorType: errorType as (typeof jobs.$inferInsert)["lastErrorType"],
      lastErrorMessage: errorMessage,
      updatedAt: new Date(),
    })
    .where(and(eq(jobs.id, jobId), eq(jobs.state, "running")));
}

export async function requeueJob(runId: string, jobId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({ state: auditRuns.state })
      .from(auditRuns)
      .where(and(eq(auditRuns.id, runId), inArray(auditRuns.state, ["queued", "running", "paused"])))
      .for("update");
    if (!run) return 0;

    const updated = await tx
      .update(jobs)
      .set({
        state: "queued",
        attemptCount: 0,
        lastErrorType: null,
        lastErrorMessage: null,
        nextAttemptAt: null,
        lockedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.runId, runId), inArray(jobs.state, ["dead_lettered", "retryable_failed"])))
      .returning({ id: jobs.id });

    return updated.length;
  });
}

/** True once no queued/running jobs remain for the run. */
export async function isRunFinished(runId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.runId, runId), inArray(jobs.state, ["queued", "running"])));
  return (row?.n ?? 0) === 0;
}

export async function completeRun(runId: string) {
  await db
    .update(auditRuns)
    .set({ state: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(auditRuns.id, runId), eq(auditRuns.state, "running")));
}

export async function pauseRun(runId: string) {
  const updated = await db
    .update(auditRuns)
    .set({ state: "paused", updatedAt: new Date() })
    .where(and(eq(auditRuns.id, runId), inArray(auditRuns.state, ["queued", "running"])))
    .returning({ id: auditRuns.id });
  return updated.length;
}

/**
 * Environment/configuration faults are not provider failures and should not
 * burn job attempts. Release the currently claimed job back to queued while
 * atomically pausing the run so an operator can repair config, then resume.
 */
export async function pauseRunForWorkerConfigError(
  runId: string,
  jobId: string,
  errorType: string,
  errorMessage: string,
) {
  return db.transaction(async (tx) => {
    const released = await tx
      .update(jobs)
      .set({
        state: "queued",
        lockedAt: null,
        lastErrorType: errorType as (typeof jobs.$inferInsert)["lastErrorType"],
        lastErrorMessage: errorMessage,
        nextAttemptAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.runId, runId), eq(jobs.state, "running")))
      .returning({ id: jobs.id });

    const paused = await tx
      .update(auditRuns)
      .set({ state: "paused", updatedAt: new Date() })
      .where(and(eq(auditRuns.id, runId), inArray(auditRuns.state, ["queued", "running"])))
      .returning({ id: auditRuns.id });

    return { released: released.length, paused: paused.length };
  });
}

/**
 * C-2 worker-side pre-spend guard: if a queued/resumed run is already over
 * its run cap or provider daily budget before a provider call starts, release
 * the claimed job and pause the run atomically. This prevents another paid
 * call after a cap/budget condition that was already true before the claim.
 */
export async function pauseRunBeforeProviderSpend(
  runId: string,
  jobId: string,
  errorMessage: string,
) {
  return db.transaction(async (tx) => {
    const released = await tx
      .update(jobs)
      .set({
        state: "queued",
        lockedAt: null,
        lastErrorType: "server_error",
        lastErrorMessage: errorMessage,
        nextAttemptAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.id, jobId), eq(jobs.runId, runId), eq(jobs.state, "running")))
      .returning({ id: jobs.id });

    const paused = await tx
      .update(auditRuns)
      .set({ state: "paused", updatedAt: new Date() })
      .where(and(eq(auditRuns.id, runId), inArray(auditRuns.state, ["queued", "running"])))
      .returning({ id: auditRuns.id });

    return { released: released.length, paused: paused.length };
  });
}

export async function resumeRun(runId: string) {
  const updated = await db
    .update(auditRuns)
    .set({ state: "queued", updatedAt: new Date() })
    .where(and(eq(auditRuns.id, runId), eq(auditRuns.state, "paused")))
    .returning({ id: auditRuns.id });
  return updated.length;
}

export async function cancelRun(runId: string) {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(auditRuns)
      .set({ state: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(auditRuns.id, runId),
          inArray(auditRuns.state, ["queued", "running", "paused"]),
        ),
      )
      .returning({ id: auditRuns.id });
    if (updated.length === 0) return 0;
    await tx
      .update(jobs)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(and(eq(jobs.runId, runId), inArray(jobs.state, ["queued", "running", "retryable_failed"])));
    return updated.length;
  });
}

export async function getRunFailureCounts(runId: string) {
  const [row] = await db
    .select({
      succeeded: sql<number>`count(*) filter (where ${jobs.state} = 'succeeded')::int`,
      deadLettered: sql<number>`count(*) filter (where ${jobs.state} = 'dead_lettered')::int`,
      cancelled: sql<number>`count(*) filter (where ${jobs.state} = 'cancelled')::int`,
    })
    .from(jobs)
    .where(eq(jobs.runId, runId));
  return row ?? { succeeded: 0, deadLettered: 0, cancelled: 0 };
}

/**
 * D-042: RN-7's failure-rate breaker evaluated over jobs whose provider has
 * NOT been marked down in this run. A downed provider's dead-letters are
 * already contained by skipRemainingJobsForProvider — counting them again
 * would pause the whole run and brick the providers that still work.
 * Display/partial derivation keeps using the raw getRunFailureCounts.
 */
export async function getBreakerCounts(runId: string) {
  const [row] = await db
    .select({
      succeeded: sql<number>`count(*) filter (where ${jobs.state} = 'succeeded')::int`,
      deadLettered: sql<number>`count(*) filter (where ${jobs.state} = 'dead_lettered')::int`,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.runId, runId),
        sql`${jobs.providerId} not in (
          select distinct provider_id from ${jobs}
          where run_id = ${runId} and state = 'skipped' and last_error_type = 'provider_down'
        )`,
      ),
    );
  return row ?? { succeeded: 0, deadLettered: 0 };
}

/**
 * D-042: per-provider outcomes within one run, the isProviderDown input.
 * `persistence_error` dead-letters are EXCLUDED from the tally — those are
 * DB faults after a successful provider call, not provider faults, and must
 * never contribute to marking a healthy provider down (C2).
 */
export async function getProviderOutcomeCounts(runId: string, providerId: string) {
  const [row] = await db
    .select({
      succeeded: sql<number>`count(*) filter (where ${jobs.state} = 'succeeded')::int`,
      deadLettered: sql<number>`count(*) filter (where ${jobs.state} = 'dead_lettered' and ${jobs.lastErrorType} is distinct from 'persistence_error')::int`,
    })
    .from(jobs)
    .where(and(eq(jobs.runId, runId), eq(jobs.providerId, providerId as (typeof jobs.$inferInsert)["providerId"])));
  return row ?? { succeeded: 0, deadLettered: 0 };
}

/**
 * D-042: a down provider's remaining queued jobs are skipped so the run's
 * other providers can finish and the run can complete (PARTIAL). In-flight
 * 'running' jobs are left to finish their own retry/dead-letter cycle —
 * requeued retries land back in 'queued' and are caught by the next
 * invocation (this function is idempotent).
 */
export async function skipRemainingJobsForProvider(runId: string, providerId: string): Promise<number> {
  const skipped = await db
    .update(jobs)
    .set({
      state: "skipped",
      lastErrorType: "provider_down",
      lastErrorMessage: `provider ${providerId} detected down in this run — remaining jobs skipped (D-042)`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.runId, runId),
        eq(jobs.providerId, providerId as (typeof jobs.$inferInsert)["providerId"]),
        eq(jobs.state, "queued"),
      ),
    )
    .returning({ id: jobs.id });
  return skipped.length;
}

export async function getApprovedMatrixCellCount(matrixVersionId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, matrixVersionId));
  return row?.n ?? 0;
}

export async function getRunMatrixCellCount(runId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(${promptCells.id})::int` })
    .from(auditRuns)
    .innerJoin(promptCells, eq(promptCells.matrixVersionId, auditRuns.matrixVersionId))
    .where(eq(auditRuns.id, runId));
  return row?.n ?? 0;
}

/**
 * C-1 worker-side backstop: if scripts or manual DB writes bypass matrix
 * approval/run creation and create an active run over the prompt-cell cap,
 * pause it before the worker claims and spends on any jobs. Count actual
 * prompt_cells instead of trusting matrix_versions.cell_count, which is only
 * a cached repository-maintained value.
 */
export async function pauseActiveRunsExceedingCellCap(maxCells = MAX_CELLS_PER_RUN): Promise<string[]> {
  const oversize = await db.execute<{ id: string; cell_count: number }>(sql`
    select r.id, count(pc.id)::int as cell_count
    from ${auditRuns} r
    join ${promptCells} pc on pc.matrix_version_id = r.matrix_version_id
    where r.state in ('queued', 'running')
    group by r.id
    having count(pc.id) > ${maxCells}
  `);
  const ids = oversize.rows.map((row) => row.id);
  if (ids.length === 0) return [];

  await db.transaction(async (tx) => {
    await tx
      .update(auditRuns)
      .set({ state: "paused", updatedAt: new Date() })
      .where(inArray(auditRuns.id, ids));

    for (const row of oversize.rows) {
      await tx.insert(runEvents).values({
        runId: row.id,
        level: "error",
        eventType: "cell_cap_violation",
        message: `Run paused before worker spend: ${row.cell_count} prompt cells exceeds the ${maxCells}-cell cap (C-1)`,
        metadataJson: { cellCount: row.cell_count, maxCells },
      });
    }
  });

  return ids;
}

/**
 * RN-2 honesty: cost projection estimates token counts from the actual
 * average prompt length of the version's cells, not an empty string
 * (which projected near-zero input cost for every live run).
 */
export async function getAverageCellTextLength(matrixVersionId: string): Promise<number> {
  const [row] = await db
    .select({ avgLen: sql<string>`coalesce(avg(length(${promptCells.resolvedText})), 0)` })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, matrixVersionId));
  return Math.ceil(Number(row?.avgLen ?? 0));
}

export async function getApprovedVersionForRun(projectId: string) {
  const [version] = await db
    .select()
    .from(matrixVersions)
    .where(
      and(
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(matrixVersions.state, "approved"),
      ),
    )
    .orderBy(desc(matrixVersions.version));
  return version ?? null;
}

export async function getMatrixVersionForRun(projectId: string, matrixVersionId: string) {
  const [version] = await db
    .select()
    .from(matrixVersions)
    .where(and(eq(matrixVersions.id, matrixVersionId), eq(matrixVersions.projectId, projectId)));
  return version ?? null;
}

export async function getRunMatrixKind(runId: string) {
  const [row] = await db
    .select({
      kind: matrixVersions.kind,
      projectId: auditRuns.projectId,
      resonanceStudyId: matrixVersions.resonanceStudyId,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(eq(auditRuns.id, runId));
  return row ?? null;
}

export async function getRunDetail(runId: string) {
  const run = await getRun(runId);
  if (!run) return null;
  const [progress, failureCounts, events, kind, heartbeatRow] = await Promise.all([
    getRunProgress(runId),
    getRunFailureCounts(runId),
    listRunEvents(runId, 30),
    getRunMatrixKind(runId),
    // RN-9: latest worker heartbeat across all runs — a run that needs the
    // worker but has no recent heartbeat means the worker process is down.
    db
      .select({ at: runEvents.createdAt })
      .from(runEvents)
      .where(eq(runEvents.eventType, "worker_heartbeat"))
      .orderBy(desc(runEvents.createdAt))
      .limit(1),
  ]);
  const matrixKind: "audit" | "resonance" = kind?.kind === "resonance" ? "resonance" : "audit";
  const heartbeatAgeMs = heartbeatRow[0] ? Date.now() - new Date(heartbeatRow[0].at).getTime() : null;
  return {
    run: {
      ...run,
      matrixKind,
      resonanceStudyId: kind?.resonanceStudyId ?? null,
    },
    progress,
    failureCounts,
    events,
    workerOffline: isWorkerLikelyOffline(run.state, heartbeatAgeMs),
  };
}

/** RN-9: run ids currently eligible for worker processing. */
export async function listActiveRunIds() {
  const rows = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(inArray(auditRuns.state, ["queued", "running"]));
  return rows.map((r) => r.id);
}

/**
 * C-2/D-012 per-provider daily budget, summed since UTC midnight:
 *  - generation cost = responses where this provider generated them;
 *  - audit extraction cost = attributed to the CONFIGURED EXTRACTION ENGINE
 *    (D-041), not the generation provider;
 *  - resonance SSR cost = attributed to the CONFIGURED EMBEDDING ENGINE
 *    (D-064/D-069).
 *
 * Extraction rows carry no provider column and no separate billed_at column,
 * so attribution follows the run's matrix kind and the row's updated_at. The
 * updated_at filter matters because the row is created before the paid
 * extraction/SSR call returns; a call that crosses UTC midnight must count
 * against the day the cost was recorded, not the day the pending row was
 * opened.
 */
export async function getProviderSpendToday(providerId: string): Promise<number> {
  if (!isProviderId(providerId)) {
    throw new Error(`Cannot compute spend for unknown provider id "${providerId}"`);
  }
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const pid = providerId as (typeof responses.$inferInsert)["providerId"];
  let extractionEngine: string | null = null;
  try {
    extractionEngine = extractionProviderId();
  } catch {
    // Spend reads are used by Settings and projection surfaces too; an
    // invalid extraction env must not break unrelated generation/SSR spend
    // reads. Run creation/worker budget checks validate the relevant
    // secondary provider for the matrix kind before spending.
  }
  let embeddingEngine: string | null = null;
  try {
    embeddingEngine = embeddingProviderId();
  } catch {
    // Same isolation as extractionEngine above: a bad Resonance embedding
    // env should not make audit spend unreadable.
  }

  const [genRow] = await db
    .select({ total: sql<string>`coalesce(sum(${responses.costUsd}), 0)` })
    .from(responses)
    .where(and(eq(responses.providerId, pid), gte(responses.createdAt, todayStart)));

  let extractionTotal = 0;
  if (providerId === extractionEngine) {
    const [extRow] = await db
      .select({ total: sql<string>`coalesce(sum(${extractions.costUsd}), 0)` })
      .from(extractions)
      .innerJoin(responses, eq(responses.id, extractions.responseId))
      .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
      .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
      .where(
        and(
          gte(extractions.updatedAt, todayStart),
          eq(matrixVersions.kind, "audit"),
        ),
      );
    extractionTotal = Number(extRow?.total ?? 0);
  }

  let embeddingTotal = 0;
  if (providerId === embeddingEngine) {
    const [ssrRow] = await db
      .select({ total: sql<string>`coalesce(sum(${extractions.costUsd}), 0)` })
      .from(extractions)
      .innerJoin(responses, eq(responses.id, extractions.responseId))
      .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
      .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
      .where(and(gte(extractions.updatedAt, todayStart), eq(matrixVersions.kind, "resonance")));
    embeddingTotal = Number(ssrRow?.total ?? 0);
  }

  return Number(genRow?.total ?? 0) + extractionTotal + embeddingTotal;
}

export async function getProjectStatus(projectId: string) {
  const [row] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row?.status ?? null;
}

/** Breadcrumb context: every project sub-page should say which project it belongs to. */
export async function getProjectSummary(projectId: string) {
  const [row] = await db
    .select({
      name: projects.name,
      status: projects.status,
      categoryArchetype: projects.categoryArchetype,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row ?? null;
}

/** OX-2: the booleans resolveProjectStage needs to pick a project's next action. */
export async function getProjectPipelineState(projectId: string) {
  const [statusRow, versionRow, runRows, resonanceStudyRows, resonanceRunRows] = await Promise.all([
    db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId)),
    db
      .select({ state: matrixVersions.state })
      .from(matrixVersions)
      .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.kind, "audit"))),
    db
      .select({ state: auditRuns.state })
      .from(auditRuns)
      .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
      .where(and(eq(auditRuns.projectId, projectId), eq(matrixVersions.kind, "audit"))),
    db
      .select({ state: resonanceStudies.state })
      .from(resonanceStudies)
      .where(eq(resonanceStudies.projectId, projectId)),
    db
      .select({ state: auditRuns.state })
      .from(auditRuns)
      .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
      .where(and(eq(auditRuns.projectId, projectId), eq(matrixVersions.kind, "resonance"))),
  ]);
  const versionStates = versionRow.map((v) => v.state);
  const runStates = runRows.map((r) => r.state);
  const resonanceStudyStates = resonanceStudyRows.map((s) => s.state);
  const resonanceRunStates = resonanceRunRows.map((r) => r.state);
  return {
    intakeComplete: (statusRow[0]?.status ?? null) === "active",
    hasMatrix: versionStates.length > 0,
    hasApprovedMatrix: versionStates.includes("approved"),
    hasActiveRun: runStates.some((s) => s === "queued" || s === "running"),
    hasCompletedRun: runStates.includes("completed"),
    hasApprovedResonanceStudy: resonanceStudyStates.includes("approved"),
    hasActiveResonanceRun: resonanceRunStates.some((s) => s === "queued" || s === "running"),
    hasCompletedResonanceRun: resonanceRunStates.includes("completed"),
  };
}
