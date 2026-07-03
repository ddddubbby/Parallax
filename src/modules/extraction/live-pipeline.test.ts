import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { saveCredential } from "@/db/repositories/credentials";
import { getExtractionForResponse } from "@/db/repositories/extraction";
import { approveVersion, createDraftVersion, getMatrixInputs } from "@/db/repositories/matrix";
import { claimJobs, createRun, getRun, recordSuccess } from "@/db/repositories/runner";
import {
  auditRuns,
  brandMentions,
  claimsFound,
  extractions,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  providerCredentials,
  responses,
  runEvents,
} from "@/db/schema";
import { encryptApiKey } from "@/modules/settings/crypto";
import { extractResponse } from "./service";

// D-022 live extraction: no real DeepSeek call — global fetch is stubbed to
// return controlled payloads, proving the wiring (branch-on-run-mode,
// cost recording on every billed attempt, retry/dead-letter reuse) without
// spending real money. Runs against the local dev database, self-skips
// without Postgres (same convention as sibling M8 integration tests).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m8-live-extraction-e2e";
const CREDENTIAL_LABEL = "test-m8-live-extraction";
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
  // Per-run try/catch: this exact loop, without the guard, once threw
  // partway through on an FK ordering miss and left all 3 of this file's
  // live_validation/deepseek runs (and their "running" jobs) orphaned —
  // real DB state a live worker would later pick up and bill against.
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
      console.warn(`[live-pipeline.test.ts afterAll] failed to clean up run ${runId}:`, err instanceof Error ? err.message : err);
    }
  }
  for (const versionId of createdVersionIds) {
    await db.delete(promptCells).where(eq(promptCells.matrixVersionId, versionId));
    await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId));
  }
  await db.delete(providerCredentials).where(eq(providerCredentials.label, CREDENTIAL_LABEL));
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
    .values({ name: "M8 Live Extraction E2E", slug: PROJECT_SLUG, category: inputs.project.category, jobToBeDone: inputs.project.jobToBeDone, status: "active" })
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

async function seedActiveCredential() {
  const enc = encryptApiKey("sk-test-live-extraction-key");
  await saveCredential({
    providerId: "deepseek",
    label: CREDENTIAL_LABEL,
    encryptedApiKey: enc.ciphertext,
    keyVersion: enc.keyVersion,
    apiKeyLast4: enc.last4,
    apiKeyFingerprint: enc.fingerprint,
  });
}

/**
 * claimJobs claims the oldest queued job for a provider across ALL runs,
 * not scoped to the run just created — with several tests reusing the same
 * approved matrix version (and its leftover unclaimed jobs) in one file,
 * naively trusting createRun's returned id would silently attribute a
 * response/cost to the wrong run. Claiming until this run's own job shows
 * up keeps each test's assertions honestly scoped to the run it created.
 */
async function startLiveRunAndResponse(rawText: string) {
  const projectId = await ensureProject();
  const version = await ensureApprovedVersion(projectId);
  const run = await createRun(
    { projectId, matrixVersionId: version.id, runMode: "live_validation", repetitions: 1, providers: ["deepseek"], modes: ["ungrounded"], costCapUsd: 25, debugFailureInjection: null },
    [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
    version.cellCount,
  );
  createdRunIds.push(run.id);

  let job: Awaited<ReturnType<typeof claimJobs>>[number] | undefined;
  for (let guard = 0; guard < 20 && !job; guard++) {
    const claimed = await claimJobs("deepseek", 1);
    if (claimed.length === 0) break;
    if (claimed[0].runId === run.id) job = claimed[0];
  }
  if (!job) throw new Error(`no queued deepseek job found for run ${run.id}`);

  const responseId = await recordSuccess(job, {
    modelVersion: "deepseek-v4-flash",
    rawText,
    citations: [],
    tokensIn: 20,
    tokensOut: 10,
    costUsd: 0.001,
    latencyMs: 5,
  });
  return { run, responseId };
}

function chatCompletionResponse(content: string, promptTokens = 200, completionTokens = 80) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
      model: "deepseek-v4-flash",
    }),
    { status: 200 },
  );
}

describe.skipIf(!dbUp)("live extraction pipeline against the dev database (D-022)", () => {
  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valid JSON on the first attempt: commits, and records cost on both the extraction row and the run", async () => {
    await seedActiveCredential();
    const { run, responseId } = await startLiveRunAndResponse("LedgerFox is a great tool for bookkeeping.");
    const beforeRun = await getRun(run.id);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        chatCompletionResponse(
          JSON.stringify({
            schema_version: 1,
            answer_summary: "Mentions LedgerFox positively.",
            brands: [
              {
                observed_name: "LedgerFox",
                aliases_matched: [],
                mentioned: true,
                position: 1,
                recommended: true,
                recommendation_strength: "strong",
                sentiment: "positive",
                attributes: ["easy to use"],
                evidence_quote: "LedgerFox is a great tool",
              },
            ],
            citations: [],
            claims: [],
            refusal: false,
            malformed: false,
          }),
        ),
      ),
    );

    const result = await extractResponse(responseId);
    expect(result.outcome).toBe("valid");
    expect(result.attempts).toBe(1);

    const ext = await getExtractionForResponse(responseId);
    expect(ext?.state).toBe("valid");
    expect(ext?.extractionModel).toBe("deepseek-v4-flash");
    expect(Number(ext?.costUsd)).toBeGreaterThan(0);

    const afterRun = await getRun(run.id);
    expect(Number(afterRun?.actualCostUsd)).toBeGreaterThan(Number(beforeRun?.actualCostUsd));
  });

  it("schema-invalid JSON on both attempts: dead-letters, but still bills and records cost for each attempt", async () => {
    await seedActiveCredential();
    const { run, responseId } = await startLiveRunAndResponse("Some other answer text.");
    const beforeRun = await getRun(run.id);

    // Missing required keys (e.g. `refusal`/`malformed`) — parses as JSON but fails Zod validation both times.
    vi.stubGlobal("fetch", vi.fn(async () => chatCompletionResponse(JSON.stringify({ schema_version: 1, brands: [] }))));

    const result = await extractResponse(responseId);
    expect(result.outcome).toBe("dead_lettered");
    expect(result.attempts).toBe(2);

    const ext = await getExtractionForResponse(responseId);
    expect(ext?.state).toBe("dead_lettered");
    expect(Number(ext?.costUsd)).toBeGreaterThan(0); // billed on both attempts despite never validating

    const afterRun = await getRun(run.id);
    expect(Number(afterRun?.actualCostUsd)).toBeGreaterThan(Number(beforeRun?.actualCostUsd));
  });

  it("a transport failure (401) is retried then dead-lettered via the catch branch, without crashing", async () => {
    await seedActiveCredential();
    const { responseId } = await startLiveRunAndResponse("Yet another answer text.");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    const result = await extractResponse(responseId);
    expect(result.outcome).toBe("dead_lettered");
    expect(result.attempts).toBe(2);

    const ext = await getExtractionForResponse(responseId);
    expect(ext?.state).toBe("dead_lettered");
    expect(ext?.validationError).toContain("401");
  });

  it("a misconfigured EXTRACTION_PROVIDER fails loudly at the first attempt, never silently (D-041)", async () => {
    await seedActiveCredential();
    const { responseId } = await startLiveRunAndResponse("Answer needing extraction.");

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.EXTRACTION_PROVIDER = "openai"; // no extraction adapter exists for it in M9
    try {
      const result = await extractResponse(responseId);
      expect(result.outcome).toBe("dead_lettered");
      const ext = await getExtractionForResponse(responseId);
      expect(ext?.validationError).toContain("EXTRACTION_PROVIDER");
      expect(fetchSpy).not.toHaveBeenCalled(); // rejected before any network/spend
    } finally {
      delete process.env.EXTRACTION_PROVIDER;
    }
  });
});
