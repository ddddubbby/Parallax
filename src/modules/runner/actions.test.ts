import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { forceDeleteMatrixVersions } from "@/db/repositories/matrix.test-helpers";
import { createRun as createRunRepo, getApprovedVersionForRun } from "@/db/repositories/runner";
import { auditRuns, jobs, matrixVersions, projects, responses, runEvents } from "@/db/schema";

// M8-hardening: the C-9 run-mode boundary. Before this existed, the run
// form exposed DeepSeek while createRun hardcoded runMode "mock" — real
// paid generations stored, displayed, and aggregated under MOCK semantics.
// Runs against the local dev database, self-skips without Postgres.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m8-runmode-boundary-e2e";
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
      await db.delete(responses).where(eq(responses.runId, runId));
      await db.delete(jobs).where(eq(jobs.runId, runId));
      await db.delete(runEvents).where(eq(runEvents.runId, runId));
      await db.delete(auditRuns).where(eq(auditRuns.id, runId));
    } catch (err) {
      console.warn(`[runner actions.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
    }
  }
  if (createdVersionIds.length > 0) {
    // Bypasses the C-4 freeze trigger (D-081); see budget.test.ts's comment.
    await forceDeleteMatrixVersions(createdVersionIds);
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
    .values({ name: "M8 Run-Mode Boundary E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 2 });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  createdVersionIds.push(draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

describe.skipIf(!dbUp)("createRun mode boundary against the dev database (C-9)", () => {
  it("server actions reject malformed ids before UUID-backed DB queries", async () => {
    const { cancelRun, createRun, fetchRunDetail, pauseRun, projectRunCost, requeueJob, resumeRun } = await import("./actions");
    const input = {
      runMode: "mock" as const,
      providers: ["mock" as const],
      modes: ["ungrounded" as const],
      repetitions: 1,
      costCapUsd: 25,
    };

    await expect(projectRunCost("not-a-uuid", input)).resolves.toMatchObject({ ok: false, error: "Invalid project id" });
    await expect(createRun("not-a-uuid", input)).resolves.toEqual({ ok: false, error: "Invalid project id" });
    await expect(pauseRun("00000000-0000-4000-8000-000000000000", "not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid project or run id" });
    await expect(resumeRun("00000000-0000-4000-8000-000000000000", "not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid project or run id" });
    await expect(cancelRun("00000000-0000-4000-8000-000000000000", "not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid project or run id" });
    await expect(requeueJob("not-a-uuid", "also-not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid run or job id" });
    await expect(fetchRunDetail("00000000-0000-4000-8000-000000000000", "not-a-uuid")).resolves.toBeNull();
  });

  it("rejects direct repository run creation from a draft matrix version (C-4)", async () => {
    const projectId = await ensureProject();
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
    createdVersionIds.push(draft.id);

    await expect(
      createRunRepo(
        {
          projectId,
          matrixVersionId: draft.id,
          runMode: "mock",
          repetitions: 1,
          providers: ["mock"],
          modes: ["ungrounded"],
          costCapUsd: 25,
        },
        [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
        cells.length,
      ),
    ).rejects.toThrow(/approved matrix/i);
  });

  it("defaults new audit runs to the latest approved matrix version", async () => {
    const projectId = await ensureProject();
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
    const older = await createDraftVersion(projectId, cells);
    const newer = await createDraftVersion(projectId, cells);
    createdVersionIds.push(older.id, newer.id);
    await approveVersion(projectId, older.id);
    await approveVersion(projectId, newer.id);

    const selected = await getApprovedVersionForRun(projectId);

    expect(selected?.id).toBe(newer.id);
    expect(selected?.version).toBeGreaterThan(older.version);
  });

  it("rejects direct repository run creation that bypasses C-9 and cap sanity action guards", async () => {
    await expect(
      createRunRepo(
        {
          projectId: "00000000-0000-4000-8000-000000000000",
          matrixVersionId: "00000000-0000-4000-8000-000000000000",
          runMode: "mock",
          repetitions: 1,
          providers: ["deepseek"],
          modes: ["ungrounded"],
          costCapUsd: 25,
        },
        [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
        1,
      ),
    ).rejects.toThrow(/MOCK label|C-9/);

    await expect(
      createRunRepo(
        {
          projectId: "00000000-0000-4000-8000-000000000000",
          matrixVersionId: "00000000-0000-4000-8000-000000000000",
          runMode: "live_validation",
          repetitions: 1,
          providers: ["mock"],
          modes: ["ungrounded"],
          costCapUsd: 25,
        },
        [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
        1,
      ),
    ).rejects.toThrow(/fixtures|C-9/);

    await expect(
      createRunRepo(
        {
          projectId: "00000000-0000-4000-8000-000000000000",
          matrixVersionId: "00000000-0000-4000-8000-000000000000",
          runMode: "live_validation",
          repetitions: 1,
          providers: ["deepseek"],
          modes: ["ungrounded"],
          costCapUsd: Number.NaN,
        },
        [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
        1,
      ),
    ).rejects.toThrow(/finite non-negative/);
  });

  it("rejects a mock run that includes a live provider — real spend must never hide under a MOCK label", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    const result = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock", "deepseek"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("C-9");
  });

  it("rejects a live run that includes the mock provider — fixtures must never mix into live aggregates", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    const result = await createRun(projectId, {
      runMode: "live_validation",
      providers: ["mock", "deepseek"],
      modes: ["ungrounded"],
      repetitions: 2,
      costCapUsd: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("C-9");
  });

  it("rejects a live_audit run with k != 5 (C-1: cut coverage, not repetitions)", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    const result = await createRun(projectId, {
      runMode: "live_audit",
      providers: ["deepseek"],
      modes: ["ungrounded"],
      repetitions: 2,
      costCapUsd: 25,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("k=5");
  });

  it("rejects direct RPC attempts to exceed the UI repetition/cap bounds before planning jobs", async () => {
    const { createRun, projectRunCost } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const hugeK = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 500,
      costCapUsd: 25,
    });
    expect(hugeK.ok).toBe(false);
    if (!hugeK.ok) expect(hugeK.error).toContain("1 to 5");

    const fractionalK = await projectRunCost(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1.5,
      costCapUsd: 25,
    });
    expect(fractionalK.ok).toBe(false);
    if (!fractionalK.ok) expect(fractionalK.error).toContain("integer");

    const invalidCap = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: Number.POSITIVE_INFINITY,
    });
    expect(invalidCap.ok).toBe(false);
    if (!invalidCap.ok) expect(invalidCap.error).toContain("finite");

    const unknownProvider = await projectRunCost(projectId, {
      runMode: "live_validation",
      providers: ["deepseek", "not-a-provider" as "deepseek"],
      modes: ["ungrounded"],
      repetitions: 2,
      costCapUsd: 2,
    });
    expect(unknownProvider.ok).toBe(false);
    if (!unknownProvider.ok) expect(unknownProvider.error).toContain("Unknown provider");

    const unknownMode = await projectRunCost(projectId, {
      runMode: "live_validation",
      providers: ["deepseek"],
      modes: ["ungrounded", "searchy" as "ungrounded"],
      repetitions: 2,
      costCapUsd: 2,
    });
    expect(unknownMode.ok).toBe(false);
    if (!unknownMode.ok) expect(unknownMode.error).toContain("Unknown generation mode");

    const duplicateProvider = await projectRunCost(projectId, {
      runMode: "mock",
      providers: ["mock", "mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(duplicateProvider.ok).toBe(false);
    if (!duplicateProvider.ok) expect(duplicateProvider.error).toContain("unique");

    const nonArrayProviders = await createRun(projectId, {
      runMode: "mock",
      providers: null,
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    } as unknown as Parameters<typeof createRun>[1]);
    expect(nonArrayProviders.ok).toBe(false);
    if (!nonArrayProviders.ok) expect(nonArrayProviders.error).toContain("arrays");

    const unknownRunMode = await createRun(projectId, {
      runMode: "stealth_live" as "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(unknownRunMode.ok).toBe(false);
    if (!unknownRunMode.ok) expect(unknownRunMode.error).toContain("Unknown run mode");

    const malformedInjection = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
      debugFailureInjection: { generation: { rate: 0.5, errorType: "not_a_db_enum" } },
    } as unknown as Parameters<typeof createRun>[1]);
    expect(malformedInjection.ok).toBe(false);
    if (!malformedInjection.ok) expect(malformedInjection.error).toContain("errorType");

    const invalidExtractionInjection = await projectRunCost(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
      debugFailureInjection: { extraction: { invalidRate: Number.NaN } },
    } as unknown as Parameters<typeof projectRunCost>[1]);
    expect(invalidExtractionInjection.ok).toBe(false);
    if (!invalidExtractionInjection.ok) expect(invalidExtractionInjection.error).toContain("invalidRate");

    process.env.EXTRACTION_PROVIDER = "not-a-provider";
    try {
      const invalidSecondaryProvider = await projectRunCost(projectId, {
        runMode: "live_validation",
        providers: ["deepseek"],
        modes: ["ungrounded"],
        repetitions: 2,
        costCapUsd: 2,
      });
      expect(invalidSecondaryProvider.ok).toBe(false);
      if (!invalidSecondaryProvider.ok) expect(invalidSecondaryProvider.error).toContain("not a registered provider id");
    } finally {
      delete process.env.EXTRACTION_PROVIDER;
    }
  });

  it("rejects failure injection on a live run — chaos testing is a mock-run tool (D-027)", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    const result = await createRun(projectId, {
      runMode: "live_validation",
      providers: ["deepseek"],
      modes: ["ungrounded"],
      repetitions: 2,
      costCapUsd: 2,
      debugFailureInjection: { generation: { rate: 0.5, errorType: "rate_limit" } },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("mock");
  });

  it("rejects a selection where every job would be skipped (PV-5) — the run could never finish", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    // DeepSeek has no grounded/citation path, so deepseek+grounded-only
    // would plan a run made entirely of skipped jobs.
    const result = await createRun(projectId, {
      runMode: "live_validation",
      providers: ["deepseek"],
      modes: ["grounded"],
      repetitions: 2,
      costCapUsd: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("PV-5");
  });

  it("rejects a mixed selection containing any unsupported provider/mode pair (C-10/PV-5)", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const result = await createRun(projectId, {
      runMode: "live_validation",
      providers: ["deepseek", "openai"],
      modes: ["grounded"],
      repetitions: 2,
      costCapUsd: 2,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("deepseek+grounded");
      expect(result.error).toContain("C-10");
    }
  });

  it("creates a mock/mock run with the mode persisted, and projects live cost including extraction (D-022)", async () => {
    const { createRun, fetchRunDetail, pauseRun, projectRunCost } = await import("./actions");
    const { recomputeMetrics } = await import("@/modules/analysis/actions");
    const { fetchExtractionAndMetrics } = await import("@/modules/extraction/actions");
    const { generateReportForRun } = await import("@/modules/report/actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const mockProjection = await projectRunCost(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(mockProjection.ok).toBe(true);

    const liveProjection = await projectRunCost(projectId, {
      runMode: "live_validation",
      providers: ["deepseek"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 2,
    });
    expect(liveProjection.ok).toBe(true);
    if (mockProjection.ok && liveProjection.ok) {
      expect(liveProjection.plannedCalls).toBe(mockProjection.plannedCalls);
      // Mock projects only its simulated per-call cost (nonzero on purpose —
      // the breaker tests need real cost math); live must additionally
      // carry a nonzero extraction estimate per call (D-022), which mock
      // does not (fixture extraction is $0).
      expect(liveProjection.projectedCostUsd).toBeGreaterThan(0);
      const { estimateExtractionCostUsd } = await import("@/providers/deepseek");
      expect(estimateExtractionCostUsd()).toBeGreaterThan(0);
      // The extraction share alone must be visible in the live projection.
      expect(liveProjection.projectedCostUsd).toBeGreaterThanOrEqual(
        liveProjection.plannedCalls * estimateExtractionCostUsd(),
      );
    }

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (created.ok && created.runId) {
      createdRunIds.push(created.runId);
      const crossProjectPause = await pauseRun("00000000-0000-4000-8000-000000000000", created.runId);
      expect(crossProjectPause.ok).toBe(false);
      const crossProjectDetail = await fetchRunDetail("00000000-0000-4000-8000-000000000000", created.runId);
      expect(crossProjectDetail).toBeNull();
      const crossProjectExtraction = await fetchExtractionAndMetrics("00000000-0000-4000-8000-000000000000", created.runId);
      expect(crossProjectExtraction).toBeNull();
      const crossProjectRecompute = await recomputeMetrics("00000000-0000-4000-8000-000000000000", created.runId);
      expect(crossProjectRecompute.ok).toBe(false);
      const crossProjectReport = await generateReportForRun("00000000-0000-4000-8000-000000000000", created.runId);
      expect(crossProjectReport.ok).toBe(false);
      const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
      expect(run.runMode).toBe("mock");
      expect(run.state).toBe("queued");
    }
  });

  it("projects grounded cost ABOVE the same-shape ungrounded cost — the search/grounding fee is in the cap check (Fix 1)", async () => {
    const { projectRunCost } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    // OpenAI supports both modes and charges a web-search fee only when
    // grounded — the projection must reflect that, not estimate every call
    // as ungrounded.
    const ungrounded = await projectRunCost(projectId, {
      runMode: "live_validation",
      providers: ["openai"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    const grounded = await projectRunCost(projectId, {
      runMode: "live_validation",
      providers: ["openai"],
      modes: ["grounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(ungrounded.ok && grounded.ok).toBe(true);
    if (ungrounded.ok && grounded.ok) {
      expect(grounded.projectedCostUsd).toBeGreaterThan(ungrounded.projectedCostUsd);
    }
  });

  it("attributes projected daily-budget spend to the generation provider and extraction engine separately", async () => {
    const { projectRunCost } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);
    const oldOpenAiBudget = process.env.OPENAI_DAILY_BUDGET_USD;
    const oldDeepSeekBudget = process.env.DEEPSEEK_DAILY_BUDGET_USD;
    try {
      process.env.OPENAI_DAILY_BUDGET_USD = "100";
      process.env.DEEPSEEK_DAILY_BUDGET_USD = "100";

      const projection = await projectRunCost(projectId, {
        runMode: "live_validation",
        providers: ["openai"],
        modes: ["ungrounded"],
        repetitions: 1,
        costCapUsd: 25,
      });

      expect(projection.ok).toBe(true);
      if (!projection.ok) throw new Error(projection.error);
      const openai = projection.budgets.find((b) => b.providerId === "openai");
      const deepseek = projection.budgets.find((b) => b.providerId === "deepseek");
      expect(openai?.projectedUsd).toBeGreaterThan(0);
      expect(deepseek?.projectedUsd).toBeGreaterThan(0);
      expect((openai?.projectedUsd ?? 0) + (deepseek?.projectedUsd ?? 0)).toBeCloseTo(
        projection.projectedCostUsd,
        8,
      );
    } finally {
      if (oldOpenAiBudget === undefined) delete process.env.OPENAI_DAILY_BUDGET_USD;
      else process.env.OPENAI_DAILY_BUDGET_USD = oldOpenAiBudget;
      if (oldDeepSeekBudget === undefined) delete process.env.DEEPSEEK_DAILY_BUDGET_USD;
      else process.env.DEEPSEEK_DAILY_BUDGET_USD = oldDeepSeekBudget;
    }
  });

  it("preflights active credentials on a live run — missing keys block before any spend (Fix 5)", async () => {
    const { createRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    // No OpenAI or DeepSeek credential is active in the dev DB, so a live
    // OpenAI run (which also needs the DeepSeek extraction engine's key)
    // must be rejected up front rather than half-run.
    const result = await createRun(projectId, {
      runMode: "live_validation",
      providers: ["openai"],
      modes: ["ungrounded"],
      repetitions: 2,
      costCapUsd: 25,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("active credential");
  });

  it("rejects requeueing a dead-lettered job from a completed run", async () => {
    const { createRun, requeueJob } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    const [job] = await db.select().from(jobs).where(eq(jobs.runId, created.runId)).limit(1);
    await db.update(jobs).set({ state: "dead_lettered", lastErrorType: "server_error" }).where(eq(jobs.id, job.id));
    await db
      .update(auditRuns)
      .set({ state: "completed", completedAt: new Date() })
      .where(eq(auditRuns.id, created.runId));

    const result = await requeueJob(created.runId, job.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("finalized");

    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    const [jobAfter] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(runAfter.state).toBe("completed");
    expect(runAfter.completedAt).not.toBeNull();
    expect(jobAfter.state).toBe("dead_lettered");
    expect(jobAfter.lastErrorType).toBe("server_error");
  });

  it("requeues a dead-lettered job from a paused run without implicitly resuming spend", async () => {
    const { createRun, requeueJob } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    const [job] = await db.select().from(jobs).where(eq(jobs.runId, created.runId)).limit(1);
    await db.update(jobs).set({ state: "dead_lettered", lastErrorType: "server_error" }).where(eq(jobs.id, job.id));
    await db.update(auditRuns).set({ state: "paused" }).where(eq(auditRuns.id, created.runId));

    const result = await requeueJob(created.runId, job.id);
    expect(result.ok).toBe(true);

    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    const [jobAfter] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    expect(runAfter.state).toBe("paused");
    expect(jobAfter.state).toBe("queued");
    expect(jobAfter.attemptCount).toBe(0);
    expect(jobAfter.lastErrorType).toBeNull();
  });

  it("records a late in-flight provider result for spend without overwriting a cancelled job", async () => {
    const { cancelRun, createRun } = await import("./actions");
    const { recordCancelledProviderResult, recordSuccess } = await import("@/db/repositories/runner");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    const [job] = await db.select().from(jobs).where(eq(jobs.runId, created.runId)).limit(1);
    await db.update(auditRuns).set({ state: "running" }).where(eq(auditRuns.id, created.runId));
    await db.update(jobs).set({ state: "running", lockedAt: new Date() }).where(eq(jobs.id, job.id));

    const cancelled = await cancelRun(projectId, created.runId);
    expect(cancelled.ok).toBe(true);

    await expect(
      recordSuccess(job, {
        modelVersion: "mock",
        rawText: "late response after cancellation",
        citations: [],
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.25,
        latencyMs: 1,
      }),
    ).rejects.toThrow(/no longer running/i);
    const responseId = await recordCancelledProviderResult(job, {
      modelVersion: "mock",
      rawText: "late response after cancellation",
      citations: [],
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.25,
      latencyMs: 1,
    });
    const duplicateResponseId = await recordCancelledProviderResult(job, {
      modelVersion: "mock",
      rawText: "late duplicate response after cancellation",
      citations: [],
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0.25,
      latencyMs: 1,
    });

    const [jobAfter] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    const responseRows = await db.select().from(responses).where(eq(responses.jobId, job.id));
    expect(jobAfter.state).toBe("cancelled");
    expect(responseId).toBe(responseRows[0]?.id);
    expect(duplicateResponseId).toBeNull();
    expect(responseRows).toHaveLength(1);
    expect(responseRows[0].rawText).toBe("late response after cancellation");
    expect(Number(runAfter.actualCostUsd)).toBeCloseTo(0.25);
  });

  it("pre-call spend guard pauses the run and releases the claimed job before another provider call", async () => {
    const { createRun } = await import("./actions");
    const { pauseRunBeforeProviderSpend } = await import("@/db/repositories/runner");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    const [job] = await db.select().from(jobs).where(eq(jobs.runId, created.runId)).limit(1);
    await db.update(auditRuns).set({ state: "running" }).where(eq(auditRuns.id, created.runId));
    await db.update(jobs).set({ state: "running", lockedAt: new Date() }).where(eq(jobs.id, job.id));

    const result = await pauseRunBeforeProviderSpend(
      created.runId,
      job.id,
      "Run paused before provider call because the cost guard was already tripped (C-2)",
    );

    const [jobAfter] = await db.select().from(jobs).where(eq(jobs.id, job.id));
    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    expect(result).toEqual({ released: 1, paused: 1 });
    expect(runAfter.state).toBe("paused");
    expect(jobAfter.state).toBe("queued");
    expect(jobAfter.lockedAt).toBeNull();
    expect(jobAfter.lastErrorType).toBe("server_error");
    expect(jobAfter.lastErrorMessage).toContain("cost guard");
  });

  it("blocks resuming a live run that has already reached its cost cap", async () => {
    const { createRun, resumeRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    await db
      .update(auditRuns)
      .set({
        state: "paused",
        runMode: "live_validation",
        selectedProvidersJson: ["deepseek"],
        selectedModesJson: ["ungrounded"],
        actualCostUsd: "25",
        costCapUsd: "25",
      })
      .where(eq(auditRuns.id, created.runId));

    const result = await resumeRun(projectId, created.runId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("cost cap");
    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    expect(runAfter.state).toBe("paused");
  });

  it("reports lifecycle actions as errors when no run state transition is valid", async () => {
    const { cancelRun, createRun, pauseRun, resumeRun } = await import("./actions");
    const projectId = await ensureProject();
    await ensureApprovedVersion(projectId);

    const created = await createRun(projectId, {
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 25,
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.runId) throw new Error("expected run id");
    createdRunIds.push(created.runId);

    await db
      .update(auditRuns)
      .set({ state: "completed", completedAt: new Date() })
      .where(eq(auditRuns.id, created.runId));

    const pause = await pauseRun(projectId, created.runId);
    expect(pause.ok).toBe(false);
    if (!pause.ok) expect(pause.error).toContain("not pausable");

    const resume = await resumeRun(projectId, created.runId);
    expect(resume.ok).toBe(false);
    if (!resume.ok) expect(resume.error).toContain("not paused");

    const cancel = await cancelRun(projectId, created.runId);
    expect(cancel.ok).toBe(false);
    if (!cancel.ok) expect(cancel.error).toContain("not cancellable");

    const [runAfter] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
    expect(runAfter.state).toBe("completed");
  });
});
