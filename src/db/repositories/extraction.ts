import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { auditRuns, brandMentions, brands, claimsFound, extractions, factClaims, responses } from "../schema";

export async function getResponse(responseId: string) {
  const [row] = await db.select().from(responses).where(eq(responses.id, responseId));
  return row ?? null;
}

export async function getProjectBrandsForRun(projectId: string) {
  return db
    .select({ id: brands.id, role: brands.role, name: brands.name, aliasesJson: brands.aliasesJson })
    .from(brands)
    .where(eq(brands.projectId, projectId));
}

export async function getProjectFactClaims(projectId: string) {
  return db
    .select({ id: factClaims.id, type: factClaims.type, statement: factClaims.statement })
    .from(factClaims)
    .where(eq(factClaims.projectId, projectId));
}

export async function createPendingExtraction(responseId: string, extractionVersion: number) {
  const [row] = await db
    .insert(extractions)
    .values({ responseId, extractionVersion, state: "pending" })
    .returning({ id: extractions.id });
  return row.id;
}

export async function getLatestExtractionVersion(responseId: string): Promise<number> {
  const [row] = await db
    .select({ extractionVersion: extractions.extractionVersion })
    .from(extractions)
    .where(eq(extractions.responseId, responseId))
    .orderBy(desc(extractions.extractionVersion))
    .limit(1);
  return row?.extractionVersion ?? 0;
}

export async function markExtractionRetrying(extractionId: string, validationError: string) {
  await db
    .update(extractions)
    .set({ state: "retrying", validationError, updatedAt: new Date() })
    .where(eq(extractions.id, extractionId));
}

export async function markExtractionDeadLettered(extractionId: string, validationError: string) {
  await db
    .update(extractions)
    .set({ state: "dead_lettered", validationError, updatedAt: new Date() })
    .where(eq(extractions.id, extractionId));
}

interface DerivedBrandMention {
  brandId: string | null;
  observedName: string;
  position: number | null;
  recommended: boolean;
  recommendationStrength: "strong" | "soft" | "neutral" | "discouraged";
  sentiment: "positive" | "neutral" | "mixed" | "negative";
  attributes: string[];
  evidenceQuote: string;
}

interface DerivedClaim {
  brandId: string | null;
  factClaimId: string | null;
  claimText: string;
  claimType: "pricing" | "feature" | "company_fact" | "security" | "availability" | "other";
  verdict: "supported" | "contradicted" | "outdated" | "unsupported" | "ambiguous" | "not_checked";
  severity: "none" | "low" | "medium" | "high";
  evidenceQuote: string;
}

/**
 * SM-1/C-3: persist a valid extraction and its derived rows atomically.
 * brand_mentions/claims_found are rebuilt from scratch on every
 * (re-)extraction, per the schema's "derived, rebuilt on re-extraction" rule.
 */
export async function commitValidExtraction(
  extractionId: string,
  extractedJson: unknown,
  extractionModel: string,
  mentions: DerivedBrandMention[],
  claims: DerivedClaim[],
) {
  await db.transaction(async (tx) => {
    await tx
      .update(extractions)
      .set({
        state: "valid",
        extractedJson,
        extractionModel,
        validationError: null,
        updatedAt: new Date(),
      })
      .where(eq(extractions.id, extractionId));

    await tx.delete(brandMentions).where(eq(brandMentions.extractionId, extractionId));
    for (const m of mentions) {
      await tx.insert(brandMentions).values({
        extractionId,
        brandId: m.brandId,
        observedName: m.observedName,
        position: m.position,
        recommended: m.recommended,
        recommendationStrength: m.recommendationStrength,
        sentiment: m.sentiment,
        attributesJson: m.attributes,
        evidenceQuote: m.evidenceQuote,
      });
    }

    await tx.delete(claimsFound).where(eq(claimsFound.extractionId, extractionId));
    for (const c of claims) {
      await tx.insert(claimsFound).values({
        extractionId,
        brandId: c.brandId,
        factClaimId: c.factClaimId,
        claimText: c.claimText,
        claimType: c.claimType,
        extractedVerdict: c.verdict,
        extractedSeverity: c.severity,
        evidenceQuote: c.evidenceQuote,
      });
    }
  });
}

/**
 * D-022: a live extraction call is billed whether or not its JSON validates
 * against our schema, so cost is recorded per attempt (called right after
 * the live call returns), independent of the retry/dead-letter/valid state
 * transition. Accumulates on both the extraction row (this version's total
 * across retries) and the run's actual_cost_usd (the cost-cap/daily-budget
 * source of truth), atomically.
 */
export async function recordExtractionAttemptCost(
  runId: string,
  extractionId: string,
  cost: { costUsd: number; tokensIn: number; tokensOut: number },
) {
  await db.transaction(async (tx) => {
    await tx
      .update(extractions)
      .set({
        costUsd: sql`${extractions.costUsd} + ${cost.costUsd}`,
        tokensIn: sql`${extractions.tokensIn} + ${cost.tokensIn}`,
        tokensOut: sql`${extractions.tokensOut} + ${cost.tokensOut}`,
        updatedAt: new Date(),
      })
      .where(eq(extractions.id, extractionId));
    await tx
      .update(auditRuns)
      .set({
        actualCostUsd: sql`${auditRuns.actualCostUsd} + ${cost.costUsd}`,
        updatedAt: new Date(),
      })
      .where(eq(auditRuns.id, runId));
  });
}

export async function getExtractionForResponse(responseId: string) {
  const [row] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.responseId, responseId))
    .orderBy(desc(extractions.extractionVersion))
    .limit(1);
  return row ?? null;
}

/** AD-2: dead-lettered extractions across recent runs, for the Debug console. */
export async function listDeadLetteredExtractions(limit = 50) {
  return db
    .select({
      id: extractions.id,
      responseId: extractions.responseId,
      extractionVersion: extractions.extractionVersion,
      validationError: extractions.validationError,
      updatedAt: extractions.updatedAt,
      runId: responses.runId,
      providerId: responses.providerId,
    })
    .from(extractions)
    .innerJoin(responses, eq(responses.id, extractions.responseId))
    .where(eq(extractions.state, "dead_lettered"))
    .orderBy(desc(extractions.updatedAt))
    .limit(limit);
}

export async function getExtractionProgress(runId: string) {
  const rows = await db
    .select({ state: extractions.state })
    .from(extractions)
    .innerJoin(responses, eq(responses.id, extractions.responseId))
    .where(eq(responses.runId, runId));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.state] = (counts[row.state] ?? 0) + 1;
  return counts;
}

/**
 * D-014 eligible samples for a run: latest extraction per response is
 * valid/qa_reviewed and refusal: false. Returns everything the metrics
 * layer needs, joined once.
 */
export async function getEligibleExtractionsForRun(runId: string) {
  const allResponses = await db
    .select({ id: responses.id, cellId: responses.cellId, providerId: responses.providerId, generationMode: responses.generationMode })
    .from(responses)
    .where(eq(responses.runId, runId));
  if (allResponses.length === 0) return [];

  const responseIds = allResponses.map((r) => r.id);
  const allExtractions = await db
    .select()
    .from(extractions)
    .where(inArray(extractions.responseId, responseIds));

  // Latest version per response, valid/qa_reviewed, refusal: false (D-014).
  const latestByResponse = new Map<string, (typeof allExtractions)[number]>();
  for (const ext of allExtractions) {
    const current = latestByResponse.get(ext.responseId);
    if (!current || ext.extractionVersion > current.extractionVersion) {
      latestByResponse.set(ext.responseId, ext);
    }
  }

  const eligible: Array<{
    responseId: string;
    cellId: string;
    providerId: string;
    generationMode: string;
    extractionId: string;
    extractedJson: unknown;
  }> = [];
  for (const response of allResponses) {
    const ext = latestByResponse.get(response.id);
    if (!ext) continue;
    if (ext.state !== "valid" && ext.state !== "qa_reviewed") continue;
    const payload = ext.extractedJson as { refusal?: boolean } | null;
    if (!payload || payload.refusal) continue;
    eligible.push({
      responseId: response.id,
      cellId: response.cellId,
      providerId: response.providerId,
      generationMode: response.generationMode,
      extractionId: ext.id,
      extractedJson: ext.extractedJson,
    });
  }
  return eligible;
}

export async function getBrandMentionsForExtractions(extractionIds: string[]) {
  if (extractionIds.length === 0) return [];
  return db.select().from(brandMentions).where(inArray(brandMentions.extractionId, extractionIds));
}

export async function getClaimsForExtractions(extractionIds: string[]) {
  if (extractionIds.length === 0) return [];
  return db.select().from(claimsFound).where(inArray(claimsFound.extractionId, extractionIds));
}

/** AD-2: requeue a dead-lettered extraction for another attempt (new version). */
export async function requeueExtraction(responseId: string) {
  const nextVersion = (await getLatestExtractionVersion(responseId)) + 1;
  return createPendingExtraction(responseId, nextVersion);
}

/**
 * Reconcile sweep input: stored responses with no extraction row at all.
 * These exist when the worker dies between committing a response and
 * committing its extraction, when extraction throws outside its own
 * retry contract, or when responses predate the extraction pipeline.
 * The age threshold keeps the sweep from racing an in-flight synchronous
 * extraction that's about to commit.
 */
export async function listResponsesMissingExtraction(olderThanMs: number, limit: number) {
  const threshold = new Date(Date.now() - olderThanMs);
  const rows = await db.execute<{ id: string }>(
    sql`
      select r.id
      from ${responses} r
      left join ${extractions} e on e.response_id = r.id
      where e.id is null and r.created_at < ${threshold}
      order by r.created_at asc
      limit ${limit}
    `,
  );
  return rows.rows.map((r) => r.id);
}
