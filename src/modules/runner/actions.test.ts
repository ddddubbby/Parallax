import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { auditRuns, jobs, matrixVersions, projects, promptCells, runEvents } from "@/db/schema";

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
      await db.delete(jobs).where(eq(jobs.runId, runId));
      await db.delete(runEvents).where(eq(runEvents.runId, runId));
      await db.delete(auditRuns).where(eq(auditRuns.id, runId));
    } catch (err) {
      console.warn(`[runner actions.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
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

  it("creates a mock/mock run with the mode persisted, and projects live cost including extraction (D-022)", async () => {
    const { createRun, projectRunCost } = await import("./actions");
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
      const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, created.runId));
      expect(run.runMode).toBe("mock");
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
});
