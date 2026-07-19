import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditRuns,
  framingObservations,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
} from "@/db/schema";
import { framingObservationBatches } from "@/db/schema";
import {
  claimFramingObservations,
  completeFramingObservation,
  getActiveFramingBatch,
  getFramingBatchProgress,
  reclaimStaleFramingLocks,
} from "@/db/repositories/framing-observations";
import {
  buildFramingObservations,
  enqueueFramingObservations,
  FRAMING_STALE_LOCK_MS,
  processClaimedFramingObservation,
  tickFramingObservationBatches,
} from "./observations";
import { listBaselinePickerData } from "@/db/repositories/resonance";
import { forceDeleteMatrixVersions } from "@/db/repositories/matrix.test-helpers";

// M44 / D-114 themes v2 acceptance: the mock-path batch is deterministic and
// $0, idempotent on re-run, flips the picker's theme source to
// framing_observations, and records rows the C-2 spend query can see.

const createdVersionIds: string[] = [];
const createdRunIds: string[] = [];
const createdResponseIds: string[] = [];

async function demoProjectId() {
  const [project] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!project) throw new Error("ledgerfox-demo not found — run pnpm db:seed first");
  return project.id;
}

const RAW_TEXTS = [
  "LedgerFox is described as easy to implement for finance teams. LedgerFox is praised for reconciliation.",
  "LedgerFox is described as easy to implement for finance teams. Some reviewers note pricing questions about LedgerFox.",
];

async function seedCompletedMockResponses(projectId: string): Promise<string[]> {
  const [{ latest }] = await db
    .select({ latest: max(matrixVersions.version) })
    .from(matrixVersions)
    .where(eq(matrixVersions.projectId, projectId));
  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId,
      version: (latest ?? 0) + 1,
      state: "approved",
      kind: "audit",
      cellCount: 1,
      approvedAt: new Date(),
    })
    .returning({ id: matrixVersions.id });
  createdVersionIds.push(version.id);
  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version.id,
      intent: "discovery",
      variantKey: "m44-observations-fixture",
      resolvedText: "What AI tools are recommended for finance operations?",
      competitorOrderJson: [],
    })
    .returning({ id: promptCells.id });
  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: RAW_TEXTS.length,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: RAW_TEXTS.length,
      costCapUsd: "1",
    })
    .returning({ id: auditRuns.id });
  createdRunIds.push(run.id);
  const ids: string[] = [];
  for (let rep = 0; rep < RAW_TEXTS.length; rep++) {
    const [job] = await db
      .insert(jobs)
      .values({
        runId: run.id,
        cellId: cell.id,
        providerId: "mock",
        generationMode: "ungrounded",
        repIndex: rep,
        state: "succeeded",
      })
      .returning({ id: jobs.id });
    const [response] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: run.id,
        cellId: cell.id,
        providerId: "mock",
        generationMode: "ungrounded",
        modelVersion: "mock-m44-observations",
        rawText: RAW_TEXTS[rep],
      })
      .returning({ id: responses.id });
    ids.push(response.id);
    createdResponseIds.push(response.id);
  }
  return ids;
}

afterAll(async () => {
  if (createdResponseIds.length > 0) {
    await db
      .delete(framingObservations)
      .where(inArray(framingObservations.responseId, createdResponseIds));
    await db.delete(responses).where(inArray(responses.id, createdResponseIds));
  }
  // Batches may linger after terminal tests; clear any for the demo project.
  const [demo] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (demo) {
    await db.delete(framingObservationBatches).where(eq(framingObservationBatches.projectId, demo.id));
  }
  for (const runId of createdRunIds) {
    await db.delete(jobs).where(eq(jobs.runId, runId));
    await db.delete(auditRuns).where(eq(auditRuns.id, runId));
  }
  // Approved versions are freeze-protected (M25); the shared test helper
  // performs the sanctioned force-delete.
  await forceDeleteMatrixVersions(createdVersionIds);
});

describe("blind framing-observation batch (M44 / D-114 themes v2)", () => {
  it("extracts mock responses at $0, is idempotent, and upgrades the picker's theme source", async () => {
    const projectId = await demoProjectId();
    const responseIds = await seedCompletedMockResponses(projectId);

    const first = await buildFramingObservations(projectId, 200);
    expect(first.failed).toBe(0);
    expect(first.processed).toBeGreaterThanOrEqual(RAW_TEXTS.length);
    expect(first.costUsd).toBe(0);

    const rows = await db
      .select()
      .from(framingObservations)
      .where(inArray(framingObservations.responseId, responseIds));
    expect(rows).toHaveLength(RAW_TEXTS.length);
    for (const row of rows) {
      expect(row.state).toBe("valid");
      const observations = row.observationsJson as Array<{ phrase: string; quote: string }>;
      const vectors = row.vectorsJson as number[][];
      expect(observations.length).toBeGreaterThan(0);
      expect(vectors).toHaveLength(observations.length);
      expect(row.model).toBe("mock-framing-extractor-v1");
      expect(Number(row.llmCostUsd)).toBe(0);
      expect(Number(row.embeddingCostUsd)).toBe(0);
    }

    // Idempotent: a second enqueue refuses when every latest row is already valid.
    await expect(buildFramingObservations(projectId, 200)).rejects.toThrow(
      /already have framing observations/i,
    );

    // Picker flips to machine-grouped framing themes; the shared sentence
    // across both responses clusters into one theme spanning both.
    const picker = await listBaselinePickerData(projectId, 200);
    expect(picker.themesSource).toBe("framing_observations");
    const shared = picker.themes.find((t) => t.label.toLowerCase().includes("easy to implement"));
    expect(shared).toBeDefined();
    expect(shared!.matching).toBeGreaterThanOrEqual(2);
    expect(shared!.total).toBe(picker.responses.length);
    expect(shared!.key.startsWith("fo-")).toBe(true);
  }, 30_000);

  it("refuses a live batch when the extraction engine's daily budget is exhausted (C-2)", async () => {
    const projectId = await demoProjectId();
    // A live-mode response makes the batch subject to the budget gate…
    const [{ latest }] = await db
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const [version] = await db
      .insert(matrixVersions)
      .values({
        projectId,
        version: (latest ?? 0) + 1,
        state: "approved",
        kind: "audit",
        cellCount: 1,
        approvedAt: new Date(),
      })
      .returning({ id: matrixVersions.id });
    createdVersionIds.push(version.id);
    const [cell] = await db
      .insert(promptCells)
      .values({
        matrixVersionId: version.id,
        intent: "discovery",
        variantKey: "m44-budget-fixture",
        resolvedText: "What AI tools are recommended for finance operations?",
        competitorOrderJson: [],
      })
      .returning({ id: promptCells.id });
    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId,
        matrixVersionId: version.id,
        runMode: "live_audit",
        state: "completed",
        repetitions: 5,
        selectedProvidersJson: ["deepseek"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 5,
        costCapUsd: "1",
      })
      .returning({ id: auditRuns.id });
    createdRunIds.push(run.id);
    const [job] = await db
      .insert(jobs)
      .values({
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        repIndex: 0,
        state: "succeeded",
      })
      .returning({ id: jobs.id });
    const [liveResponse] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        modelVersion: "deepseek-m44-budget",
        rawText: "LedgerFox is described as a live-run answer.",
      })
      .returning({ id: responses.id });
    createdResponseIds.push(liveResponse.id);

    // …and today's spend comes from a prior framing batch: the new
    // llm_cost_usd attribution must count into the extraction engine's day.
    await db.insert(framingObservations).values({
      responseId: liveResponse.id,
      version: 1,
      state: "failed",
      error: "spent then failed — still billed (D-022)",
      llmCostUsd: "0.50",
    });

    const previousBudget = process.env.PROVIDER_DAILY_BUDGET_USD;
    process.env.PROVIDER_DAILY_BUDGET_USD = "0.25";
    try {
      await expect(buildFramingObservations(projectId, 200)).rejects.toThrow(/C-2/);
      // Pause leaves an active batch — clear it so later tests can enqueue.
      const paused = await getActiveFramingBatch(projectId);
      expect(paused?.state).toBe("paused");
      if (paused) {
        await db
          .delete(framingObservations)
          .where(eq(framingObservations.batchId, paused.id));
        await db
          .delete(framingObservationBatches)
          .where(eq(framingObservationBatches.id, paused.id));
      }
    } finally {
      if (previousBudget === undefined) delete process.env.PROVIDER_DAILY_BUDGET_USD;
      else process.env.PROVIDER_DAILY_BUDGET_USD = previousBudget;
    }
  }, 30_000);

  it("failed extraction rows are re-attempted as a new version on the next run", async () => {
    const projectId = await demoProjectId();
    const [responseId] = createdResponseIds;
    // Plant a failed latest version above the valid one.
    const [{ latest }] = await db
      .select({ latest: max(framingObservations.version) })
      .from(framingObservations)
      .where(eq(framingObservations.responseId, responseId));
    await db.insert(framingObservations).values({
      responseId,
      version: (latest ?? 0) + 1,
      state: "failed",
      error: "planted failure",
    });
    const result = await buildFramingObservations(projectId, 200);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const [row] = await db
      .select()
      .from(framingObservations)
      .where(
        and(
          eq(framingObservations.responseId, responseId),
          eq(framingObservations.version, (latest ?? 0) + 2),
        ),
      );
    expect(row?.state).toBe("valid");
  }, 30_000);

  it("rejects a second active batch and recovers stale locks (M46/D-117)", async () => {
    const projectId = await demoProjectId();
    // Fresh responses so enqueue has work (prior tests left valids).
    const responseIds = await seedCompletedMockResponses(projectId);
    const first = await enqueueFramingObservations(projectId, 200);
    expect(first.totalCount).toBeGreaterThanOrEqual(RAW_TEXTS.length);
    await expect(enqueueFramingObservations(projectId, 200)).rejects.toThrow(
      /already in progress/i,
    );
    const active = await getActiveFramingBatch(projectId);
    expect(active?.id).toBe(first.batchId);
    expect(active?.state).toBe("queued");

    // Plant a stale running lock; reclaim must return it to queued.
    const [queued] = await db
      .select()
      .from(framingObservations)
      .where(
        and(
          eq(framingObservations.batchId, first.batchId),
          eq(framingObservations.state, "queued"),
        ),
      )
      .limit(1);
    await db
      .update(framingObservations)
      .set({
        state: "running",
        lockedAt: new Date(Date.now() - 120_000),
        lockedBy: "dead-worker",
      })
      .where(eq(framingObservations.id, queued.id));
    const reclaimed = await reclaimStaleFramingLocks(60_000);
    expect(reclaimed.some((r) => r.id === queued.id)).toBe(true);
    const [after] = await db
      .select({ state: framingObservations.state, lockedAt: framingObservations.lockedAt })
      .from(framingObservations)
      .where(eq(framingObservations.id, queued.id));
    expect(after.state).toBe("queued");
    expect(after.lockedAt).toBeNull();

    // Drain to terminal so later tests aren't blocked by the active batch.
    let terminal = await getFramingBatchProgress(first.batchId);
    for (let i = 0; i < 20 && terminal && !["completed", "partial", "failed"].includes(terminal.state); i++) {
      await tickFramingObservationBatches(`test-${process.pid}`);
      terminal = await getFramingBatchProgress(first.batchId);
    }
    expect(terminal?.state).toMatch(/completed|partial/);
    expect(terminal?.processedCount).toBeGreaterThanOrEqual(RAW_TEXTS.length);
    expect(FRAMING_STALE_LOCK_MS).toBeGreaterThan(120_000);
    void responseIds;
  }, 30_000);

  it("refuses completeFramingObservation when lockedBy does not match (M46 lease fence)", async () => {
    const projectId = await demoProjectId();
    await seedCompletedMockResponses(projectId);
    const enqueued = await enqueueFramingObservations(projectId, 200);
    const [row] = await db
      .select()
      .from(framingObservations)
      .where(
        and(
          eq(framingObservations.batchId, enqueued.batchId),
          eq(framingObservations.state, "queued"),
        ),
      )
      .limit(1);
    await db
      .update(framingObservations)
      .set({
        state: "running",
        lockedAt: new Date(),
        lockedBy: "owner-a",
      })
      .where(eq(framingObservations.id, row.id));

    await completeFramingObservation({
      observationId: row.id,
      batchId: enqueued.batchId,
      lockedBy: "intruder-b",
      state: "valid",
      observationsJson: [],
      vectorsJson: [],
      model: "test",
      embeddingModel: null,
      llmCostUsd: 0,
      embeddingCostUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      error: null,
    });

    const [after] = await db
      .select({
        state: framingObservations.state,
        lockedBy: framingObservations.lockedBy,
      })
      .from(framingObservations)
      .where(eq(framingObservations.id, row.id));
    expect(after.state).toBe("running");
    expect(after.lockedBy).toBe("owner-a");

    // Owner can finalize; drain batch so later tests stay unblocked.
    await completeFramingObservation({
      observationId: row.id,
      batchId: enqueued.batchId,
      lockedBy: "owner-a",
      state: "failed",
      observationsJson: [],
      vectorsJson: [],
      model: null,
      embeddingModel: null,
      llmCostUsd: 0,
      embeddingCostUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      error: "test cleanup",
    });
    let terminal = await getFramingBatchProgress(enqueued.batchId);
    for (let i = 0; i < 20 && terminal && !["completed", "partial", "failed"].includes(terminal.state); i++) {
      await tickFramingObservationBatches(`fence-${process.pid}`);
      terminal = await getFramingBatchProgress(enqueued.batchId);
    }
    expect(terminal?.state).toMatch(/completed|partial|failed/);
  }, 30_000);

  it("renews before each claimed item so a second row aged behind the first is not double-spent", async () => {
    const projectId = await demoProjectId();
    await seedCompletedMockResponses(projectId);
    const enqueued = await enqueueFramingObservations(projectId, 200);
    const claimed = await claimFramingObservations(2, "worker-a");
    expect(claimed.length).toBe(2);
    const [first, second] = claimed;

    await processClaimedFramingObservation(first);

    // Shared claim clock: second row sat idle while the first ran a full pipeline.
    const agedOut = new Date(Date.now() - (FRAMING_STALE_LOCK_MS + 1_000));
    await db
      .update(framingObservations)
      .set({ lockedAt: agedOut })
      .where(eq(framingObservations.id, second.id));

    // Without a pre-work renew, another worker reclaiming at the framing stale
    // window would steal this lease mid-generation (duplicate spend).
    const stolen = await reclaimStaleFramingLocks(FRAMING_STALE_LOCK_MS);
    expect(stolen.some((r) => r.id === second.id)).toBe(true);

    // Re-plant the race: A still thinks it owns an aged claim.
    await db
      .update(framingObservations)
      .set({
        state: "running",
        lockedBy: "worker-a",
        lockedAt: agedOut,
      })
      .where(eq(framingObservations.id, second.id));

    // processClaimed renews first — ownership is refreshed before mock/live work.
    const outcome = await processClaimedFramingObservation(second);
    expect(outcome).toBe("done");
    const [finished] = await db
      .select({
        state: framingObservations.state,
        lockedBy: framingObservations.lockedBy,
      })
      .from(framingObservations)
      .where(eq(framingObservations.id, second.id));
    expect(finished.state).toBe("valid");
    expect(finished.lockedBy).toBeNull();

    // Lost-lease path: reclaim wins before A's renew → A must not finalize.
    const remaining = await claimFramingObservations(1, "worker-a");
    if (remaining.length === 1) {
      const orphan = remaining[0]!;
      await db
        .update(framingObservations)
        .set({
          lockedAt: new Date(Date.now() - (FRAMING_STALE_LOCK_MS + 1_000)),
        })
        .where(eq(framingObservations.id, orphan.id));
      const raced = await reclaimStaleFramingLocks(FRAMING_STALE_LOCK_MS);
      expect(raced.some((r) => r.id === orphan.id)).toBe(true);
      expect(await processClaimedFramingObservation(orphan)).toBe("done");
      const [after] = await db
        .select({ state: framingObservations.state, lockedBy: framingObservations.lockedBy })
        .from(framingObservations)
        .where(eq(framingObservations.id, orphan.id));
      expect(after.state).toBe("queued");
      expect(after.lockedBy).toBeNull();
    }

    let terminal = await getFramingBatchProgress(enqueued.batchId);
    for (
      let i = 0;
      i < 20 && terminal && !["completed", "partial", "failed"].includes(terminal.state);
      i++
    ) {
      await tickFramingObservationBatches(`renew-${process.pid}`);
      terminal = await getFramingBatchProgress(enqueued.batchId);
    }
    expect(terminal?.state).toMatch(/completed|partial|failed/);
  }, 30_000);
});
