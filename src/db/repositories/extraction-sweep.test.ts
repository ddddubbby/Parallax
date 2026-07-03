import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import {
  createPendingExtraction,
  listResponsesWithStaleExtraction,
  markExtractionRetrying,
} from "@/db/repositories/extraction";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { claimJobs, createRun, recordSuccess } from "@/db/repositories/runner";
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
import { reExtractResponse } from "@/modules/extraction/service";
import { mockProvider } from "@/providers/mock";

// Fix B (post-M10-prep audit round 2): listResponsesMissingExtraction only
// catches responses with NO extraction row at all. A worker crash between
// createPendingExtraction/markExtractionRetrying and the pipeline's next
// state transition leaves a torn row (state pending/retrying forever) that
// was invisible to that query and never reconciled. This proves the new
// listResponsesWithStaleExtraction query finds it and reExtractResponse
// clears it via a fresh version.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m10-stale-extraction-e2e";
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
      console.warn(`[extraction-sweep.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
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
    .values({ name: "M10 Stale Extraction E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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

async function createFabricatedResponse() {
  const projectId = await ensureProject();
  const version = await ensureApprovedVersion(projectId);
  const run = await createRun(
    { projectId, matrixVersionId: version.id, runMode: "mock", repetitions: 1, providers: ["mock"], modes: ["ungrounded"], costCapUsd: 25, debugFailureInjection: null },
    [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
    version.cellCount,
  );
  createdRunIds.push(run.id);
  const [job] = await claimJobs("mock", 1);
  // Real mock-provider output (matches a real fixture), so a re-extraction
  // attempt in these tests can actually succeed against the mock engine —
  // hand-written text has no matching fixture and would throw.
  const generated = await mockProvider.generate({
    promptText: job.resolvedText,
    mode: job.generationMode as "grounded" | "ungrounded",
    repIndex: job.repIndex,
  });
  const responseId = await recordSuccess(job, {
    modelVersion: generated.modelVersion,
    rawText: generated.text,
    citations: generated.citations,
    tokensIn: generated.tokensIn,
    tokensOut: generated.tokensOut,
    costUsd: generated.costUsd,
    latencyMs: generated.latencyMs,
  });
  return responseId;
}

async function ageExtraction(extractionId: string, ageMs: number) {
  await db.update(extractions).set({ updatedAt: new Date(Date.now() - ageMs) }).where(eq(extractions.id, extractionId));
}

describe.skipIf(!dbUp)("stale pending/retrying extraction sweep (Fix B)", () => {
  it("a torn 'pending' row (worker died right after createPendingExtraction) is invisible to the no-row sweep but found here", async () => {
    const responseId = await createFabricatedResponse();
    const extractionId = await createPendingExtraction(responseId, 1);
    await ageExtraction(extractionId, 5 * 60_000); // 5 minutes old

    const found = await listResponsesWithStaleExtraction(60_000, 25);
    expect(found).toContain(responseId);

    // Re-extracting clears it: a fresh version replaces the torn one, and
    // the response is no longer stuck.
    const result = await reExtractResponse(responseId);
    expect(["valid", "dead_lettered"]).toContain(result.outcome);
    const stillStale = await listResponsesWithStaleExtraction(60_000, 25);
    expect(stillStale).not.toContain(responseId);
  });

  it("a torn 'retrying' row is also found", async () => {
    const responseId = await createFabricatedResponse();
    const extractionId = await createPendingExtraction(responseId, 1);
    await markExtractionRetrying(extractionId, "simulated validation failure");
    await ageExtraction(extractionId, 5 * 60_000);

    const found = await listResponsesWithStaleExtraction(60_000, 25);
    expect(found).toContain(responseId);
  });

  it("a fresh (not-yet-old) pending row is NOT swept — avoids racing an in-flight synchronous attempt", async () => {
    const responseId = await createFabricatedResponse();
    await createPendingExtraction(responseId, 1);
    // No aging: updated_at is "now", well within the threshold.
    const found = await listResponsesWithStaleExtraction(60_000, 25);
    expect(found).not.toContain(responseId);
  });

  it("a response whose latest extraction is already 'valid' is never swept, even if old", async () => {
    const responseId = await createFabricatedResponse();
    const extractionId = await createPendingExtraction(responseId, 1);
    await db.update(extractions).set({ state: "valid", updatedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(extractions.id, extractionId));
    const found = await listResponsesWithStaleExtraction(60_000, 25);
    expect(found).not.toContain(responseId);
  });
});
