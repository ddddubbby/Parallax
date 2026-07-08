import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { attributes, auditRuns, brandMentions, brands, claimsFound, extractions, factClaims, responses } from "../schema";

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

/**
 * M27/D-084: only ACTIVE fact claims are offered to the live extractor as
 * match targets for NEW claims_found rows (generation-input side of the
 * two-reads rule) — an archived fact-sheet row should stop being matched
 * against going forward. Historical claims_found.fact_claim_id rows still
 * resolve via getMisinformationRegister's unfiltered join (dashboard.ts),
 * which must keep showing archived-fact-claim evidence from past runs.
 */
export async function getProjectFactClaims(projectId: string) {
  return db
    .select({ id: factClaims.id, type: factClaims.type, statement: factClaims.statement })
    .from(factClaims)
    .where(and(eq(factClaims.projectId, projectId), eq(factClaims.status, "active")));
}

/** The project's desired-attribute list — given to the live extractor so it
 *  tags brands with canonical attribute names, not free-form drift. */
export async function getProjectAttributeNames(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ name: attributes.name })
    .from(attributes)
    .where(eq(attributes.projectId, projectId))
    .orderBy(asc(attributes.priority));
  return rows.map((r) => r.name);
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
  const rows = await db.execute<{
    id: string;
    responseId: string;
    extractionVersion: number;
    validationError: string | null;
    updatedAt: Date;
    runId: string;
    providerId: string;
  }>(
    sql`
      select e.id,
        e.response_id as "responseId",
        e.extraction_version as "extractionVersion",
        e.validation_error as "validationError",
        e.updated_at as "updatedAt",
        r.run_id as "runId",
        r.provider_id as "providerId"
      from ${extractions} e
      inner join ${responses} r on r.id = e.response_id
      where e.state = 'dead_lettered'
        and e.extraction_version = (
          select max(e2.extraction_version) from ${extractions} e2 where e2.response_id = e.response_id
        )
      order by e.updated_at desc
      limit ${limit}
    `,
  );
  return rows.rows;
}

export async function getExtractionProgress(runId: string) {
  const rows = await db.execute<{ state: string; n: number }>(
    sql`
      select latest.state, count(*)::int as n
      from (
        select distinct on (e.response_id) e.state
        from ${extractions} e
        inner join ${responses} r on r.id = e.response_id
        where r.run_id = ${runId}
        order by e.response_id, e.extraction_version desc
      ) latest
      group by latest.state
    `,
  );
  const counts: Record<string, number> = {};
  for (const row of rows.rows) counts[row.state] = row.n;
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

export async function getEligibleExtractionForResponse(runId: string, responseId: string) {
  const eligible = await getEligibleExtractionsForRun(runId);
  const match = eligible.find((row) => row.responseId === responseId);
  if (!match) return null;
  const [row] = await db.select().from(extractions).where(eq(extractions.id, match.extractionId));
  return row ?? null;
}

export async function getBrandMentionsForExtractions(extractionIds: string[]) {
  if (extractionIds.length === 0) return [];
  return db.select().from(brandMentions).where(inArray(brandMentions.extractionId, extractionIds));
}

export async function getClaimsForExtractions(extractionIds: string[]) {
  if (extractionIds.length === 0) return [];
  return db.select().from(claimsFound).where(inArray(claimsFound.extractionId, extractionIds));
}

/** AD-2/C-3: requeue an allowed latest extraction state as a new version. */
export async function requeueExtraction(responseId: string, allowedStates: string[] = ["dead_lettered"]) {
  return db.transaction(async (tx) => {
    const latest = await tx.execute<{ id: string; extractionVersion: number; state: string }>(
      sql`
        select id, extraction_version as "extractionVersion", state
        from ${extractions}
        where response_id = ${responseId}
        order by extraction_version desc
        limit 1
        for update
      `,
    );
    const row = latest.rows[0];
    if (!row) throw new Error("No extraction exists for this response");
    if (!allowedStates.includes(row.state)) {
      throw new Error(`Only ${allowedStates.map((state) => state.replaceAll("_", "-")).join("/")} extractions can be re-extracted`);
    }

    const [created] = await tx
      .insert(extractions)
      .values({ responseId, extractionVersion: row.extractionVersion + 1, state: "pending" })
      .returning({ id: extractions.id });
    return created.id;
  });
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
      join ${auditRuns} ar on ar.id = r.run_id
      left join ${extractions} e on e.response_id = r.id
      where e.id is null and r.created_at < ${threshold}
        and ar.state in ('queued', 'running', 'completed')
      order by r.created_at asc
      limit ${limit}
    `,
  );
  return rows.rows.map((r) => r.id);
}

/**
 * Reconcile sweep input, part 2: responses whose LATEST extraction row
 * exists but is torn — stuck in 'pending' (worker died between
 * createPendingExtraction and the pipeline running) or 'retrying' (died
 * between the retry mark and the second attempt). listResponsesMissingExtraction
 * only catches "no row at all"; a torn row has a row, just never one in a
 * terminal state, so it was invisible to that query and never got picked
 * up by anything. The age threshold (against the extraction's own
 * updated_at) avoids racing a genuinely in-flight synchronous attempt.
 */
export async function listResponsesWithStaleExtraction(olderThanMs: number, limit: number) {
  const threshold = new Date(Date.now() - olderThanMs);
  const rows = await db.execute<{ id: string }>(
    sql`
      select distinct on (e.response_id) e.response_id as id
      from ${extractions} e
      join ${responses} r on r.id = e.response_id
      join ${auditRuns} ar on ar.id = r.run_id
      where e.state in ('pending', 'retrying') and e.updated_at < ${threshold}
        and ar.state in ('queued', 'running', 'completed')
        and e.extraction_version = (
          select max(e2.extraction_version) from ${extractions} e2 where e2.response_id = e.response_id
        )
      order by e.response_id, e.updated_at asc
      limit ${limit}
    `,
  );
  return rows.rows.map((r) => r.id);
}
