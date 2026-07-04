import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { PROVIDER_DOWN_DEAD_LETTERS } from "@/core/constants";
import { allocateMatrix } from "@/core/matrix";
import { isPartial, isProviderDown } from "@/core/runner";
import { db, pool } from "@/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import {
  claimJobs,
  completeRun,
  createRun,
  getBreakerCounts,
  getRun,
  getRunFailureCounts,
  isRunFinished,
  listRunEvents,
  recordDeadLetter,
  recordSuccess,
} from "@/db/repositories/runner";
import { auditRuns, jobs, matrixVersions, projects, promptCells, responses, runEvents } from "@/db/schema";
import { handleProviderDownAfterDeadLetter } from "./degradation";

// M9 acceptance: "provider-down degrades gracefully" (D-042). A two-provider
// live run where one provider is fully dead must finish PARTIAL on the
// healthy provider's results — never brick behind the run-wide breaker.
// All outcomes fabricated via direct repo calls (no network, no worker
// process); self-skips without Postgres.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m9-provider-down-e2e";
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
      console.warn(`[degradation.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
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
    .values({ name: "M9 Provider Down E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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

async function ensureApprovedVersion(projectId: string, target: number) {
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
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  createdVersionIds.push(draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

/** Claims jobs for a provider within one run only (claimJobs is run-agnostic). */
async function claimForRun(runId: string, providerId: string) {
  for (let guard = 0; guard < 50; guard++) {
    const claimed = await claimJobs(providerId, 1);
    if (claimed.length === 0) return null;
    if (claimed[0].runId === runId) return claimed[0];
  }
  return null;
}

describe("isProviderDown (D-042)", () => {
  it("requires BOTH zero successes and the dead-letter threshold", () => {
    expect(isProviderDown(0, PROVIDER_DOWN_DEAD_LETTERS)).toBe(true);
    expect(isProviderDown(0, PROVIDER_DOWN_DEAD_LETTERS - 1)).toBe(false);
    // A provider that succeeded earlier then degrades is NOT "down" — the
    // run-wide breaker still guards that case.
    expect(isProviderDown(1, PROVIDER_DOWN_DEAD_LETTERS * 2)).toBe(false);
  });
});

describe.skipIf(!dbUp)("provider-down degradation against the dev database (D-042)", () => {
  it("one dead provider in a two-provider run: its jobs skip, the healthy provider finishes, run completes PARTIAL, breaker never fires", async () => {
    const projectId = await ensureProject();
    // 6 cells x k=2 = 12 jobs per provider — enough that the dead provider
    // still has queued jobs left to skip after 5 dead-letters.
    const version = await ensureApprovedVersion(projectId, 6);
    const run = await createRun(
      {
        projectId,
        matrixVersionId: version.id,
        runMode: "live_validation",
        repetitions: 2,
        providers: ["deepseek", "openai"],
        modes: ["ungrounded"],
        costCapUsd: 25,
        debugFailureInjection: null,
      },
      [
        { id: "deepseek", supportsGrounded: false, supportsUngrounded: true },
        { id: "openai", supportsGrounded: true, supportsUngrounded: true },
      ],
      version.cellCount * 2 * 2,
    );
    createdRunIds.push(run.id);

    // DeepSeek is "down": dead-letter its jobs one at a time, running the
    // worker's post-dead-letter hook exactly as the worker would.
    let downTriggered = false;
    for (let i = 0; i < PROVIDER_DOWN_DEAD_LETTERS; i++) {
      const job = await claimForRun(run.id, "deepseek");
      expect(job).not.toBeNull();
      await recordDeadLetter(job!.id, 3, "auth_error", "no credential — provider dead");
      const result = await handleProviderDownAfterDeadLetter(run.id, "deepseek");
      if (i < PROVIDER_DOWN_DEAD_LETTERS - 1) {
        expect(result.providerDown).toBe(false); // below threshold: nothing skipped
      } else {
        expect(result.providerDown).toBe(true);
        expect(result.skippedJobs).toBeGreaterThan(0);
        downTriggered = true;
      }
    }
    expect(downTriggered).toBe(true);

    // No deepseek jobs remain claimable in this run.
    expect(await claimForRun(run.id, "deepseek")).toBeNull();

    // The provider_down run event is on the record.
    const events = await listRunEvents(run.id, 100);
    expect(events.some((e) => e.eventType === "provider_down")).toBe(true);

    // OpenAI (healthy) finishes all its jobs — fabricated successes, no network.
    for (let guard = 0; guard < 100; guard++) {
      const job = await claimForRun(run.id, "openai");
      if (!job) break;
      await recordSuccess(job, {
        modelVersion: "gpt-5.5",
        rawText: `fabricated healthy answer ${guard}`,
        citations: [],
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.001,
        latencyMs: 5,
      });
    }

    // D-042's whole point, in three asserts: the breaker sees a healthy
    // run (downed provider excluded)...
    const breakerCounts = await getBreakerCounts(run.id);
    expect(breakerCounts.deadLettered).toBe(0);
    expect(breakerCounts.succeeded).toBe(version.cellCount * 2);
    // ...the raw record keeps the full damage visible (partial derivation)...
    const rawCounts = await getRunFailureCounts(run.id);
    expect(rawCounts.deadLettered).toBe(PROVIDER_DOWN_DEAD_LETTERS);
    expect(isPartial(rawCounts.deadLettered, rawCounts.cancelled)).toBe(true);
    // ...and the run can actually finish instead of sitting paused.
    expect(await isRunFinished(run.id)).toBe(true);
    await completeRun(run.id);
    const finished = await getRun(run.id);
    expect(finished?.state).toBe("completed");
  }, 60_000);

  it("persistence_error dead-letters (DB fault after a successful call) never mark a provider down (C2)", async () => {
    const projectId = await ensureProject();
    const version = await ensureApprovedVersion(projectId, 6);
    const run = await createRun(
      {
        projectId,
        matrixVersionId: version.id,
        runMode: "live_validation",
        repetitions: 2,
        providers: ["deepseek"],
        modes: ["ungrounded"],
        costCapUsd: 25,
        debugFailureInjection: null,
      },
      [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
      version.cellCount * 2,
    );
    createdRunIds.push(run.id);

    // Dead-letter well past the down threshold, all as persistence_error — a
    // DB fault, not a provider fault. The provider must NOT be marked down,
    // because getProviderOutcomeCounts excludes persistence_error.
    for (let i = 0; i < PROVIDER_DOWN_DEAD_LETTERS + 1; i++) {
      const job = await claimForRun(run.id, "deepseek");
      expect(job).not.toBeNull();
      await recordDeadLetter(job!.id, 3, "persistence_error", "DB fault persisting response");
      const result = await handleProviderDownAfterDeadLetter(run.id, "deepseek");
      expect(result.providerDown).toBe(false);
      expect(result.skippedJobs).toBe(0);
    }

    // No provider_down event was ever logged, and queued jobs remain claimable.
    const events = await listRunEvents(run.id, 100);
    expect(events.some((e) => e.eventType === "provider_down")).toBe(false);
    expect(await claimForRun(run.id, "deepseek")).not.toBeNull();
  }, 60_000);
});
