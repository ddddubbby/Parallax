import { and, desc, eq, inArray } from "drizzle-orm";
import {
  deriveMockFramingObservations,
  buildBlindFramingPrompt,
  validateFramingObservations,
  type FramingObservation,
} from "@/core/framing-observations";
import {
  extractionProviderId,
  embeddingProviderId,
  findExceededDailyBudget,
} from "@/modules/runner/budget";
import {
  resolveEmbeddingProvider,
  resolveRuntimeProvider,
} from "@/modules/runner/provider-resolver";
import { mockEmbeddingProvider } from "@/providers/mock/embeddings";
import { db } from "@/db/client";
import {
  claimFramingObservations,
  completeFramingObservation,
  enqueueFramingObservationBatch,
  getActiveFramingBatch,
  getFramingBatchProgress,
  maybeFinalizeFramingBatch,
  pauseFramingBatch,
  reclaimStaleFramingLocks,
  releaseFramingObservationClaim,
  renewFramingObservationLease,
  resumeFramingBatch,
  type ClaimedFramingObservation,
} from "@/db/repositories/framing-observations";
import {
  auditRuns,
  brands,
  framingObservations,
  matrixVersions,
  responses,
} from "@/db/schema";

// M46/D-117: operator enqueues a persistent framing-observation batch; the
// worker claims rows with FOR UPDATE SKIP LOCKED, processes one at a time,
// rechecks C-2 before every live item, and finalizes completed/partial/failed.
// Mock responses stay $0 (C-9). Retries of failed items are new versions (C-3).

const LIVE_CALL_TIMEOUT_MS = 60_000;
/** Generation + embedding can each run up to LIVE_CALL_TIMEOUT_MS; keep lease above that. */
export const FRAMING_STALE_LOCK_MS = LIVE_CALL_TIMEOUT_MS * 2 + 30_000;
const FRAMING_CLAIM_LIMIT = 2;

export interface FramingObservationEnqueueResult {
  batchId: string;
  totalCount: number;
  skipped: number;
}

async function clientBrandName(projectId: string): Promise<string> {
  const [row] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(and(eq(brands.projectId, projectId), eq(brands.role, "client")))
    .limit(1);
  if (!row) throw new Error("Project has no client brand — complete intake first");
  return row.name;
}

/** Completed-audit responses with their run mode, newest first. */
async function listObservationCandidates(projectId: string, limit: number) {
  return db
    .select({
      id: responses.id,
      rawText: responses.rawText,
      runMode: auditRuns.runMode,
    })
    .from(responses)
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    )
    .orderBy(desc(responses.createdAt))
    .limit(limit);
}

/** Latest row per response id (any state), for skip/version decisions. */
async function latestObservationRows(responseIds: string[]) {
  if (responseIds.length === 0) return new Map<string, { state: string; version: number }>();
  const rows = await db
    .select({
      responseId: framingObservations.responseId,
      state: framingObservations.state,
      version: framingObservations.version,
    })
    .from(framingObservations)
    .where(inArray(framingObservations.responseId, responseIds));
  const latest = new Map<string, { state: string; version: number }>();
  for (const row of rows) {
    const seen = latest.get(row.responseId);
    if (!seen || row.version > seen.version) latest.set(row.responseId, row);
  }
  return latest;
}

/**
 * Atomic enqueue: create batch + queued observation versions for responses
 * whose latest observation is not already valid. Rejects duplicate active batches.
 */
export async function enqueueFramingObservations(
  projectId: string,
  limit = 60,
): Promise<FramingObservationEnqueueResult> {
  await clientBrandName(projectId); // fail early if intake incomplete
  // Reject before scanning candidates so a mid-flight batch is unambiguous.
  const active = await getActiveFramingBatch(projectId);
  if (active) {
    throw new Error(
      "A framing extraction batch is already in progress for this project — wait for it to finish or resume it",
    );
  }
  const candidates = await listObservationCandidates(projectId, limit);
  if (candidates.length === 0) {
    throw new Error("No stored responses to extract from — complete an audit run first");
  }
  const latest = await latestObservationRows(candidates.map((c) => c.id));
  const pending = candidates.filter((c) => {
    const row = latest.get(c.id);
    // Skip valid; also skip in-flight queued/running from a concurrent batch.
    return !row || (row.state !== "valid" && row.state !== "queued" && row.state !== "running");
  });
  const skipped = candidates.length - pending.length;
  if (pending.length === 0) {
    throw new Error(
      skipped > 0
        ? "All sampled responses already have framing observations"
        : "No stored responses to extract from — complete an audit run first",
    );
  }

  const { batchId, totalCount } = await enqueueFramingObservationBatch({
    projectId,
    items: pending.map((c) => ({
      responseId: c.id,
      version: (latest.get(c.id)?.version ?? 0) + 1,
      runMode: c.runMode,
    })),
  });
  return { batchId, totalCount, skipped };
}

/** Process one claimed observation; returns 'paused' when C-2 trips on a live item. */
export async function processClaimedFramingObservation(
  claimed: ClaimedFramingObservation,
): Promise<"done" | "paused"> {
  // Claim batches share one locked_at. A second row can sit behind a full
  // gen+embed of the first (~120s) and enter this function with only a thin
  // remainder of the 150s lease — enough to be reclaimed mid-generation by
  // another worker (duplicate spend). Renew ownership before any budget check
  // or provider call; abort if we already lost the lease.
  const leased = await renewFramingObservationLease(claimed.id, claimed.lockedBy);
  if (leased === 0) {
    return "done";
  }

  const isMock = claimed.runMode === "mock";

  if (!isMock) {
    const trip = await findExceededDailyBudget([
      extractionProviderId(),
      embeddingProviderId(),
    ]);
    if (trip) {
      await pauseFramingBatch(
        claimed.batchId,
        `Daily budget for ${trip.providerId} is exhausted ($${trip.spentUsd.toFixed(2)} of $${trip.budgetUsd.toFixed(2)}) — framing extraction paused (C-2)`,
      );
      // pauseFramingBatch already requeues running rows (including this one).
      return "paused";
    }
  }

  let observations: FramingObservation[] = [];
  let llmCostUsd = 0;
  let embeddingCostUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let model: string | null = null;
  let embeddingModel: string | null = null;
  let error: string | null = null;
  let vectors: number[][] = [];

  try {
    if (isMock) {
      observations = deriveMockFramingObservations(claimed.brandName, claimed.rawText);
      model = "mock-framing-extractor-v1";
    } else {
      const provider = await resolveRuntimeProvider(extractionProviderId());
      const generated = await provider.generate(
        {
          promptText: buildBlindFramingPrompt(claimed.brandName, claimed.rawText),
          mode: "ungrounded",
          temperature: 0,
        },
        AbortSignal.timeout(LIVE_CALL_TIMEOUT_MS),
      );
      // D-022: billed regardless of what validation below decides.
      llmCostUsd = generated.costUsd;
      tokensIn = generated.tokensIn;
      tokensOut = generated.tokensOut;
      model = generated.modelVersion;
      observations = validateFramingObservations(
        claimed.rawText,
        JSON.parse(generated.text),
      );
      // Renew after generation so embedding cannot race a stale reclaim.
      const renewed = await renewFramingObservationLease(claimed.id, claimed.lockedBy);
      if (renewed === 0) {
        throw new Error("Lost framing observation lease after generation — refusing to embed");
      }
    }
    if (observations.length > 0) {
      const embedder = isMock ? mockEmbeddingProvider : await resolveEmbeddingProvider();
      const embedded = await embedder.embed({
        texts: observations.map((o) => o.phrase),
        signal: AbortSignal.timeout(LIVE_CALL_TIMEOUT_MS),
      });
      embeddingCostUsd = embedded.costUsd;
      embeddingModel = embedded.model;
      if (!Array.isArray(embedded.vectors) || embedded.vectors.length !== observations.length) {
        throw new Error("Embedding count does not match observation count");
      }
      vectors = embedded.vectors;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await completeFramingObservation({
    observationId: claimed.id,
    batchId: claimed.batchId,
    lockedBy: claimed.lockedBy,
    state: error === null ? "valid" : "failed",
    observationsJson: error === null ? observations : [],
    vectorsJson: error === null ? vectors : [],
    model,
    embeddingModel,
    llmCostUsd,
    embeddingCostUsd,
    tokensIn,
    tokensOut,
    error,
  });
  await maybeFinalizeFramingBatch(claimed.batchId);
  return "done";
}

/** Worker entry: reclaim stale locks, claim, process, finalize. */
export async function tickFramingObservationBatches(lockedBy: string): Promise<{
  claimed: number;
  processed: number;
  paused: number;
  reclaimed: number;
}> {
  // Framing uses its own floor (not WORKER_STALE_LOCK_MS): job reclaim can stay
  // at 60s while framing leases must cover generation + embedding.
  const staleMs = Number(process.env.FRAMING_STALE_LOCK_MS ?? FRAMING_STALE_LOCK_MS);
  const reclaimed = await reclaimStaleFramingLocks(
    Number.isFinite(staleMs) && staleMs >= FRAMING_STALE_LOCK_MS ? staleMs : FRAMING_STALE_LOCK_MS,
  );
  const claimed = await claimFramingObservations(FRAMING_CLAIM_LIMIT, lockedBy);
  let processed = 0;
  let paused = 0;
  for (const item of claimed) {
    try {
      const outcome = await processClaimedFramingObservation(item);
      if (outcome === "paused") {
        paused += 1;
        break; // batch paused; remaining claims were requeued by pauseFramingBatch
      }
      processed += 1;
    } catch (err) {
      console.error(
        `[worker] framing observation ${item.id} failed unexpectedly:`,
        err instanceof Error ? err.message : err,
      );
      await releaseFramingObservationClaim(item.id, item.lockedBy).catch(() => {});
      await maybeFinalizeFramingBatch(item.batchId).catch(() => {});
    }
  }
  // Finalize any batches whose last items finished without a claim path.
  for (const batchId of new Set(claimed.map((c) => c.batchId))) {
    await maybeFinalizeFramingBatch(batchId).catch(() => {});
  }
  return { claimed: claimed.length, processed, paused, reclaimed: reclaimed.length };
}

export async function resumeFramingObservationBatch(batchId: string): Promise<void> {
  const batch = await resumeFramingBatch(batchId);
  // Re-check C-2 before unpausing into live work — mirror resumeRun.
  const trip = await findExceededDailyBudget([
    extractionProviderId(),
    embeddingProviderId(),
  ]);
  if (trip) {
    await pauseFramingBatch(
      batch,
      `Daily budget for ${trip.providerId} is still exhausted ($${trip.spentUsd.toFixed(2)} of $${trip.budgetUsd.toFixed(2)}) — framing extraction remains paused (C-2)`,
    );
    throw new Error(
      `Daily budget for ${trip.providerId} is still exhausted — cannot resume (C-2)`,
    );
  }
}

/**
 * @deprecated Prefer enqueueFramingObservations + worker. Kept for tests that
 * drive the full mock path synchronously by enqueue + drain.
 */
export async function buildFramingObservations(
  projectId: string,
  limit = 60,
): Promise<{
  processed: number;
  valid: number;
  failed: number;
  skipped: number;
  costUsd: number;
  batchId: string;
}> {
  const enqueued = await enqueueFramingObservations(projectId, limit);
  const lockedBy = `sync-drain-${process.pid}`;
  // Drain until terminal (mock path is fast; live path still uses real providers).
  for (let guard = 0; guard < enqueued.totalCount + 5; guard++) {
    const tick = await tickFramingObservationBatches(lockedBy);
    if (tick.paused > 0) {
      throw new Error("Framing extraction paused — daily budget exhausted (C-2)");
    }
    const progress = await getFramingBatchProgress(enqueued.batchId);
    if (!progress || progress.state === "completed" || progress.state === "partial" || progress.state === "failed") {
      return {
        processed: progress?.processedCount ?? 0,
        valid: progress?.validCount ?? 0,
        failed: progress?.failedCount ?? 0,
        skipped: enqueued.skipped,
        costUsd: progress?.costUsd ?? 0,
        batchId: enqueued.batchId,
      };
    }
    if (tick.claimed === 0 && tick.reclaimed === 0) {
      // Nothing claimed — finalize if stuck.
      await maybeFinalizeFramingBatch(enqueued.batchId);
    }
  }
  const progress = await getFramingBatchProgress(enqueued.batchId);
  return {
    processed: progress?.processedCount ?? 0,
    valid: progress?.validCount ?? 0,
    failed: progress?.failedCount ?? 0,
    skipped: enqueued.skipped,
    costUsd: progress?.costUsd ?? 0,
    batchId: enqueued.batchId,
  };
}
