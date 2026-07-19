import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditRuns,
  brandMentions,
  brands,
  claimsFound,
  extractions,
  jobs,
  matrixVersions,
  metrics,
  projects,
  promptCells,
  responses,
} from "@/db/schema";
import { forceDeleteMatrixVersions } from "@/db/repositories/matrix.test-helpers";
import { reResolveRunBrands } from "./re-resolve";

// M45 / D-115 P2: re-resolution creates NEW extraction versions (C-3), carries
// operator claim reviews (SM-5), is idempotent, and recomputes metrics.

const createdVersionIds: string[] = [];
const createdRunIds: string[] = [];
const createdResponseIds: string[] = [];

async function demoProject() {
  const [project] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!project) throw new Error("ledgerfox-demo not found — run pnpm db:seed first");
  const [client] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.projectId, project.id), eq(brands.role, "client")));
  return { projectId: project.id, clientBrandId: client.id, clientName: client.name };
}

// The historical failure shape: an extraction stored under the OLD exact
// matcher where a spacing/punctuation variant of the client name stayed
// unresolved (canonical_brand_id null).
function plantedBrand(observedName: string) {
  return {
    canonical_brand_id: null,
    observed_name: observedName,
    aliases_matched: [],
    mentioned: true,
    position: 1,
    recommended: true,
    recommendation_strength: "soft",
    sentiment: "positive",
    attributes: [],
    evidence_quote: `${observedName} is recommended.`,
  };
}

async function seedRunWithLegacyExtraction(projectId: string) {
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
      variantKey: "m45-reresolve-fixture",
      resolvedText: "What finance automation tools are recommended?",
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
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 1,
      costCapUsd: "1",
    })
    .returning({ id: auditRuns.id });
  createdRunIds.push(run.id);
  const [job] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      repIndex: 0,
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
      modelVersion: "mock-m45",
      rawText: "Ledger-Fox is recommended for finance teams.",
    })
    .returning({ id: responses.id });
  createdResponseIds.push(response.id);

  const payload = {
    brands: [plantedBrand("Ledger-Fox")],
    citations: [],
    claims: [],
    refusal: false,
  };
  const [extraction] = await db
    .insert(extractions)
    .values({
      responseId: response.id,
      extractionVersion: 1,
      state: "valid",
      schemaVersion: 1,
      extractionModel: "mock-fixture",
      extractedJson: payload,
    })
    .returning({ id: extractions.id });
  await db.insert(brandMentions).values({
    extractionId: extraction.id,
    brandId: null,
    observedName: "Ledger-Fox",
    position: 1,
    recommended: true,
    recommendationStrength: "soft",
    sentiment: "positive",
    attributesJson: [],
    evidenceQuote: "Ledger-Fox is recommended.",
  });
  await db.insert(claimsFound).values({
    extractionId: extraction.id,
    brandId: null,
    claimText: "Ledger-Fox launched in 2020",
    claimType: "company_fact",
    extractedVerdict: "unsupported",
    extractedSeverity: "low",
    operatorVerdict: "supported",
    reviewState: "corrected",
    reviewedAt: new Date(),
    evidenceQuote: "launched in 2020",
  });
  return { runId: run.id, responseId: response.id, extractionId: extraction.id };
}

afterAll(async () => {
  if (createdResponseIds.length > 0) {
    const extRows = await db
      .select({ id: extractions.id })
      .from(extractions)
      .where(inArray(extractions.responseId, createdResponseIds));
    const extIds = extRows.map((r) => r.id);
    if (extIds.length > 0) {
      await db.delete(claimsFound).where(inArray(claimsFound.extractionId, extIds));
      await db.delete(brandMentions).where(inArray(brandMentions.extractionId, extIds));
      await db.delete(extractions).where(inArray(extractions.id, extIds));
    }
    await db.delete(responses).where(inArray(responses.id, createdResponseIds));
  }
  for (const runId of createdRunIds) {
    await db.delete(metrics).where(eq(metrics.runId, runId));
    await db.delete(jobs).where(eq(jobs.runId, runId));
    await db.delete(auditRuns).where(eq(auditRuns.id, runId));
  }
  await forceDeleteMatrixVersions(createdVersionIds);
});

describe("reResolveRunBrands (M45 / D-115 P2)", () => {
  it("creates a new extraction version, resolves the variant, copies operator reviews, recomputes, and is idempotent", async () => {
    const { projectId, clientBrandId, clientName } = await demoProject();
    // The seeded demo client is "LedgerFox"; the planted observed name is
    // "Ledger-Fox" — resolvable only via D-115 compact matching.
    expect(clientName).toBe("LedgerFox");
    const { runId, responseId, extractionId } = await seedRunWithLegacyExtraction(projectId);

    const first = await reResolveRunBrands(projectId, runId);
    expect(first.examined).toBe(1);
    expect(first.reResolved).toBe(1);
    expect(first.clientMentionsBefore).toBe(0);
    expect(first.clientMentionsAfter).toBe(1);

    // New version exists; the original row is untouched (C-3).
    const versions = await db
      .select()
      .from(extractions)
      .where(eq(extractions.responseId, responseId))
      .orderBy(extractions.extractionVersion);
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe(extractionId);
    const v1Payload = versions[0].extractedJson as { brands: Array<{ canonical_brand_id: string | null }> };
    expect(v1Payload.brands[0].canonical_brand_id).toBeNull();
    const v2 = versions[1];
    expect(v2.extractionVersion).toBe(2);
    expect(Number(v2.costUsd)).toBe(0);
    const v2Payload = v2.extractedJson as { brands: Array<{ canonical_brand_id: string | null }> };
    expect(v2Payload.brands[0].canonical_brand_id).toBe(clientBrandId);

    // Derived mention row on the new version resolves to the client.
    const [mention] = await db.select().from(brandMentions).where(eq(brandMentions.extractionId, v2.id));
    expect(mention.brandId).toBe(clientBrandId);

    // Operator claim review survives the copy (SM-5).
    const [claim] = await db.select().from(claimsFound).where(eq(claimsFound.extractionId, v2.id));
    expect(claim.reviewState).toBe("corrected");
    expect(claim.operatorVerdict).toBe("supported");

    // Metrics were recomputed for the run.
    const metricRows = await db.select().from(metrics).where(eq(metrics.runId, runId));
    expect(metricRows.length).toBeGreaterThan(0);

    // Idempotent: nothing changes on a second pass.
    const second = await reResolveRunBrands(projectId, runId);
    expect(second.reResolved).toBe(0);
    const versionsAfter = await db
      .select({ id: extractions.id })
      .from(extractions)
      .where(eq(extractions.responseId, responseId));
    expect(versionsAfter).toHaveLength(2);
  }, 30_000);

  it("rejects a run outside the project", async () => {
    const { projectId } = await demoProject();
    await expect(
      reResolveRunBrands(projectId, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/not found/i);
  });
});
