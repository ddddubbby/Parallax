import { eq } from "drizzle-orm";
import {
  accuracyRate,
  attributeAssociationRate,
  avgFirstPosition,
  citationShare,
  type EligibleSample,
  mentionRate,
  meanStabilityIndex,
  recommendationRate,
  sentimentDistribution,
  type Sentiment,
  shareOfVoice,
} from "@/core/metrics";
import { stabilityIndex, topTrackedBrandSet, type ExtractedBrand } from "@/core/extraction";
import { db } from "../client";
import { attributes as attributesTable, auditRuns, brands, metrics, promptCells } from "../schema";
import {
  getBrandMentionsForExtractions,
  getClaimsForExtractions,
  getEligibleExtractionsForRun,
} from "./extraction";

type MetricScope = { scopeType: string; scopeKey: string };
const OVERALL: MetricScope = { scopeType: "overall", scopeKey: "__all__" };

interface ScopedSample extends EligibleSample {
  scopes: MetricScope[];
}

/** C-3: metrics are disposable — recompute deletes and rebuilds for the run. */
export async function recomputeMetrics(runId: string) {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId));
  if (!run) throw new Error(`run ${runId} not found`);

  const [projectBrands, eligible] = await Promise.all([
    db
      .select({ id: brands.id, role: brands.role, priority: brands.priority })
      .from(brands)
      .where(eq(brands.projectId, run.projectId)),
    getEligibleExtractionsForRun(runId),
  ]);
  const clientBrandId = projectBrands.find((b) => b.role === "client")?.id ?? null;
  const trackedBrandIds = new Set(projectBrands.map((b) => b.id));
  const extractionIds = eligible.map((e) => e.extractionId);

  const [allMentions, allClaims, cellRows, projectAttributes] = await Promise.all([
    getBrandMentionsForExtractions(extractionIds),
    getClaimsForExtractions(extractionIds),
    db.select({ id: promptCells.id, intent: promptCells.intent, personaId: promptCells.personaId, marketId: promptCells.marketId }).from(promptCells),
    db.select({ name: attributesTable.name }).from(attributesTable).where(eq(attributesTable.projectId, run.projectId)),
  ]);
  const mentionsByExtraction = groupBy(allMentions, (m) => m.extractionId);
  const claimsByExtraction = groupBy(allClaims, (c) => c.extractionId);
  const cellById = new Map(cellRows.map((c) => [c.id, c]));

  const samples: ScopedSample[] = [];
  const citationSamples: Array<{ clientCitationCount: number; trackedCitationCount: number; scopes: MetricScope[] }> = [];
  const clientSentiments: Array<{ sentiment: Sentiment; scopes: MetricScope[] }> = [];
  const clientAttributeSets: Array<{ attrs: string[]; scopes: MetricScope[] }> = [];
  const claimVerdicts: Array<{ verdict: string; scopes: MetricScope[] }> = [];
  const stabilityByCell = new Map<string, Set<string>[]>();

  for (const e of eligible) {
    const mentions = mentionsByExtraction.get(e.extractionId) ?? [];
    const trackedMentions = mentions.filter((m) => m.brandId && trackedBrandIds.has(m.brandId));
    const client = trackedMentions.find((m) => m.brandId === clientBrandId);
    const cell = cellById.get(e.cellId);

    const scopes: MetricScope[] = [
      OVERALL,
      { scopeType: "provider", scopeKey: e.providerId },
      { scopeType: "mode", scopeKey: e.generationMode },
    ];
    if (cell) {
      scopes.push({ scopeType: "intent", scopeKey: cell.intent });
      if (cell.personaId) scopes.push({ scopeType: "persona", scopeKey: cell.personaId });
      if (cell.marketId) scopes.push({ scopeType: "market", scopeKey: cell.marketId });
    }

    samples.push({
      // A brand_mentions row's existence is the mention signal (no
      // `mentioned` column, spec §2) — see the extraction service's
      // filter at persist time.
      clientMentioned: Boolean(client),
      clientRecommended: Boolean(client?.recommended),
      clientPosition: client?.position ?? null,
      trackedMentionCount: trackedMentions.length,
      clientMentionCount: client ? 1 : 0,
      scopes,
    });

    const payload = e.extractedJson as { citations?: Array<{ cited_for_brand_ids: string[] }> } | null;
    const citations = payload?.citations ?? [];
    const clientCitations = citations.filter((c) => c.cited_for_brand_ids.includes(clientBrandId ?? "")).length;
    const trackedCitations = citations.filter((c) => c.cited_for_brand_ids.some((id) => trackedBrandIds.has(id))).length;
    citationSamples.push({ clientCitationCount: clientCitations, trackedCitationCount: trackedCitations, scopes });

    if (client) {
      clientSentiments.push({ sentiment: client.sentiment as Sentiment, scopes });
      clientAttributeSets.push({ attrs: (client.attributesJson as string[]) ?? [], scopes });
    }

    const claims = claimsByExtraction.get(e.extractionId) ?? [];
    for (const claim of claims) {
      const verdict = claim.operatorVerdict ?? claim.extractedVerdict;
      if (verdict === "not_checked" || verdict === "ambiguous") continue;
      claimVerdicts.push({ verdict, scopes });
    }

    if (cell) {
      const key = `${cell.id}|${e.providerId}|${e.generationMode}`;
      const set = topTrackedBrandSet(mentions.map(toExtractedBrandShape));
      if (!stabilityByCell.has(key)) stabilityByCell.set(key, []);
      stabilityByCell.get(key)!.push(set);
    }
  }

  const rows: Array<typeof metrics.$inferInsert> = [];
  const push = (scope: MetricScope, metricKey: string, result: { n: number; value: number; ciLow: number | null; ciHigh: number | null }) => {
    rows.push({
      runId,
      scopeType: scope.scopeType,
      scopeKey: scope.scopeKey,
      metricKey,
      n: result.n,
      value: result.value,
      ciLow: result.ciLow,
      ciHigh: result.ciHigh,
    });
  };

  for (const scope of allScopes(samples)) {
    const inScope = samples.filter((s) => s.scopes.some((x) => sameScope(x, scope)));
    push(scope, "mention_rate", mentionRate(inScope));
    push(scope, "recommendation_rate", recommendationRate(inScope));
    push(scope, "share_of_voice", shareOfVoice(inScope));
    push(scope, "avg_first_position", avgFirstPosition(inScope));

    const citIn = citationSamples.filter((s) => s.scopes.some((x) => sameScope(x, scope)));
    push(scope, "citation_share", citationShare(citIn));

    const verdictsIn = claimVerdicts
      .filter((v) => v.scopes.some((x) => sameScope(x, scope)))
      .map((v) => v.verdict as "supported" | "contradicted" | "outdated" | "unsupported");
    if (verdictsIn.length > 0) push(scope, "accuracy_rate", accuracyRate(verdictsIn));

    const sentimentsIn = clientSentiments.filter((s) => s.scopes.some((x) => sameScope(x, scope))).map((s) => s.sentiment);
    if (sentimentsIn.length > 0) {
      const dist = sentimentDistribution(sentimentsIn);
      for (const [label, result] of Object.entries(dist)) push(scope, `sentiment_${label}`, result);
    }

    const attrSetsIn = clientAttributeSets.filter((s) => s.scopes.some((x) => sameScope(x, scope))).map((s) => s.attrs);
    if (attrSetsIn.length > 0) {
      for (const attr of projectAttributes) {
        push(scope, `attribute_${attr.name}`, attributeAssociationRate(attrSetsIn, attr.name));
      }
    }
  }

  // MT-7: stability is defined per cell *and engine-mode* — a cell run
  // under two modes (e.g. ungrounded + grounded) produces two independent
  // stability groups, so the scope_key must carry the full grouping key,
  // not just the cell id, or a second mode collides on the unique index.
  const perCellValues: number[] = [];
  for (const [key, sets] of stabilityByCell) {
    const value = stabilityIndex(sets);
    perCellValues.push(value);
    rows.push({
      runId,
      scopeType: "cell",
      scopeKey: key,
      metricKey: "stability_index",
      n: sets.length,
      value,
      ciLow: null,
      ciHigh: null,
    });
  }
  if (perCellValues.length > 0) push(OVERALL, "stability_index", meanStabilityIndex(perCellValues));

  await db.transaction(async (tx) => {
    await tx.delete(metrics).where(eq(metrics.runId, runId));
    for (const row of rows) await tx.insert(metrics).values(row);
  });

  return rows.length;
}

export async function listMetrics(runId: string) {
  return db.select().from(metrics).where(eq(metrics.runId, runId));
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

function sameScope(a: MetricScope, b: MetricScope): boolean {
  return a.scopeType === b.scopeType && a.scopeKey === b.scopeKey;
}

function allScopes(samples: ScopedSample[]): MetricScope[] {
  const seen = new Map<string, MetricScope>();
  for (const s of samples) {
    for (const scope of s.scopes) seen.set(`${scope.scopeType}|${scope.scopeKey}`, scope);
  }
  return [...seen.values()];
}

function toExtractedBrandShape(m: {
  brandId: string | null;
  position: number | null;
}): ExtractedBrand {
  return {
    canonical_brand_id: m.brandId,
    observed_name: "",
    aliases_matched: [],
    mentioned: true,
    position: m.position,
    recommended: false,
    recommendation_strength: "neutral",
    sentiment: "neutral",
    attributes: [],
    evidence_quote: "",
  };
}
