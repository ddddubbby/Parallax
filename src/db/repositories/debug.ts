import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../client";
import { auditRuns, jobs, promptCells, runEvents } from "../schema";

/** RN-9: most recent worker heartbeat, so Debug can flag staleness while a run is active. */
export async function getLastHeartbeat() {
  const [row] = await db
    .select({ createdAt: runEvents.createdAt })
    .from(runEvents)
    .where(eq(runEvents.eventType, "worker_heartbeat"))
    .orderBy(desc(runEvents.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function hasActiveRun() {
  const [row] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(or(eq(auditRuns.state, "queued"), eq(auditRuns.state, "running")))
    .limit(1);
  return Boolean(row);
}

const RECENT_JOB_STATES = ["running", "retryable_failed", "dead_lettered", "skipped"] as const;

/** AD-1: recent non-terminal-success jobs across all runs, for the Debug console. */
export async function listRecentJobs(limit = 50) {
  return db
    .select({
      id: jobs.id,
      runId: jobs.runId,
      cellId: jobs.cellId,
      providerId: jobs.providerId,
      generationMode: jobs.generationMode,
      repIndex: jobs.repIndex,
      state: jobs.state,
      attemptCount: jobs.attemptCount,
      lastErrorType: jobs.lastErrorType,
      lastErrorMessage: jobs.lastErrorMessage,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(inArray(jobs.state, [...RECENT_JOB_STATES]))
    .orderBy(desc(jobs.updatedAt))
    .limit(limit);
}

/** AD-3: run_events tail across all runs. */
export async function listRecentRunEvents(limit = 100) {
  return db
    .select({
      id: runEvents.id,
      runId: runEvents.runId,
      jobId: runEvents.jobId,
      level: runEvents.level,
      eventType: runEvents.eventType,
      message: runEvents.message,
      createdAt: runEvents.createdAt,
    })
    .from(runEvents)
    .orderBy(desc(runEvents.createdAt))
    .limit(limit);
}

export async function getCellResolvedText(cellId: string) {
  const [row] = await db
    .select({ resolvedText: promptCells.resolvedText })
    .from(promptCells)
    .where(eq(promptCells.id, cellId));
  return row?.resolvedText ?? null;
}

export async function listRecentRuns(limit = 20) {
  return db.select().from(auditRuns).orderBy(desc(auditRuns.createdAt)).limit(limit);
}
