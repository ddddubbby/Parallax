import { and, desc, eq, inArray } from "drizzle-orm";
import { containsPhrase } from "@/core/intake";
import type { Intent } from "@/core/matrix";
import { metricIntentFilter } from "@/core/semantic";
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
  matrixVersions,
} from "../schema";
import {
  getBrandMentionsForExtractions,
  getClaimsForExtractions,
  getEligibleExtractionForResponse,
  getEligibleExtractionsForRun,
} from "./extraction";

export async function listCompletedRuns(projectId: string, options: { includePaused?: boolean } = {}) {
  const states: Array<(typeof auditRuns.$inferSelect)["state"]> =
    options.includePaused === false ? ["completed"] : ["completed", "paused"];
  return db
    .select({
      id: auditRuns.id,
      state: auditRuns.state,
      runMode: auditRuns.runMode,
      failureRate: auditRuns.failureRate,
      createdAt: auditRuns.createdAt,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        inArray(auditRuns.state, states),
      ),
    )
    .orderBy(desc(auditRuns.createdAt));
}

export async function getRunForDashboard(runId: string) {
  const [run] = await db
    .select({ run: auditRuns })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.id, runId),
        eq(matrixVersions.kind, "audit"),
        inArray(auditRuns.state, ["completed", "paused"]),
      ),
    );
  return run?.run ?? null;
}

export async function listCompletedResonanceRuns(projectId: string, options: { includePaused?: boolean } = {}) {
  const states: Array<(typeof auditRuns.$inferSelect)["state"]> =
    options.includePaused === false ? ["completed"] : ["completed", "paused"];
  return db
    .select({
      id: auditRuns.id,
      state: auditRuns.state,
      runMode: auditRuns.runMode,
      failureRate: auditRuns.failureRate,
      createdAt: auditRuns.createdAt,
      resonanceStudyId: matrixVersions.resonanceStudyId,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "resonance"),
        inArray(auditRuns.state, states),
      ),
    )
    .orderBy(desc(auditRuns.createdAt));
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
  const eligible = await getEligibleExtractionsForRun(runId);
  const eligibleExtractionIds = eligible.map((row) => row.extractionId);
  if (eligibleExtractionIds.length === 0) return [];

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
    .leftJoin(factClaims, eq(factClaims.id, claimsFound.factClaimId))
    .where(inArray(claimsFound.extractionId, eligibleExtractionIds));

  return rows.filter((r) => {
    const verdict = r.operatorVerdict ?? r.extractedVerdict;
    return verdict === "contradicted" || verdict === "unsupported" || verdict === "outdated";
  });
}

type ClaimVerdict = (typeof claimsFound.$inferInsert)["extractedVerdict"];
type ClaimSeverity = (typeof claimsFound.$inferInsert)["extractedSeverity"];

/**
 * SM-5 / D-024: record the operator's review of one misinformation claim.
 * "confirmed" accepts the extracted verdict/severity as-is (overrides
 * cleared); "corrected" stores operator overrides beside — never over —
 * the extracted values. reviewed_at is set on any move out of unreviewed,
 * which is exactly what the release checklist's evidence-chain gate reads.
 * (claims_found rows are derived and rebuilt on re-extraction — an AD-2
 * re-extract resets review, which is correct: it produces a new claim.)
 */
export async function reviewClaim(
  runId: string,
  claimId: string,
  input:
    | { reviewState: "confirmed" }
    | { reviewState: "corrected"; operatorVerdict: ClaimVerdict; operatorSeverity: ClaimSeverity }
    | { reviewState: "unreviewed" },
): Promise<number> {
  const eligible = await getEligibleExtractionsForRun(runId);
  const eligibleExtractionIds = eligible.map((row) => row.extractionId);
  if (eligibleExtractionIds.length === 0) return 0;

  const patch =
    input.reviewState === "corrected"
      ? {
          reviewState: "corrected" as const,
          operatorVerdict: input.operatorVerdict,
          operatorSeverity: input.operatorSeverity,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        }
      : input.reviewState === "confirmed"
        ? {
            reviewState: "confirmed" as const,
            operatorVerdict: null,
            operatorSeverity: null,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            reviewState: "unreviewed" as const,
            operatorVerdict: null,
            operatorSeverity: null,
            reviewedAt: null,
            updatedAt: new Date(),
          };
  const scopedClaim = db
    .select({ id: claimsFound.id })
    .from(claimsFound)
    .where(and(eq(claimsFound.id, claimId), inArray(claimsFound.extractionId, eligibleExtractionIds)));

  const updated = await db.update(claimsFound).set(patch).where(inArray(claimsFound.id, scopedClaim)).returning({ id: claimsFound.id });
  return updated.length;
}

/**
 * DB-1 cited sources: citation domains aggregated by whether they cite the
 * client brand, a competitor, or both — drawn from the RESOLVED extraction
 * (D-031), so cited_for_brand_ids are real row ids, not observed names.
 */
export async function getCitedSources(runId: string) {
  const run = await getRunForDashboard(runId);
  if (!run) return [];
  const [eligible, projectBrands] = await Promise.all([
    getEligibleExtractionsForRun(runId),
    db.select({ id: brands.id, role: brands.role }).from(brands).where(eq(brands.projectId, run.projectId)),
  ]);
  const clientBrandId = projectBrands.find((brand) => brand.role === "client")?.id ?? null;
  const competitorBrandIds = new Set(projectBrands.filter((brand) => brand.role === "competitor").map((brand) => brand.id));
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
      if (clientBrandId && citation.cited_for_brand_ids.includes(clientBrandId)) {
        entry.citesClient++;
      }
      if (citation.cited_for_brand_ids.some((id) => competitorBrandIds.has(id))) {
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
  scopeType?: string;
  scopeKey?: string;
  metricKey?: string;
}

/** DB-2 drill-down (click 1): responses matching a dashboard figure's scope. */
export async function getResponsesForScope(runId: string, filter: DrilldownFilter, limit = 25) {
  const run = await getRunForDashboard(runId);
  if (!run) return [];

  const [cellRows, eligible] = await Promise.all([
    db
      .select({ id: promptCells.id, intent: promptCells.intent, personaId: promptCells.personaId, marketId: promptCells.marketId })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, run.matrixVersionId)),
    getEligibleExtractionsForRun(runId),
  ]);

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
  const scopedEligibleResponseIds = eligible
    .filter((r) => {
      if (!matchingCellIds.has(r.cellId)) return false;
      if (filter.providerId && r.providerId !== filter.providerId) return false;
      if (filter.mode && r.generationMode !== filter.mode) return false;
      return true;
    })
    .map((r) => r.responseId);
  if (scopedEligibleResponseIds.length === 0) return [];

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
    .where(and(eq(responses.runId, runId), inArray(responses.id, scopedEligibleResponseIds)))
    .limit(limit);
}

/** TP-4: metric-specific drill-through to eligible responses behind a dashboard metric. */
export async function getResponsesForMetric(runId: string, filter: DrilldownFilter & { metricKey: string }, limit = 25) {
  const run = await getRunForDashboard(runId);
  if (!run) return [];

  const [projectBrands, eligible, cellRows] = await Promise.all([
    db.select({ id: brands.id, role: brands.role, name: brands.name }).from(brands).where(eq(brands.projectId, run.projectId)),
    getEligibleExtractionsForRun(runId),
    db
      .select({ id: promptCells.id, intent: promptCells.intent, personaId: promptCells.personaId, marketId: promptCells.marketId, resolvedText: promptCells.resolvedText })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, run.matrixVersionId)),
  ]);
  if (eligible.length === 0) return [];

  const clientBrandId = projectBrands.find((b) => b.role === "client")?.id ?? null;
  const trackedBrandIds = new Set(projectBrands.map((b) => b.id));
  const cellById = new Map(cellRows.map((c) => [c.id, c]));

  // CS-4: a per-brand-scope drill-through is about the scoped brand, not the
  // client — "Chagee mentioned" when drilling Chagee's bar. Frame filtering
  // still keys off metricKey (below), so it applies to brand scope for free.
  const subjectBrandId =
    filter.scopeType === "brand" && filter.scopeKey ? filter.scopeKey : clientBrandId;
  const subjectBrandName = projectBrands.find((b) => b.id === subjectBrandId)?.name ?? "the client";

  // D-054: the drill-through denominator must be exactly the metric's
  // denominator — same frame filter as recomputeMetrics, same intent-pure
  // exemption, same grounded gate for citations, same planted-attribute
  // exclusion. Evidence that doesn't match the number is worse than none.
  const intentPure = filter.scopeType === "intent" || filter.scopeType === "intent_persona";
  const allowedIntents = intentPure ? null : metricIntentFilter(filter.metricKey);
  const plantedAttribute = filter.metricKey.startsWith("attribute_")
    ? filter.metricKey.slice("attribute_".length)
    : null;

  const scoped = eligible
    .filter((e) => eligibleMatchesDrilldownScope(e, cellById.get(e.cellId), filter))
    .filter((e) => {
      const cell = cellById.get(e.cellId);
      if (allowedIntents && !(cell && allowedIntents.includes(cell.intent as Intent))) return false;
      if (filter.metricKey === "citation_share" && e.generationMode !== "grounded") return false;
      // Word-boundary match, same as recomputeMetrics (audit finding).
      if (plantedAttribute && containsPhrase(cell?.resolvedText ?? "", plantedAttribute)) return false;
      return true;
    })
    .sort((a, b) => a.responseId.localeCompare(b.responseId));
  if (scoped.length === 0) return [];

  const responseIds = scoped.map((e) => e.responseId);
  const extractionIds = scoped.map((e) => e.extractionId);
  const [responseRows, mentionRows, claimRows] = await Promise.all([
    db
      .select({
        id: responses.id,
        cellId: responses.cellId,
        providerId: responses.providerId,
        generationMode: responses.generationMode,
        rawText: responses.rawText,
        createdAt: responses.createdAt,
      })
      .from(responses)
      .where(inArray(responses.id, responseIds)),
    getBrandMentionsForExtractions(extractionIds),
    getClaimsForExtractions(extractionIds),
  ]);

  const responseById = new Map(responseRows.map((r) => [r.id, r]));
  const mentionsByExtraction = groupBy(mentionRows, (m) => m.extractionId);
  const claimsByExtraction = groupBy(claimRows, (c) => c.extractionId);
  const rows = [];

  for (const sample of scoped) {
    const response = responseById.get(sample.responseId);
    if (!response) continue;

    const mentions = mentionsByExtraction.get(sample.extractionId) ?? [];
    const claims = claimsByExtraction.get(sample.extractionId) ?? [];
    const trackedMentions = mentions.filter((m) => m.brandId && trackedBrandIds.has(m.brandId));
    const clientMention = trackedMentions.find((m) => m.brandId === subjectBrandId);
    const label = metricResponseLabel(filter.metricKey, sample.extractedJson, {
      clientMention,
      trackedMentionCount: trackedMentions.length,
      claims,
      clientBrandId: subjectBrandId,
      trackedBrandIds,
      subjectName: subjectBrandName,
    });
    if (!label) continue;

    rows.push({
      ...response,
      numeratorLabel: label.numeratorLabel,
      denominatorLabel: label.denominatorLabel,
    });
    if (rows.length >= limit) break;
  }

  return rows;
}

/** DB-2 drill-down (click 1) for cited sources: the specific responses that cited a domain. */
export async function getResponsesByIds(runId: string, responseIds: string[]) {
  if (responseIds.length === 0) return [];
  const eligible = await getEligibleExtractionsForRun(runId);
  const eligibleResponseIds = new Set(eligible.map((row) => row.responseId));
  const scopedResponseIds = responseIds.filter((id) => eligibleResponseIds.has(id));
  if (scopedResponseIds.length === 0) return [];
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
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(and(eq(responses.runId, runId), inArray(responses.id, scopedResponseIds), eq(matrixVersions.kind, "audit")));
}

/** DB-2 drill-down (click 2): full raw text + resolved extraction for one response. */
export async function getResponseDetail(runId: string, responseId: string) {
  const [responseRow] = await db
    .select({ response: responses })
    .from(responses)
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    // Match getRunForDashboard: dashboard loaders never surface an in-progress
    // (running/queued) run's data — only completed/paused are inspectable.
    .where(
      and(
        eq(responses.runId, runId),
        eq(responses.id, responseId),
        eq(matrixVersions.kind, "audit"),
        inArray(auditRuns.state, ["completed", "paused"]),
      ),
    );
  if (!responseRow) return null;
  const extraction = await getEligibleExtractionForResponse(runId, responseId);
  if (!extraction) return null;
  return { response: responseRow.response, extraction };
}

function eligibleMatchesDrilldownScope(
  sample: { cellId: string; providerId: string; generationMode: string },
  cell: { intent: string; personaId: string | null; marketId: string | null } | undefined,
  filter: DrilldownFilter,
): boolean {
  if (filter.providerId && sample.providerId !== filter.providerId) return false;
  if (filter.mode && sample.generationMode !== filter.mode) return false;
  if (filter.intent && cell?.intent !== filter.intent) return false;
  if (filter.personaId && cell?.personaId !== filter.personaId) return false;
  if (filter.marketId && cell?.marketId !== filter.marketId) return false;

  if (!filter.scopeType || filter.scopeType === "overall") return true;
  if (filter.scopeType === "provider") return sample.providerId === filter.scopeKey;
  if (filter.scopeType === "mode") return sample.generationMode === filter.scopeKey;
  if (filter.scopeType === "intent") return cell?.intent === filter.scopeKey;
  if (filter.scopeType === "persona") return cell?.personaId === filter.scopeKey;
  if (filter.scopeType === "market") return cell?.marketId === filter.scopeKey;
  if (filter.scopeType === "intent_persona") return `${cell?.intent}|${cell?.personaId}` === filter.scopeKey;
  if (filter.scopeType === "cell") return filter.scopeKey?.split("|")[0] === sample.cellId;
  // CS-4: brand scope spans all frame-appropriate samples (the metricKey
  // frame filter in getResponsesForMetric does the narrowing); the scope
  // itself never excludes a sample by cell attributes.
  if (filter.scopeType === "brand") return true;
  return true;
}

function metricResponseLabel(
  metricKey: string,
  extractedJson: unknown,
  input: {
    clientMention:
      | {
          recommended: boolean;
          position: number | null;
          sentiment: string;
          attributesJson: unknown;
        }
      | undefined;
    trackedMentionCount: number;
    claims: Array<{ extractedVerdict: string; operatorVerdict: string | null }>;
    clientBrandId: string | null;
    trackedBrandIds: Set<string>;
    subjectName: string;
  },
): { numeratorLabel: string; denominatorLabel: string } | null {
  // CS-4/D-056 audit: labels name the SCOPED brand (the client for overall
  // scopes, a competitor when its bar is drilled), never a hardcoded "client".
  const subject = input.subjectName;
  if (metricKey === "mention_rate") {
    return {
      numeratorLabel: input.clientMention ? `Numerator: ${subject} mentioned` : `Numerator: ${subject} absent`,
      denominatorLabel: "Denominator: unbranded eligible response (D-054)",
    };
  }
  if (metricKey === "recommendation_rate") {
    return {
      numeratorLabel: input.clientMention?.recommended ? `Numerator: ${subject} recommended` : `Numerator: ${subject} not recommended`,
      denominatorLabel: "Denominator: unbranded eligible response (D-054)",
    };
  }
  if (metricKey === "comparative_win_rate") {
    return {
      numeratorLabel: input.clientMention?.recommended ? `Numerator: ${subject} wins head-to-head` : `Numerator: ${subject} not picked`,
      denominatorLabel: "Denominator: comparison eligible response (D-054)",
    };
  }
  if (metricKey === "share_of_voice") {
    return {
      numeratorLabel: `${subject} tracked mentions: ${input.clientMention ? 1 : 0}`,
      denominatorLabel: `Tracked-brand mentions in this unbranded response: ${input.trackedMentionCount}`,
    };
  }
  if (metricKey === "avg_first_position") {
    if (!input.clientMention || input.clientMention.position === null) return null;
    return {
      numeratorLabel: `${subject} position: ${input.clientMention.position}`,
      denominatorLabel: `Denominator: unbranded responses where ${subject} is mentioned (D-054)`,
    };
  }
  if (metricKey === "citation_share") {
    const payload = extractedJson as { citations?: Array<{ cited_for_brand_ids?: string[] }> } | null;
    const citations = payload?.citations ?? [];
    const client = citations.filter((c) => c.cited_for_brand_ids?.includes(input.clientBrandId ?? "")).length;
    const tracked = citations.filter((c) => (c.cited_for_brand_ids ?? []).some((id) => input.trackedBrandIds.has(id))).length;
    return {
      numeratorLabel: `${subject} citations: ${client}`,
      denominatorLabel: `Tracked-brand citations: ${tracked}`,
    };
  }
  if (metricKey === "accuracy_rate") {
    const checked = input.claims.filter((c) => {
      const verdict = c.operatorVerdict ?? c.extractedVerdict;
      return verdict !== "not_checked" && verdict !== "ambiguous";
    });
    if (checked.length === 0) return null;
    const supported = checked.filter((c) => (c.operatorVerdict ?? c.extractedVerdict) === "supported").length;
    return {
      numeratorLabel: `Supported checked claims: ${supported}`,
      denominatorLabel: `Checked claims in this response: ${checked.length}`,
    };
  }
  if (metricKey === "stability_index") {
    return {
      numeratorLabel: "Included in repeated-sample brand-set comparison",
      denominatorLabel: "Denominator: eligible response in a repeated cell",
    };
  }
  if (metricKey.startsWith("attribute_")) {
    if (!input.clientMention) return null;
    const attribute = metricKey.slice("attribute_".length);
    const attrs = Array.isArray(input.clientMention.attributesJson) ? input.clientMention.attributesJson : [];
    return {
      numeratorLabel: attrs.includes(attribute) ? `Attribute present: ${attribute}` : `Attribute absent: ${attribute}`,
      denominatorLabel: `Denominator: ${subject}-mentioned response`,
    };
  }
  if (metricKey.startsWith("sentiment_")) {
    if (!input.clientMention) return null;
    return {
      numeratorLabel: `${subject} sentiment: ${input.clientMention.sentiment}`,
      denominatorLabel: `Denominator: ${subject}-mentioned response`,
    };
  }
  return {
    numeratorLabel: "Included in metric sample",
    denominatorLabel: "Denominator: eligible response",
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}
