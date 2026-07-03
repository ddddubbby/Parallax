import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { getEligibleExtractionsForRun, listDeadLetteredExtractions } from "@/db/repositories/extraction";
import { recomputeMetrics, listMetrics } from "@/db/repositories/metrics";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { claimJobs, createRun, listRunEvents, recordSuccess } from "@/db/repositories/runner";
import {
  auditRuns,
  brandMentions,
  claimsFound,
  extractions,
  jobs,
  matrixVersions,
  metrics as metricsTable,
  projects,
  promptCells,
  responses,
  runEvents,
} from "@/db/schema";
import { mockProvider } from "@/providers/mock";
import { extractResponse } from "./service";

// M5 acceptance (DEVELOPMENT_GUIDELINES.md F): extraction retry/dead-letter
// tests, metric recompute idempotency test. DB-backed; self-skips without
// Postgres. next/cache is mocked since createRun's server action isn't
// used here — this test calls repositories directly, same pattern as
// src/modules/matrix/actions.test.ts.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m5-extraction-e2e";
let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdVersionIds: string[] = [];
const createdRunIds: string[] = [];

afterAll(async () => {
  // Per-run try/catch: an ordering miss here once orphaned every run
  // created by this file, in "running" state, for a real worker to later
  // pick up — see src/modules/runner/budget.test.ts and
  // src/modules/extraction/live-pipeline.test.ts for the same guard.
  for (const runId of createdRunIds) {
    try {
      await db.delete(metricsTable).where(eq(metricsTable.runId, runId));
      const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId));
      const responseIds = responseRows.map((r) => r.id);
      if (responseIds.length > 0) {
        const extractionRows = await db.select({ id: extractions.id }).from(extractions).where(inArray(extractions.responseId, responseIds));
        const extractionIds = extractionRows.map((e) => e.id);
        if (extractionIds.length > 0) {
          await db.delete(brandMentions).where(inArray(brandMentions.extractionId, extractionIds));
          await db.delete(claimsFound).where(inArray(claimsFound.extractionId, extractionIds));
          await db.delete(extractions).where(inArray(extractions.id, extractionIds));
        }
      }
      await db.delete(responses).where(eq(responses.runId, runId));
      await db.delete(jobs).where(eq(jobs.runId, runId));
      await db.delete(runEvents).where(eq(runEvents.runId, runId));
      await db.delete(auditRuns).where(eq(auditRuns.id, runId));
    } catch (err) {
      console.warn(`[pipeline.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
    }
  }
  for (const versionId of createdVersionIds) {
    await db.delete(promptCells).where(eq(promptCells.matrixVersionId, versionId));
    await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId));
  }
  await pool.end().catch(() => {});
});

async function ensureProject() {
  const [existing] = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (existing) return existing.id;
  const [demo] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!demo) throw new Error("ledgerfox-demo not found — run pnpm db:seed first");

  const inputs = await getMatrixInputs(demo.id);
  if (!inputs || !inputs.client) throw new Error("demo project intake incomplete");

  const { brands, personas, markets, attributes } = await import("@/db/schema");
  const [project] = await db
    .insert(projects)
    .values({ name: "M5 Extraction E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
    .returning({ id: projects.id });

  await db.insert(brands).values({ projectId: project.id, role: "client", name: inputs.client.name, domain: inputs.client.domain, aliasesJson: inputs.client.aliasesJson });
  for (const [i, c] of inputs.competitors.entries()) {
    await db.insert(brands).values({ projectId: project.id, role: "competitor", name: c.name, aliasesJson: c.aliasesJson, priority: i });
  }
  for (const p of inputs.personas) await db.insert(personas).values({ projectId: project.id, title: p.title });
  for (const m of inputs.markets) await db.insert(markets).values({ projectId: project.id, name: m.name });
  for (const name of inputs.attributes) await db.insert(attributes).values({ projectId: project.id, name });
  return project.id;
}

async function ensureFactClaims(projectId: string) {
  const { factClaims } = await import("@/db/schema");
  const existing = await db.select().from(factClaims).where(eq(factClaims.projectId, projectId));
  if (existing.length > 0) return;
  const [demo] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  const demoClaims = await db.select().from(factClaims).where(eq(factClaims.projectId, demo!.id));
  for (const c of demoClaims) {
    await db.insert(factClaims).values({ projectId, type: c.type, statement: c.statement, sourceNote: c.sourceNote, sourceUrl: c.sourceUrl });
  }
}

async function ensureApprovedVersion(projectId: string) {
  const [approved] = await db.select().from(matrixVersions).where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.state, "approved")));
  if (approved) return approved;
  const inputs = await getMatrixInputs(projectId);
  if (!inputs || !inputs.client) throw new Error("intake incomplete");
  const ctx = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
    competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
    attributes: inputs.attributes,
  };
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 20 });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  createdVersionIds.push(draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

/** Processes every queued job for a run to completion via direct repo calls (no worker process needed for this test). */
async function processRunToCompletion(runId: string) {
  let guard = 200;
  while (guard-- > 0) {
    const claimed = await claimJobs("mock", 10);
    if (claimed.length === 0) break;
    for (const job of claimed) {
      const result = await mockProvider.generate({ promptText: job.resolvedText, mode: job.generationMode as "grounded" | "ungrounded", repIndex: job.repIndex });
      const responseId = await recordSuccess(job, {
        modelVersion: result.modelVersion,
        rawText: result.text,
        citations: result.citations,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
      await extractResponse(responseId);
    }
  }
  void runId;
}

describe.skipIf(!dbUp)("extraction pipeline against the dev database", () => {
  it("retries once on validation failure and dead-letters after two failures (SM-2, SM-3)", async () => {
    const projectId = await ensureProject();
    await ensureFactClaims(projectId);
    const version = await ensureApprovedVersion(projectId);

    const run = await createRun(
      {
        projectId,
        matrixVersionId: version.id,
        runMode: "mock",
        repetitions: 1,
        providers: ["mock"],
        modes: ["ungrounded"],
        costCapUsd: 25,
        // Moderate rate so we deterministically observe both retry-then-succeed
        // and dead-letter outcomes across enough responses without needing
        // per-attempt control.
        debugFailureInjection: { extraction: { invalidRate: 0.5 } },
      },
      [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
      version.cellCount,
    );
    createdRunIds.push(run.id);

    await processRunToCompletion(run.id);

    const events = await listRunEvents(run.id, 500);
    const retryEvents = events.filter((e) => e.eventType === "extraction_retry");
    const deadLetterEvents = events.filter((e) => e.eventType === "extraction_dead_lettered");
    expect(retryEvents.length + deadLetterEvents.length).toBeGreaterThan(0);

    const deadLetters = await listDeadLetteredExtractions(500);
    const thisRunDeadLetters = deadLetters.filter((d) => d.runId === run.id);
    // With invalidRate=0.5 and EXTRACTION_ATTEMPTS=2, dead-letter probability
    // per response is 0.25; over 20 cells that's effectively certain.
    expect(thisRunDeadLetters.length).toBeGreaterThan(0);

    // Dead-lettered responses are excluded from eligible samples (D-014).
    const eligible = await getEligibleExtractionsForRun(run.id);
    const eligibleIds = new Set(eligible.map((e) => e.extractionId));
    for (const dl of thisRunDeadLetters) expect(eligibleIds.has(dl.id)).toBe(false);
  }, 60_000);

  it("recompute is idempotent: same run, same metric rows on repeat (C-3)", async () => {
    const projectId = await ensureProject();
    await ensureFactClaims(projectId);
    const version = await ensureApprovedVersion(projectId);

    // Two modes deliberately: MT-7 stability is scoped per cell *and*
    // engine-mode, so a cell run under both modes must not collide on the
    // metrics table's unique index (caught live against the M4 e2e run).
    const run = await createRun(
      {
        projectId,
        matrixVersionId: version.id,
        runMode: "mock",
        repetitions: 1,
        providers: ["mock"],
        modes: ["ungrounded", "grounded"],
        costCapUsd: 25,
        debugFailureInjection: null,
      },
      [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
      version.cellCount * 2,
    );
    createdRunIds.push(run.id);
    await processRunToCompletion(run.id);

    const firstCount = await recomputeMetrics(run.id);
    const firstRows = await listMetrics(run.id);
    expect(firstRows.length).toBe(firstCount);
    expect(firstRows.length).toBeGreaterThan(0);

    const secondCount = await recomputeMetrics(run.id);
    const secondRows = await listMetrics(run.id);
    expect(secondCount).toBe(firstCount);
    expect(secondRows.length).toBe(firstRows.length);

    const sortKey = (r: (typeof firstRows)[number]) => `${r.scopeType}|${r.scopeKey}|${r.metricKey}`;
    const firstSorted = [...firstRows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const secondSorted = [...secondRows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    for (let i = 0; i < firstSorted.length; i++) {
      expect(secondSorted[i].value).toBeCloseTo(firstSorted[i].value, 6);
      expect(secondSorted[i].n).toBe(firstSorted[i].n);
    }
  }, 60_000);
});
