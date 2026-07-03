import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import type { EngineModePair } from "@/core/runner";
import { db } from "../client";
import {
  auditRuns,
  jobs,
  matrixVersions,
  projects,
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

function supportsMode(cap: ProviderCapability, mode: "grounded" | "ungrounded"): boolean {
  return mode === "grounded" ? cap.supportsGrounded : cap.supportsUngrounded;
}

/** RN-1/RN-3: create the run and every job row (queued, or skipped per PV-5/unsupported-mode) in one transaction. */
export async function createRun(
  input: CreateRunInput,
  capabilities: ProviderCapability[],
  plannedCalls: number,
) {
  const cells = await db
    .select({ id: promptCells.id })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, input.matrixVersionId));

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

export async function listRuns(projectId: string) {
  return db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.projectId, projectId))
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
    .where(eq(jobs.id, jobId));
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
    .where(eq(jobs.id, jobId));
}

export async function requeueJob(jobId: string) {
  await db
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
    .where(and(eq(jobs.id, jobId), ne(jobs.state, "succeeded")));
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
  await db
    .update(auditRuns)
    .set({ state: "paused", updatedAt: new Date() })
    .where(and(eq(auditRuns.id, runId), inArray(auditRuns.state, ["queued", "running"])));
}

export async function resumeRun(runId: string) {
  await db
    .update(auditRuns)
    .set({ state: "queued", updatedAt: new Date() })
    .where(and(eq(auditRuns.id, runId), eq(auditRuns.state, "paused")));
}

export async function cancelRun(runId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(auditRuns)
      .set({ state: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(auditRuns.id, runId),
          inArray(auditRuns.state, ["queued", "running", "paused"]),
        ),
      );
    await tx
      .update(jobs)
      .set({ state: "cancelled", updatedAt: new Date() })
      .where(and(eq(jobs.runId, runId), inArray(jobs.state, ["queued", "running", "retryable_failed"])));
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

export async function getApprovedMatrixCellCount(matrixVersionId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, matrixVersionId));
  return row?.n ?? 0;
}

export async function getApprovedVersionForRun(projectId: string) {
  const [version] = await db
    .select()
    .from(matrixVersions)
    .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.state, "approved")));
  return version ?? null;
}

export async function getRunDetail(runId: string) {
  const run = await getRun(runId);
  if (!run) return null;
  const [progress, failureCounts, events] = await Promise.all([
    getRunProgress(runId),
    getRunFailureCounts(runId),
    listRunEvents(runId, 30),
  ]);
  return { run, progress, failureCounts, events };
}

/** RN-9: run ids currently eligible for worker processing. */
export async function listActiveRunIds() {
  const rows = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(inArray(auditRuns.state, ["queued", "running"]));
  return rows.map((r) => r.id);
}

export async function getProjectStatus(projectId: string) {
  const [row] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));
  return row?.status ?? null;
}
