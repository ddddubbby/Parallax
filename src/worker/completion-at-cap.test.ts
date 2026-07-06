import { spawn, type ChildProcess } from "node:child_process";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { createRun, getRun, listRunEvents, recordSuccess } from "@/db/repositories/runner";
import {
  auditRuns,
  brandMentions,
  claimsFound,
  extractions,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
  runEvents,
} from "@/db/schema";
import { mockProvider } from "@/providers/mock";

// Fix A (post-M10-prep audit round 2): afterJobFinished used to check the
// cost-cap/budget breaker BEFORE checking whether the run had any
// queued/running jobs left. A run whose FINAL job pushed actualCostUsd to
// or past its cap tripped the breaker and paused — with zero jobs left to
// ever finish it, that run was stranded in 'paused' forever. This spawns
// the REAL worker (not a reimplementation of its logic) against a run
// whose cap sits exactly between one job's cost and two jobs' cost, so the
// last job's own completion is the one that would have mis-tripped the
// breaker under the old ordering.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m10-completion-at-cap-e2e";
const MOCK_COST_PER_CALL_USD = 0.0006; // src/providers/mock/index.ts

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
  for (const runId of createdRunIds) {
    try {
      const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId));
      for (const r of responseRows) {
        const extractionRows = await db.select({ id: extractions.id }).from(extractions).where(eq(extractions.responseId, r.id));
        for (const e of extractionRows) {
          await db.delete(brandMentions).where(eq(brandMentions.extractionId, e.id));
          await db.delete(claimsFound).where(eq(claimsFound.extractionId, e.id));
        }
        await db.delete(extractions).where(eq(extractions.responseId, r.id));
      }
      await db.delete(responses).where(eq(responses.runId, runId));
      await db.delete(jobs).where(eq(jobs.runId, runId));
      await db.delete(runEvents).where(eq(runEvents.runId, runId));
      await db.delete(auditRuns).where(eq(auditRuns.id, runId));
    } catch (err) {
      console.warn(`[completion-at-cap.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
    }
  }
  for (const versionId of createdVersionIds) {
    try {
      // Belt-and-suspenders beyond the runId loop above: any job row still
      // referencing this version's cells (e.g. a worker process that hadn't
      // fully exited when cleanup ran) would otherwise fail this delete.
      const cellRows = await db.select({ id: promptCells.id }).from(promptCells).where(eq(promptCells.matrixVersionId, versionId));
      const cellIds = cellRows.map((c) => c.id);
      if (cellIds.length > 0) {
        await db.delete(jobs).where(inArray(jobs.cellId, cellIds));
      }
      await db.delete(promptCells).where(eq(promptCells.matrixVersionId, versionId));
      await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId));
    } catch (err) {
      console.warn(`[completion-at-cap.test.ts afterAll] failed to clean up version ${versionId}:`, err instanceof Error ? err.message : err);
    }
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
    .values({ name: "M10 Completion-at-cap E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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

async function ensureApprovedVersion(projectId: string) {
  const [approved] = await db
    .select()
    .from(matrixVersions)
    .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.state, "approved")));
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
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 1 });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  createdVersionIds.push(draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

async function createOversizeRun(projectId: string) {
  const [{ nextVersion }] = await db
    .select({ nextVersion: sql<number>`coalesce(max(${matrixVersions.version}), 0)::int + 1` })
    .from(matrixVersions)
    .where(eq(matrixVersions.projectId, projectId));

  // matrix_versions.cell_count has a DB check at <= 50, so this simulates
  // the only remaining bypass class: actual prompt_cells were hand-mutated
  // past the cap while the cached count stayed valid.
  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId,
      version: nextVersion,
      state: "approved",
      kind: "audit",
      cellCount: 50,
      approvedAt: new Date(),
    })
    .returning();
  createdVersionIds.push(version.id);

  const cells = await db
    .insert(promptCells)
    .values(
      Array.from({ length: 51 }, (_, index) => ({
        matrixVersionId: version.id,
        intent: "discovery" as const,
        variantKey: `oversize-${index}`,
        resolvedText: `Oversize cap regression prompt ${index}`,
        competitorOrderJson: [],
      })),
    )
    .returning({ id: promptCells.id });

  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "queued",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 51,
      costCapUsd: "25",
    })
    .returning({ id: auditRuns.id });
  createdRunIds.push(run.id);

  await db.insert(jobs).values({
    runId: run.id,
    cellId: cells[0].id,
    providerId: "mock",
    generationMode: "ungrounded",
    repIndex: 0,
    state: "queued",
  });

  return run;
}

function spawnWorker(): ChildProcess {
  const nodeBin = process.execPath;
  const tsxLoader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const workerEntry = new URL("./index.ts", import.meta.url).pathname;
  return spawn(nodeBin, ["--import", tsxLoader, workerEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WORKER_STALE_RECLAIM_INTERVAL_MS: "500",
      WORKER_EXTRACTION_SWEEP_AGE_MS: "500",
      WORKER_STALE_LOCK_MS: "5000",
      WORKER_PROVIDER_TIMEOUT_MS: "1000",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTerminal(runId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run && ["completed", "failed", "cancelled", "paused"].includes(run.state)) return run;
    await sleep(200);
  }
  throw new Error(`Run did not reach a terminal state within ${timeoutMs}ms`);
}

describe.skipIf(!dbUp)("run completes when its final job crosses the cost cap (Fix A)", () => {
  it("does not strand the run in 'paused' with zero jobs left to ever finish it", async () => {
    const projectId = await ensureProject();
    // 1 cell x k=2 reps = 2 mock jobs, total cost = 2 * MOCK_COST_PER_CALL_USD.
    const version = await ensureApprovedVersion(projectId);
    const capCrossedOnlyByBothJobs = MOCK_COST_PER_CALL_USD * 1.5; // between 1x and 2x
    const run = await createRun(
      {
        projectId,
        matrixVersionId: version.id,
        runMode: "mock",
        repetitions: 2,
        providers: ["mock"],
        modes: ["ungrounded"],
        costCapUsd: capCrossedOnlyByBothJobs,
        debugFailureInjection: null,
      },
      [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
      version.cellCount * 2,
    );
    createdRunIds.push(run.id);

    const worker = spawnWorker();
    const finalRun = await waitForTerminal(run.id, 30_000);
    worker.kill("SIGTERM");

    expect(finalRun.state).toBe("completed");
    expect(Number(finalRun.actualCostUsd)).toBeGreaterThanOrEqual(capCrossedOnlyByBothJobs);

    const events = await listRunEvents(run.id, 50);
    expect(events.some((e) => e.eventType === "run_completed")).toBe(true);
    expect(events.some((e) => e.eventType === "circuit_breaker_paused")).toBe(false);
  }, 40_000);

  it("pauses an over-50-cell run before the worker spends on queued jobs (C-1 backstop)", async () => {
    const projectId = await ensureProject();
    const run = await createOversizeRun(projectId);

    const worker = spawnWorker();
    const finalRun = await waitForTerminal(run.id, 30_000);
    worker.kill("SIGTERM");

    expect(finalRun.state).toBe("paused");
    expect(Number(finalRun.actualCostUsd)).toBe(0);

    const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, run.id));
    expect(responseRows).toHaveLength(0);

    const events = await listRunEvents(run.id, 50);
    expect(events.some((e) => e.eventType === "cell_cap_violation")).toBe(true);
  }, 40_000);

  it("finalizes a running run with no queued/running jobs after a worker crash before completion check", async () => {
    const projectId = await ensureProject();
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
        debugFailureInjection: null,
      },
      [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
      version.cellCount,
    );
    createdRunIds.push(run.id);

    const [job] = await db
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
      .where(eq(jobs.runId, run.id))
      .limit(1);
    await db.update(auditRuns).set({ state: "running", startedAt: new Date() }).where(eq(auditRuns.id, run.id));
    await db.update(jobs).set({ state: "running", lockedAt: new Date() }).where(eq(jobs.id, job.id));
    const generated = await mockProvider.generate({
      promptText: job.resolvedText,
      mode: job.generationMode,
      repIndex: job.repIndex,
    });
    await recordSuccess(job, {
      modelVersion: generated.modelVersion,
      rawText: generated.text,
      citations: generated.citations,
      tokensIn: generated.tokensIn,
      tokensOut: generated.tokensOut,
      costUsd: generated.costUsd,
      latencyMs: generated.latencyMs,
    });

    const worker = spawnWorker();
    const finalRun = await waitForTerminal(run.id, 30_000);
    worker.kill("SIGTERM");

    expect(finalRun.state).toBe("completed");
    const events = await listRunEvents(run.id, 50);
    expect(events.some((e) => e.eventType === "run_completed")).toBe(true);
  }, 40_000);
});
