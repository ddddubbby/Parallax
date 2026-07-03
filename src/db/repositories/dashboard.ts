import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../client";
import {
  auditRuns,
  brands,
  claimsFound,
  extractions,
  factClaims,
  markets,
  personas,
  promptCells,
  responses,
} from "../schema";
import { getEligibleExtractionsForRun } from "./extraction";

export async function listCompletedRuns(projectId: string) {
  return db
    .select({
      id: auditRuns.id,
      state: auditRuns.state,
      runMode: auditRuns.runMode,
      failureRate: auditRuns.failureRate,
      createdAt: auditRuns.createdAt,
    })
    .from(auditRuns)
    .where(and(eq(auditRuns.projectId, projectId), inArray(auditRuns.state, ["completed", "paused"])))
    .orderBy(desc(auditRuns.createdAt));
}

export async function getRunForDashboard(runId: string) {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId));
  return run ?? null;
}

export async function getProjectBrandNames(projectId: string) {
  return db
    .select({ id: brands.id, role: brands.role, name: brands.name })
    .from(brands)
    .where(eq(brands.projectId, projectId));
}

/**
 * DB-1 misinformation register: checkable claims about the client brand
 * with a non-supported verdict, joined to their evidence and the fact
 * they were checked against. Operator overrides win for display (SM-5),
 * but the original extracted values are always preserved alongside.
 */
export async function getMisinformationRegister(runId: string) {
  const rows = await db
    .select({
      id: claimsFound.id,
      responseId: extractions.responseId,
      claimText: claimsFound.claimText,
      claimType: claimsFound.claimType,
      extractedVerdict: claimsFound.extractedVerdict,
      extractedSeverity: claimsFound.extractedSeverity,
      operatorVerdict: claimsFound.operatorVerdict,
      operatorSeverity: claimsFound.operatorSeverity,
      reviewState: claimsFound.reviewState,
      evidenceQuote: claimsFound.evidenceQuote,
      factStatement: factClaims.statement,
      factSourceUrl: factClaims.sourceUrl,
    })
    .from(claimsFound)
    .innerJoin(extractions, eq(extractions.id, claimsFound.extractionId))
    .innerJoin(responses, eq(responses.id, extractions.responseId))
    .leftJoin(factClaims, eq(factClaims.id, claimsFound.factClaimId))
    .where(eq(responses.runId, runId));

  return rows.filter((r) => {
    const verdict = r.operatorVerdict ?? r.extractedVerdict;
    return verdict === "contradicted" || verdict === "unsupported" || verdict === "outdated";
  });
}

/**
 * DB-1 cited sources: citation domains aggregated by whether they cite the
 * client brand, a competitor, or both — drawn from the RESOLVED extraction
 * (D-031), so cited_for_brand_ids are real row ids, not observed names.
 */
export async function getCitedSources(runId: string) {
  const eligible = await getEligibleExtractionsForRun(runId);
  const domainCounts = new Map<string, { domain: string; total: number; citesClient: number; citesCompetitor: number; responseIds: Set<string> }>();

  for (const e of eligible) {
    const payload = e.extractedJson as {
      citations?: Array<{ domain: string; cited_for_brand_ids: string[] }>;
    } | null;
    for (const citation of payload?.citations ?? []) {
      if (!domainCounts.has(citation.domain)) {
        domainCounts.set(citation.domain, {
          domain: citation.domain,
          total: 0,
          citesClient: 0,
          citesCompetitor: 0,
          responseIds: new Set(),
        });
      }
      const entry = domainCounts.get(citation.domain)!;
      entry.total++;
      entry.responseIds.add(e.responseId);
      if (citation.cited_for_brand_ids.length > 0) {
        // Caller resolves which id is the client; this repo layer stays
        // brand-agnostic and just reports ids cited.
        entry.citesCompetitor++;
      }
    }
  }

  return [...domainCounts.values()]
    .map((d) => ({ ...d, responseIds: [...d.responseIds] }))
    .sort((a, b) => b.total - a.total);
}

export async function getProjectPersonasAndMarkets(projectId: string) {
  const [personaRows, marketRows] = await Promise.all([
    db.select({ id: personas.id, title: personas.title }).from(personas).where(eq(personas.projectId, projectId)),
    db.select({ id: markets.id, name: markets.name }).from(markets).where(eq(markets.projectId, projectId)),
  ]);
  return { personas: personaRows, markets: marketRows };
}

interface DrilldownFilter {
  intent?: string;
  personaId?: string;
  marketId?: string;
  providerId?: string;
  mode?: string;
}

/** DB-2 drill-down (click 1): responses matching a dashboard figure's scope. */
export async function getResponsesForScope(runId: string, filter: DrilldownFilter, limit = 25) {
  const cellRows = await db
    .select({ id: promptCells.id, intent: promptCells.intent, personaId: promptCells.personaId, marketId: promptCells.marketId })
    .from(promptCells)
    .innerJoin(auditRuns, eq(auditRuns.matrixVersionId, promptCells.matrixVersionId))
    .where(eq(auditRuns.id, runId));

  const matchingCellIds = new Set(
    cellRows
      .filter((c) => {
        if (filter.intent && c.intent !== filter.intent) return false;
        if (filter.personaId && c.personaId !== filter.personaId) return false;
        if (filter.marketId && c.marketId !== filter.marketId) return false;
        return true;
      })
      .map((c) => c.id),
  );
  if (matchingCellIds.size === 0) return [];

  const allResponses = await db
    .select({
      id: responses.id,
      cellId: responses.cellId,
      providerId: responses.providerId,
      generationMode: responses.generationMode,
      rawText: responses.rawText,
      createdAt: responses.createdAt,
    })
    .from(responses)
    .where(eq(responses.runId, runId));

  return allResponses
    .filter((r) => {
      if (!matchingCellIds.has(r.cellId)) return false;
      if (filter.providerId && r.providerId !== filter.providerId) return false;
      if (filter.mode && r.generationMode !== filter.mode) return false;
      return true;
    })
    .slice(0, limit);
}

/** DB-2 drill-down (click 1) for cited sources: the specific responses that cited a domain. */
export async function getResponsesByIds(responseIds: string[]) {
  if (responseIds.length === 0) return [];
  return db
    .select({
      id: responses.id,
      cellId: responses.cellId,
      providerId: responses.providerId,
      generationMode: responses.generationMode,
      rawText: responses.rawText,
      createdAt: responses.createdAt,
    })
    .from(responses)
    .where(inArray(responses.id, responseIds));
}

/** DB-2 drill-down (click 2): full raw text + resolved extraction for one response. */
export async function getResponseDetail(responseId: string) {
  const [response] = await db.select().from(responses).where(eq(responses.id, responseId));
  if (!response) return null;
  const [extraction] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.responseId, responseId))
    .orderBy(desc(extractions.extractionVersion))
    .limit(1);
  return { response, extraction: extraction ?? null };
}
