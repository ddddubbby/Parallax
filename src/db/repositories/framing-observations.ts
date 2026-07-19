import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  estimateFramingBatchRemainingSeconds,
  type FramingObservationBatchProgress,
  type FramingObservationBatchState,
  isFramingBatchActive,
} from "@/core/framing-batch";
import { HEARTBEAT_STALE_MS } from "@/core/worker-timing";
import { db } from "../client";
import {
  auditRuns,
  brands,
  framingObservationBatches,
  framingObservations,
  responses,
  runEvents,
  serviceHeartbeats,
} from "../schema";

const WORKER_SERVICE = "parallax-worker";

export async function getActiveFramingBatch(projectId: string) {
  const [row] = await db
    .select()
    .from(framingObservationBatches)
    .where(
      and(
        eq(framingObservationBatches.projectId, projectId),
        inArray(framingObservationBatches.state, ["queued", "running", "paused"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getFramingBatch(batchId: string) {
  const [row] = await db
    .select()
    .from(framingObservationBatches)
    .where(eq(framingObservationBatches.id, batchId))
    .limit(1);
  return row ?? null;
}

export async function listActiveFramingBatchIds(): Promise<string[]> {
  const rows = await db
    .select({ id: framingObservationBatches.id })
    .from(framingObservationBatches)
    .where(inArray(framingObservationBatches.state, ["queued", "running"]));
  return rows.map((r) => r.id);
}

async function workerHeartbeatAgeMs(): Promise<number | null> {
  const [serviceBeat] = await db
    .select({ at: serviceHeartbeats.lastBeatAt })
    .from(serviceHeartbeats)
    .where(eq(serviceHeartbeats.service, WORKER_SERVICE))
    .orderBy(sql`${serviceHeartbeats.lastBeatAt} desc`)
    .limit(1);
  const [runBeat] = await db
    .select({ at: runEvents.createdAt })
    .from(runEvents)
    .where(eq(runEvents.eventType, "worker_heartbeat"))
    .orderBy(sql`${runEvents.createdAt} desc`)
    .limit(1);
  const times = [serviceBeat?.at, runBeat?.at]
    .filter((t): t is Date => t instanceof Date)
    .map((t) => t.getTime());
  if (times.length === 0) return null;
  return Date.now() - Math.max(...times);
}

export async function getFramingBatchProgress(
  batchId: string,
): Promise<FramingObservationBatchProgress | null> {
  const batch = await getFramingBatch(batchId);
  if (!batch) return null;
  const heartbeatAgeMs = await workerHeartbeatAgeMs();
  const needsWorker = batch.state === "queued" || batch.state === "running";
  const workerOffline =
    needsWorker && (heartbeatAgeMs === null || heartbeatAgeMs > HEARTBEAT_STALE_MS);
  const approxRemainingSeconds = estimateFramingBatchRemainingSeconds({
    state: batch.state,
    workerOffline,
    processedCount: batch.processedCount,
    totalCount: batch.totalCount,
    startedAt: batch.startedAt,
  });
  return {
    batchId: batch.id,
    projectId: batch.projectId,
    state: batch.state as FramingObservationBatchState,
    totalCount: batch.totalCount,
    processedCount: batch.processedCount,
    validCount: batch.validCount,
    failedCount: batch.failedCount,
    costUsd: Number(batch.costUsd),
    approxRemainingSeconds,
    pausedReason: batch.pausedReason,
    error: batch.error,
    workerOffline,
    startedAt: batch.startedAt?.toISOString() ?? null,
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    updatedAt: batch.updatedAt.toISOString(),
  };
}

export async function getActiveFramingBatchProgress(
  projectId: string,
): Promise<FramingObservationBatchProgress | null> {
  const active = await getActiveFramingBatch(projectId);
  if (!active) return null;
  return getFramingBatchProgress(active.id);
}

/**
 * Atomically create a batch + queued observation rows. Rejects when an active
 * batch already exists for the project (unique partial index backstop).
 */
export async function enqueueFramingObservationBatch(input: {
  projectId: string;
  items: Array<{ responseId: string; version: number; runMode: string }>;
}): Promise<{ batchId: string; totalCount: number }> {
  if (input.items.length === 0) {
    throw new Error("No responses to enqueue for framing extraction");
  }
  const existing = await getActiveFramingBatch(input.projectId);
  if (existing) {
    throw new Error(
      "A framing extraction batch is already in progress for this project — wait for it to finish or resume it",
    );
  }

  try {
    return await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(framingObservationBatches)
        .values({
          projectId: input.projectId,
          state: "queued",
          totalCount: input.items.length,
        })
        .returning({ id: framingObservationBatches.id });

      for (const item of input.items) {
        await tx.insert(framingObservations).values({
          responseId: item.responseId,
          version: item.version,
          state: "queued",
          batchId: batch.id,
          observationsJson: [],
          vectorsJson: [],
        });
      }
      return { batchId: batch.id, totalCount: input.items.length };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("framing_observation_batches_project_active_uq")) {
      throw new Error(
        "A framing extraction batch is already in progress for this project — wait for it to finish or resume it",
      );
    }
    throw err;
  }
}

export interface ClaimedFramingObservation {
  id: string;
  batchId: string;
  responseId: string;
  version: number;
  rawText: string;
  runMode: string;
  projectId: string;
  brandName: string;
  lockedBy: string;
}

/** Claim up to `limit` queued observation rows with FOR UPDATE SKIP LOCKED. */
export async function claimFramingObservations(
  limit: number,
  lockedBy: string,
): Promise<ClaimedFramingObservation[]> {
  if (limit <= 0) return [];
  return db.transaction(async (tx) => {
    const eligible = await tx.execute<{
      id: string;
      batch_id: string;
      response_id: string;
      version: number;
      raw_text: string;
      run_mode: string;
      project_id: string;
      brand_name: string;
    }>(sql`
      select
        o.id,
        o.batch_id,
        o.response_id,
        o.version,
        r.raw_text,
        ar.run_mode,
        b.project_id,
        br.name as brand_name
      from ${framingObservations} o
      join ${framingObservationBatches} b on b.id = o.batch_id
      join ${responses} r on r.id = o.response_id
      join ${auditRuns} ar on ar.id = r.run_id
      join ${brands} br on br.project_id = b.project_id and br.role = 'client'
      where o.state = 'queued'
        and b.state in ('queued', 'running')
      order by o.created_at asc
      limit ${limit}
      for update of o skip locked
    `);
    const rows = eligible.rows;
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const now = new Date();
    await tx
      .update(framingObservations)
      .set({ state: "running", lockedAt: now, lockedBy, updatedAt: now })
      .where(inArray(framingObservations.id, ids));

    const batchIds = [...new Set(rows.map((r) => r.batch_id))];
    await tx
      .update(framingObservationBatches)
      .set({
        state: "running",
        startedAt: sql`coalesce(${framingObservationBatches.startedAt}, now())`,
        updatedAt: now,
      })
      .where(
        and(
          inArray(framingObservationBatches.id, batchIds),
          inArray(framingObservationBatches.state, ["queued", "running"]),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      batchId: r.batch_id,
      responseId: r.response_id,
      version: r.version,
      rawText: r.raw_text,
      runMode: r.run_mode,
      projectId: r.project_id,
      brandName: r.brand_name,
      lockedBy,
    }));
  });
}

/** Requeue framing observations stuck in running past the stale-lock window. */
export async function reclaimStaleFramingLocks(staleMs: number) {
  const threshold = new Date(Date.now() - staleMs);
  return db
    .update(framingObservations)
    .set({ state: "queued", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(
      and(eq(framingObservations.state, "running"), lt(framingObservations.lockedAt, threshold)),
    )
    .returning({
      id: framingObservations.id,
      batchId: framingObservations.batchId,
    });
}

/** Touch locked_at so a long generation+embedding pipeline is not reclaimed mid-flight. */
export async function renewFramingObservationLease(observationId: string, lockedBy: string) {
  const updated = await db
    .update(framingObservations)
    .set({ lockedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(framingObservations.id, observationId),
        eq(framingObservations.state, "running"),
        eq(framingObservations.lockedBy, lockedBy),
      ),
    )
    .returning({ id: framingObservations.id });
  return updated.length;
}

export async function completeFramingObservation(input: {
  observationId: string;
  batchId: string;
  /** Claim owner — completion is no-op if another worker reclaimed the lease. */
  lockedBy: string;
  state: "valid" | "failed";
  observationsJson: unknown;
  vectorsJson: unknown;
  model: string | null;
  embeddingModel: string | null;
  llmCostUsd: number;
  embeddingCostUsd: number;
  tokensIn: number;
  tokensOut: number;
  error: string | null;
}) {
  const cost = input.llmCostUsd + input.embeddingCostUsd;
  await db.transaction(async (tx) => {
    const locked = await tx.execute<{ state: string; locked_by: string | null }>(sql`
      select state::text as state, locked_by
      from ${framingObservations}
      where id = ${input.observationId}
      for update
    `);
    const row = locked.rows[0];
    // Fence: only the claim owner may finalize. Prevents double-bill after reclaim.
    if (!row || row.state !== "running" || row.locked_by !== input.lockedBy) return;

    await tx
      .update(framingObservations)
      .set({
        state: input.state,
        observationsJson: input.observationsJson,
        vectorsJson: input.vectorsJson,
        model: input.model,
        embeddingModel: input.embeddingModel,
        llmCostUsd: input.llmCostUsd.toFixed(6),
        embeddingCostUsd: input.embeddingCostUsd.toFixed(6),
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        error: input.error,
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(framingObservations.id, input.observationId),
          eq(framingObservations.lockedBy, input.lockedBy),
          eq(framingObservations.state, "running"),
        ),
      );

    await tx
      .update(framingObservationBatches)
      .set({
        processedCount: sql`${framingObservationBatches.processedCount} + 1`,
        validCount:
          input.state === "valid"
            ? sql`${framingObservationBatches.validCount} + 1`
            : framingObservationBatches.validCount,
        failedCount:
          input.state === "failed"
            ? sql`${framingObservationBatches.failedCount} + 1`
            : framingObservationBatches.failedCount,
        costUsd: sql`${framingObservationBatches.costUsd} + ${cost}`,
        updatedAt: new Date(),
      })
      .where(eq(framingObservationBatches.id, input.batchId));
  });
}

export async function pauseFramingBatch(batchId: string, reason: string) {
  const now = new Date();
  await db.transaction(async (tx) => {
    // Release claimed-but-unfinished items so Resume can reclaim them.
    await tx
      .update(framingObservations)
      .set({ state: "queued", lockedAt: null, lockedBy: null, updatedAt: now })
      .where(
        and(
          eq(framingObservations.batchId, batchId),
          eq(framingObservations.state, "running"),
        ),
      );
    await tx
      .update(framingObservationBatches)
      .set({
        state: "paused",
        pausedReason: reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(framingObservationBatches.id, batchId),
          inArray(framingObservationBatches.state, ["queued", "running", "paused"]),
        ),
      );
  });
}

export async function resumeFramingBatch(batchId: string) {
  const [updated] = await db
    .update(framingObservationBatches)
    .set({
      state: "queued",
      pausedReason: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(framingObservationBatches.id, batchId),
        eq(framingObservationBatches.state, "paused"),
      ),
    )
    .returning({ id: framingObservationBatches.id });
  if (!updated) {
    throw new Error("Only a paused framing batch can be resumed");
  }
  return updated.id;
}

/**
 * Finalize a batch when no queued/running items remain.
 * Returns the terminal state, or null if work remains / batch not active.
 */
export async function maybeFinalizeFramingBatch(
  batchId: string,
): Promise<FramingObservationBatchState | null> {
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(framingObservationBatches)
      .where(eq(framingObservationBatches.id, batchId))
      .for("update");
    if (!batch || !isFramingBatchActive(batch.state) || batch.state === "paused") {
      return null;
    }

    const [{ pending }] = await tx
      .select({
        pending: sql<number>`count(*)::int`,
      })
      .from(framingObservations)
      .where(
        and(
          eq(framingObservations.batchId, batchId),
          inArray(framingObservations.state, ["queued", "running"]),
        ),
      );
    if (pending > 0) return null;

    let terminal: FramingObservationBatchState;
    if (batch.processedCount === 0) {
      terminal = "failed";
    } else if (batch.failedCount === 0) {
      terminal = "completed";
    } else if (batch.validCount === 0) {
      terminal = "failed";
    } else {
      terminal = "partial";
    }

    await tx
      .update(framingObservationBatches)
      .set({
        state: terminal,
        finishedAt: new Date(),
        updatedAt: new Date(),
        error:
          terminal === "failed"
            ? batch.error ?? "Framing extraction failed for all responses"
            : batch.error,
      })
      .where(eq(framingObservationBatches.id, batchId));
    return terminal;
  });
}

export async function releaseFramingObservationClaim(
  observationId: string,
  lockedBy?: string,
) {
  await db
    .update(framingObservations)
    .set({ state: "queued", lockedAt: null, lockedBy: null, updatedAt: new Date() })
    .where(
      and(
        eq(framingObservations.id, observationId),
        eq(framingObservations.state, "running"),
        ...(lockedBy ? [eq(framingObservations.lockedBy, lockedBy)] : []),
      ),
    );
}
