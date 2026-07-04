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
import { normalizePhrase } from "@/core/intake";
import type { Intent } from "@/core/matrix";
import { metricIntentFilter } from "@/core/semantic";
import { db } from "../client";
import { attributes as attributesTable, auditRuns, brands, metrics, promptCells } from "../schema";
import {
  getBrandMentionsForExtractions,
  getClaimsForExtractions,
  getEligibleExtractionsForRun,
} from "./extraction";

type MetricScope = { scopeType: string; scopeKey: string };
const OVERALL: MetricScope = { scopeType: "overall", scopeKey: "__all__" };

// M11 glossary completeness test imports this list so any new emitted metric
// family must either be named here or be covered by a resolver prefix.
export const EMITTED_METRIC_KEY_EXAMPLES = [
  "mention_rate",
  "recommendation_rate",
  "comparative_win_rate",
  "share_of_voice",
  "avg_first_position",
  "citation_share",
  "accuracy_rate",
  "stability_index",
  "sentiment_organic_positive",
  "sentiment_organic_neutral",
  "sentiment_organic_mixed",
  "sentiment_organic_negative",
  "sentiment_solicited_positive",
  "sentiment_solicited_neutral",
  "sentiment_solicited_mixed",
  "sentiment_solicited_negative",
  "attribute_easy implementation",
] as const;

interface ScopedSample extends EligibleSample {
  scopes: MetricScope[];
  intent: Intent | null;
}

/**
 * D-054 prompt-frame rule: at cross-intent scopes a metric only counts
 * samples from the intents whose prompts cannot have planted its signal.
 * Intent-pure scopes (intent, intent_persona) are exempt — a single-intent
 * drill-down row is honest at that granularity.
 */
function isIntentPureScope(scope: MetricScope): boolean {
  return scope.scopeType === "intent" || scope.scopeType === "intent_persona";
}

function frameFilter<T extends { intent: Intent | null }>(
  items: T[],
  metricKey: string,
  scope: MetricScope,
): T[] {
  if (isIntentPureScope(scope)) return items;
  const allowed = metricIntentFilter(metricKey);
  if (!allowed) return items;
  return items.filter((s) => s.intent !== null && allowed.includes(s.intent));
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
    db
      .select({ id: promptCells.id, intent: promptCells.intent, personaId: promptCells.personaId, marketId: promptCells.marketId, resolvedText: promptCells.resolvedText })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, run.matrixVersionId)),
    db.select({ name: attributesTable.name }).from(attributesTable).where(eq(attributesTable.projectId, run.projectId)),
  ]);
  const mentionsByExtraction = groupBy(allMentions, (m) => m.extractionId);
  const claimsByExtraction = groupBy(allClaims, (c) => c.extractionId);
  const cellById = new Map(cellRows.map((c) => [c.id, c]));

  const samples: ScopedSample[] = [];
  const citationSamples: Array<{ clientCitationCount: number; trackedCitationCount: number; scopes: MetricScope[]; intent: Intent | null; grounded: boolean }> = [];
  const clientSentiments: Array<{ sentiment: Sentiment; scopes: MetricScope[]; intent: Intent | null }> = [];
  const clientAttributeSets: Array<{ attrs: string[]; scopes: MetricScope[]; intent: Intent | null; promptText: string }> = [];
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
      // M6 funnel heatmap: intent x persona, so the dashboard can show
      // mention/recommendation rate per funnel stage per buyer persona
      // without querying outside the disposable metrics table (C-5).
      if (cell.personaId) {
        scopes.push({ scopeType: "intent_persona", scopeKey: `${cell.intent}|${cell.personaId}` });
      }
    }

    const intent = (cell?.intent ?? null) as Intent | null;

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
      intent,
    });

    const payload = e.extractedJson as { citations?: Array<{ cited_for_brand_ids: string[] }> } | null;
    const citations = payload?.citations ?? [];
    const clientCitations = citations.filter((c) => c.cited_for_brand_ids.includes(clientBrandId ?? "")).length;
    const trackedCitations = citations.filter((c) => c.cited_for_brand_ids.some((id) => trackedBrandIds.has(id))).length;
    citationSamples.push({
      clientCitationCount: clientCitations,
      trackedCitationCount: trackedCitations,
      scopes,
      intent,
      grounded: e.generationMode === "grounded",
    });

    if (client) {
      clientSentiments.push({ sentiment: client.sentiment as Sentiment, scopes, intent });
      clientAttributeSets.push({
        attrs: (client.attributesJson as string[]) ?? [],
        scopes,
        intent,
        promptText: normalizePhrase(cell?.resolvedText ?? ""),
      });
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

    // D-054: presence/position rates count only samples whose prompts could
    // not have planted the signal (frameFilter is a no-op at intent-pure
    // scopes, which stay as transparent per-intent drill-down rows).
    push(scope, "mention_rate", mentionRate(frameFilter(inScope, "mention_rate", scope)));
    push(scope, "recommendation_rate", recommendationRate(frameFilter(inScope, "recommendation_rate", scope)));
    push(scope, "share_of_voice", shareOfVoice(frameFilter(inScope, "share_of_voice", scope)));
    push(scope, "avg_first_position", avgFirstPosition(frameFilter(inScope, "avg_first_position", scope)));

    // Comparative win rate exists only at cross-intent scopes — at an
    // intent-pure scope it would either duplicate (intent=comparison) or
    // count out-of-frame samples (any other intent).
    if (!isIntentPureScope(scope)) {
      const comparison = frameFilter(inScope, "comparative_win_rate", scope);
      if (comparison.length > 0) push(scope, "comparative_win_rate", recommendationRate(comparison));
    }

    // Citations exist only on grounded samples; a scope with zero grounded
    // samples emits NO row (an ungrounded run previously showed
    // citation_share 0.000 at n=113, which reads as "no share" instead of
    // "not measurable").
    const citIn = frameFilter(
      citationSamples.filter((s) => s.scopes.some((x) => sameScope(x, scope))),
      "citation_share",
      scope,
    ).filter((s) => s.grounded);
    if (citIn.length > 0) push(scope, "citation_share", citationShare(citIn));

    const verdictsIn = claimVerdicts
      .filter((v) => v.scopes.some((x) => sameScope(x, scope)))
      .map((v) => v.verdict as "supported" | "contradicted" | "outdated" | "unsupported");
    if (verdictsIn.length > 0) push(scope, "accuracy_rate", accuracyRate(verdictsIn));

    // D-054 sentiment split: organic (unbranded mentions) and solicited
    // (validation) reported separately, never pooled; objection cells feed
    // no sentiment metric at all (their prompts solicit concerns, so their
    // skew is planted by design). Cross-intent scopes only — the groups are
    // already intent-defined, so intent-pure rows would duplicate them.
    if (!isIntentPureScope(scope)) {
      const mentionsIn = clientSentiments.filter((s) => s.scopes.some((x) => sameScope(x, scope)));
      for (const group of ["organic", "solicited"] as const) {
        const groupSentiments = frameFilter(mentionsIn, `sentiment_${group}_positive`, scope).map((s) => s.sentiment);
        if (groupSentiments.length > 0) {
          const dist = sentimentDistribution(groupSentiments);
          for (const [label, result] of Object.entries(dist)) push(scope, `sentiment_${group}_${label}`, result);
        }
      }
    }

    // D-054 attribute exclusion: per attribute, drop mentioning samples
    // whose resolved prompt text contains the attribute phrase — an echo of
    // a planted attribute (validation's {attribute_list}, or an operator
    // edit) is not perception. Matching runs against stored resolved text,
    // normalized the same way PM-9 normalizes brand terms.
    const attrSamplesIn = clientAttributeSets.filter((s) => s.scopes.some((x) => sameScope(x, scope)));
    if (attrSamplesIn.length > 0) {
      for (const attr of projectAttributes) {
        const phrase = normalizePhrase(attr.name);
        const unplanted = attrSamplesIn.filter((s) => !s.promptText.includes(phrase));
        if (unplanted.length > 0) {
          push(scope, `attribute_${attr.name}`, attributeAssociationRate(unplanted.map((s) => s.attrs), attr.name));
        }
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
