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
import { buildFramingObservations } from "./observations";
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

    // Idempotent: the second run skips every valid row.
    const second = await buildFramingObservations(projectId, 200);
    expect(second.processed).toBe(0);
    expect(second.skipped).toBeGreaterThanOrEqual(RAW_TEXTS.length);

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
});
