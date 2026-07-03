import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { createPendingExtraction, recordExtractionAttemptCost } from "@/db/repositories/extraction";
import { claimJobs, createRun, getProviderSpendToday, recordSuccess } from "@/db/repositories/runner";
import { auditRuns, extractions, jobs, matrixVersions, projects, promptCells, responses, runEvents } from "@/db/schema";

// C-2/D-012: no live DeepSeek call here — recordSuccess is a plain DB write,
// so spend is fabricated directly to prove the query/threshold logic without
// spending real money. Runs against the local dev database, self-skips
// without Postgres (same convention as src/modules/matrix/actions.test.ts).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m8-budget-e2e";
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
  // Per-run try/catch: one run's cleanup throwing (e.g. an FK ordering miss)
  // must never abort cleanup of the rest — that's exactly how a prior
  // version of this suite left live_validation/deepseek runs and jobs
  // orphaned in "running" state for a real worker to pick up later.
  for (const runId of createdRunIds) {
    try {
      const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId));
      const responseIds = responseRows.map((r) => r.id);
      for (const responseId of responseIds) {
        await db.delete(extractions).where(eq(extractions.responseId, responseId));
      }
      await db.delete(responses).where(eq(responses.runId, runId));
      await db.delete(jobs).where(eq(jobs.runId, runId));
      await db.delete(runEvents).where(eq(runEvents.runId, runId));
      await db.delete(auditRuns).where(eq(auditRuns.id, runId));
    } catch (err) {
      console.warn(`[budget.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
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
    .values({ name: "M8 Budget E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 2 });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  createdVersionIds.push(draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

/** Fabricates a real `deepseek` response row with a given cost — a plain DB write, no network call. */
async function recordFabricatedSpend(runId: string, costUsd: number) {
  const [job] = await claimJobs("deepseek", 1);
  if (!job) throw new Error("no deepseek job available to claim");
  await recordSuccess(job, {
    modelVersion: "deepseek-v4-flash",
    rawText: "fabricated for budget test",
    citations: [],
    tokensIn: 100,
    tokensOut: 50,
    costUsd,
    latencyMs: 10,
  });
}

describe.skipIf(!dbUp)("provider daily-budget enforcement (C-2/D-012)", () => {
  beforeEach(() => {
    delete process.env.DEEPSEEK_DAILY_BUDGET_USD;
    delete process.env.PROVIDER_DAILY_BUDGET_USD;
  });
  afterEach(() => {
    delete process.env.DEEPSEEK_DAILY_BUDGET_USD;
    delete process.env.PROVIDER_DAILY_BUDGET_USD;
  });

  it("readDailyBudgetUsd prefers the per-provider override over the global default, falls back to Infinity when neither is set", async () => {
    const { readDailyBudgetUsd } = await import("./budget");
    expect(readDailyBudgetUsd("deepseek")).toBe(Infinity);
    process.env.PROVIDER_DAILY_BUDGET_USD = "25";
    expect(readDailyBudgetUsd("deepseek")).toBe(25);
    process.env.DEEPSEEK_DAILY_BUDGET_USD = "3";
    expect(readDailyBudgetUsd("deepseek")).toBe(3);
  });

  it("readDailyBudgetUsd fails CLOSED on an unparseable or negative value — a typo must never disable enforcement", async () => {
    const { readDailyBudgetUsd } = await import("./budget");
    process.env.DEEPSEEK_DAILY_BUDGET_USD = "25USD"; // the typo that would have become NaN and been skipped
    expect(readDailyBudgetUsd("deepseek")).toBe(0);
    process.env.DEEPSEEK_DAILY_BUDGET_USD = "-5";
    expect(readDailyBudgetUsd("deepseek")).toBe(0);
    process.env.DEEPSEEK_DAILY_BUDGET_USD = "Infinity"; // explicit Infinity is not a budget either
    expect(readDailyBudgetUsd("deepseek")).toBe(0);
  });

  it("getProviderSpendToday sums today's response cost for the provider and excludes other providers", async () => {
    const projectId = await ensureProject();
    const version = await ensureApprovedVersion(projectId);
    const run = await createRun(
      { projectId, matrixVersionId: version.id, runMode: "live_validation", repetitions: 1, providers: ["deepseek"], modes: ["ungrounded"], costCapUsd: 25, debugFailureInjection: null },
      [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
      version.cellCount,
    );
    createdRunIds.push(run.id);

    const before = await getProviderSpendToday("deepseek");
    await recordFabricatedSpend(run.id, 1.5);
    const after = await getProviderSpendToday("deepseek");
    expect(after).toBeCloseTo(before + 1.5, 6);

    // A provider with no responses today reports zero, not an error.
    expect(await getProviderSpendToday("minimax")).toBe(0);
  });

  it("attributes extraction cost to the configured extraction engine, not the generation provider (D-041/C-2)", async () => {
    // An OpenAI run whose answers are extracted via DeepSeek: the extraction
    // $ must land on DeepSeek's budget (the engine), never OpenAI's.
    const projectId = await ensureProject();
    const version = await ensureApprovedVersion(projectId);
    const run = await createRun(
      { projectId, matrixVersionId: version.id, runMode: "live_validation", repetitions: 1, providers: ["openai"], modes: ["ungrounded"], costCapUsd: 25, debugFailureInjection: null },
      [{ id: "openai", supportsGrounded: true, supportsUngrounded: true }],
      version.cellCount,
    );
    createdRunIds.push(run.id);

    const openaiBefore = await getProviderSpendToday("openai");
    const deepseekBefore = await getProviderSpendToday("deepseek");

    // Fabricate one OpenAI response (generation spend) for this run.
    let job: Awaited<ReturnType<typeof claimJobs>>[number] | undefined;
    for (let guard = 0; guard < 20 && !job; guard++) {
      const claimed = await claimJobs("openai", 1);
      if (claimed.length === 0) break;
      if (claimed[0].runId === run.id) job = claimed[0];
    }
    if (!job) throw new Error("no openai job for this run");
    const responseId = await recordSuccess(job, {
      modelVersion: "gpt-5.5",
      rawText: "openai answer",
      citations: [],
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 2.0,
      latencyMs: 10,
    });

    // Fabricate a DeepSeek extraction cost against that response.
    const extractionId = await createPendingExtraction(responseId, 1);
    await recordExtractionAttemptCost(run.id, extractionId, { costUsd: 0.5, tokensIn: 200, tokensOut: 60 });

    const openaiAfter = await getProviderSpendToday("openai");
    const deepseekAfter = await getProviderSpendToday("deepseek");

    // OpenAI's budget carries ONLY its generation cost — extraction excluded.
    expect(openaiAfter - openaiBefore).toBeCloseTo(2.0, 6);
    // DeepSeek's budget carries the extraction cost, though no DeepSeek
    // generation happened on this run.
    expect(deepseekAfter - deepseekBefore).toBeCloseTo(0.5, 6);
  });

  it("findExceededDailyBudget trips once cumulative spend reaches the budget, skips mock, and reports null under budget", async () => {
    const { findExceededDailyBudget } = await import("./budget");
    const projectId = await ensureProject();
    const version = await ensureApprovedVersion(projectId);
    const run = await createRun(
      { projectId, matrixVersionId: version.id, runMode: "live_validation", repetitions: 1, providers: ["deepseek"], modes: ["ungrounded"], costCapUsd: 25, debugFailureInjection: null },
      [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
      version.cellCount,
    );
    createdRunIds.push(run.id);

    process.env.DEEPSEEK_DAILY_BUDGET_USD = "1000000"; // effectively unlimited for this run
    expect(await findExceededDailyBudget(["mock", "deepseek"])).toBeNull();

    const spentSoFar = await getProviderSpendToday("deepseek");
    process.env.DEEPSEEK_DAILY_BUDGET_USD = String(spentSoFar + 0.5);
    await recordFabricatedSpend(run.id, 1.0);

    const trip = await findExceededDailyBudget(["mock", "deepseek"]);
    expect(trip).not.toBeNull();
    expect(trip?.providerId).toBe("deepseek");

    // mock is always skipped, even with a budget set — it never spends real money.
    process.env.MOCK_DAILY_BUDGET_USD = "0";
    expect(await findExceededDailyBudget(["mock"])).toBeNull();
    delete process.env.MOCK_DAILY_BUDGET_USD;
  });
});
