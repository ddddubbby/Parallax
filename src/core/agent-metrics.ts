// GEO agent metrics (AGENT_PRD §7). All per engine, NEVER pooled (D-080). Pure
// functions over the stored answers (C-5): recomputable, idempotent. Lanes B and
// C are never pooled (prompt-frame rule D-054); descriptor/risk matching runs on
// the C-C-masked copy; every rate ships with n and a status label.

import { maskedLexiconHits, qualifiedTickerSpans, type TokenIdentityText } from "./agent-extraction";
import { DESCRIPTOR_V1, RISK_V1, REFUSAL_V1, containsAnyLexiconTerm } from "./agent-lexicons";
import {
  classifyIdentity,
  deriveRepresentationState,
  extractAddresses,
  type ClassifierIdentity,
  type IdentityClass,
  type RepresentationState,
} from "./agent-identity";
import { wilsonInterval } from "./wilson";

export type CryptoLane = "A" | "B" | "C";
export type MetricStatus = "estimable" | "directional" | "not_estimable";

export interface AgentSample {
  engine: string;
  lane: CryptoLane;
  variantKey: string;
  rawText: string;
  citations: { url: string; domain: string }[];
}

/** n ≥ 30 estimable, 1 ≤ n < 30 directional, n = 0 not_estimable (AGENT_PRD §7). */
export function metricStatus(n: number): MetricStatus {
  if (n >= 30) return "estimable";
  if (n >= 1) return "directional";
  return "not_estimable";
}

export interface RateBlock {
  numerator: number;
  denominator: number;
  rate: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  n: number;
  status: MetricStatus;
}

/** A proportion over `denominator` eligible samples, with Wilson interval (D-023). */
function rateBlock(numerator: number, denominator: number): RateBlock {
  const status = metricStatus(denominator);
  if (denominator === 0) {
    return { numerator, denominator, rate: null, ciLow: null, ciHigh: null, n: 0, status };
  }
  const w = wilsonInterval(numerator, denominator);
  return {
    numerator,
    denominator,
    rate: w.value,
    ciLow: w.ciLow,
    ciHigh: w.ciHigh,
    n: denominator,
    status,
  };
}

export function isRefusal(text: string): boolean {
  return containsAnyLexiconTerm(text, REFUSAL_V1);
}

/** AGENT_PRD M1: the token is "named" if its exact name, a qualified ticker, or its contract appears. */
export function mentionsToken(sample: AgentSample, identity: ClassifierIdentity): boolean {
  const target = identity.address.toLowerCase();
  const haystack = `${sample.rawText}\n${sample.citations.map((c) => c.url).join("\n")}`.toLowerCase();
  if (haystack.includes(target)) return true;
  if (sample.rawText.toLowerCase().includes(identity.name.toLowerCase())) return true;
  return qualifiedTickerSpans(sample.rawText, identity).length > 0;
}

function descriptorSet(rawText: string, identity: TokenIdentityText): Set<string> {
  return new Set(maskedLexiconHits(rawText, identity, DESCRIPTOR_V1).map((h) => h.term));
}

// --- Repeatability helpers (AGENT_PRD §7 M6). MUST NOT reuse core jaccardSimilarity. ---

/** Unordered pairs of a list, as [i, j] index tuples. */
function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

export interface RepeatabilityResult {
  score: number | null;
  usableCells: number;
  totalPairs: number;
  status: MetricStatus;
}

/**
 * M6a identity_repeatability: within each Lane-B cell (engine already fixed),
 * pairs of non-refusal samples agree iff same identity class. Cell score =
 * agreeing/total; engine score = mean over cells with ≥2 usable samples.
 */
export function identityRepeatability(cellClasses: IdentityClass[][]): RepeatabilityResult {
  const cellScores: number[] = [];
  let totalPairs = 0;
  for (const classes of cellClasses) {
    const cellPairs = pairs(classes);
    if (cellPairs.length === 0) continue; // needs ≥2 usable samples
    const agree = cellPairs.filter(([a, b]) => a === b).length;
    cellScores.push(agree / cellPairs.length);
    totalPairs += cellPairs.length;
  }
  if (cellScores.length === 0) {
    return { score: null, usableCells: 0, totalPairs: 0, status: "not_estimable" };
  }
  const score = cellScores.reduce((s, v) => s + v, 0) / cellScores.length;
  return { score, usableCells: cellScores.length, totalPairs, status: "estimable" };
}

/**
 * M6b descriptor_repeatability: within each Lane-B cell, pairwise Jaccard of
 * descriptor sets over ONLY pairs where both samples are identity-`matched` AND
 * the set union is non-empty. Empty/empty pairs are EXCLUDED (never counted as
 * perfect agreement — the core jaccardSimilarity's empty/empty = 1 bug); zero
 * qualifying pairs = not_estimable.
 */
export function descriptorRepeatability(
  cellMatchedSets: Set<string>[][],
): RepeatabilityResult {
  const jaccards: number[] = [];
  let usableCells = 0;
  for (const sets of cellMatchedSets) {
    let cellHadPair = false;
    for (const [a, b] of pairs(sets)) {
      const union = new Set([...a, ...b]);
      if (union.size === 0) continue; // empty/empty excluded
      const inter = [...a].filter((x) => b.has(x)).length;
      jaccards.push(inter / union.size);
      cellHadPair = true;
    }
    if (cellHadPair) usableCells++;
  }
  if (jaccards.length === 0) {
    return { score: null, usableCells: 0, totalPairs: 0, status: "not_estimable" };
  }
  const score = jaccards.reduce((s, v) => s + v, 0) / jaccards.length;
  return { score, usableCells, totalPairs: jaccards.length, status: "estimable" };
}

// --- Per-engine metric bundle ---

export interface DescriptorProfileEntry extends RateBlock {
  term: string;
}
export interface DomainCount {
  domain: string;
  count: number;
}

export interface EngineMetrics {
  engine: string;
  // M7 sample accounting (from responses; planned/errors/retries filled by the caller).
  collected: number;
  refusals: number;
  byLane: Record<CryptoLane, number>;
  // M1
  discoveryMentionRate: RateBlock;
  // M2 Lane-B identity mix
  identityMix: Record<IdentityClass, number>;
  laneBNonRefusal: number;
  laneBMatched: number;
  // M3 descriptor profiles (separate B / C blocks — never pooled)
  descriptorProfileB: DescriptorProfileEntry[];
  descriptorProfileC: DescriptorProfileEntry[];
  // M4 risk-language rate (separate B / C)
  riskRateB: RateBlock;
  riskRateC: RateBlock;
  // M5 citation coverage per lane + domain table
  citationCoverage: Record<CryptoLane, RateBlock>;
  citedDomains: DomainCount[];
  // M6
  identityRepeatability: RepeatabilityResult;
  descriptorRepeatability: RepeatabilityResult;
}

function descriptorProfile(matched: AgentSample[], identity: ClassifierIdentity): DescriptorProfileEntry[] {
  const denom = matched.length;
  return DESCRIPTOR_V1.map((term) => {
    const numerator = matched.filter((s) => descriptorSet(s.rawText, identity).has(term)).length;
    return { term, ...rateBlock(numerator, denom) };
  });
}

function riskRate(matched: AgentSample[], identity: ClassifierIdentity): RateBlock {
  const numerator = matched.filter(
    (s) => maskedLexiconHits(s.rawText, identity, RISK_V1).length > 0,
  ).length;
  return rateBlock(numerator, matched.length);
}

function citationCoverage(samples: AgentSample[]): RateBlock {
  const numerator = samples.filter((s) => s.citations.length > 0).length;
  return rateBlock(numerator, samples.length);
}

function domainTable(samples: AgentSample[]): DomainCount[] {
  const counts = new Map<string, number>();
  for (const s of samples) {
    for (const c of s.citations) counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

/** Compute the full metric bundle for ONE engine's samples. */
export function computeEngineMetrics(engine: string, samples: AgentSample[], identity: ClassifierIdentity): EngineMetrics {
  const nonRefusal = samples.filter((s) => !isRefusal(s.rawText));
  const laneA = nonRefusal.filter((s) => s.lane === "A");
  const laneB = nonRefusal.filter((s) => s.lane === "B");
  const laneC = nonRefusal.filter((s) => s.lane === "C");

  // M1 Discovery Mention Rate — non-refusal Lane A only.
  const discoveryMentionRate = rateBlock(
    laneA.filter((s) => mentionsToken(s, identity)).length,
    laneA.length,
  );

  // M2 Identity Mix — Lane B classifications.
  const laneBClasses = laneB.map((s) => classifyIdentity({ rawText: s.rawText, citations: s.citations.map((c) => c.url) }, identity));
  const identityMix: Record<IdentityClass, number> = { matched: 0, namesake: 0, ambiguous: 0, absent: 0 };
  for (const c of laneBClasses) identityMix[c]++;
  const laneBMatchedSamples = laneB.filter((_, i) => laneBClasses[i] === "matched");
  const laneCClasses = laneC.map((s) => classifyIdentity({ rawText: s.rawText, citations: s.citations.map((c) => c.url) }, identity));
  const laneCMatchedSamples = laneC.filter((_, i) => laneCClasses[i] === "matched");

  // M6 — group Lane B by cell (variantKey), carrying each sample's class.
  const laneBCells = new Map<string, { class: IdentityClass; descriptors: Set<string> }[]>();
  laneB.forEach((s, i) => {
    const cell = laneBCells.get(s.variantKey) ?? [];
    cell.push({ class: laneBClasses[i], descriptors: descriptorSet(s.rawText, identity) });
    laneBCells.set(s.variantKey, cell);
  });
  const cells = [...laneBCells.values()];
  const idRepeat = identityRepeatability(cells.map((cell) => cell.map((s) => s.class)));
  const descRepeat = descriptorRepeatability(
    cells.map((cell) => cell.filter((s) => s.class === "matched").map((s) => s.descriptors)),
  );

  const byLane: Record<CryptoLane, number> = {
    A: samples.filter((s) => s.lane === "A").length,
    B: samples.filter((s) => s.lane === "B").length,
    C: samples.filter((s) => s.lane === "C").length,
  };

  return {
    engine,
    collected: samples.length,
    refusals: samples.length - nonRefusal.length,
    byLane,
    discoveryMentionRate,
    identityMix,
    laneBNonRefusal: laneB.length,
    laneBMatched: laneBMatchedSamples.length,
    descriptorProfileB: descriptorProfile(laneBMatchedSamples, identity),
    descriptorProfileC: descriptorProfile(laneCMatchedSamples, identity),
    riskRateB: riskRate(laneBMatchedSamples, identity),
    riskRateC: riskRate(laneCMatchedSamples, identity),
    citationCoverage: {
      A: citationCoverage(laneA),
      B: citationCoverage(laneB),
      C: citationCoverage(laneC),
    },
    citedDomains: domainTable(nonRefusal),
    identityRepeatability: idRepeat,
    descriptorRepeatability: descRepeat,
  };
}

export interface AgentMetrics {
  perEngine: EngineMetrics[];
  representationState: RepresentationState;
}

/** Compute per-engine metrics for the whole run (grouped by engine) + representation_state. */
export function computeAgentMetrics(samples: AgentSample[], identity: ClassifierIdentity): AgentMetrics {
  const engines = [...new Set(samples.map((s) => s.engine))].sort();
  const perEngine = engines.map((engine) =>
    computeEngineMetrics(engine, samples.filter((s) => s.engine === engine), identity),
  );
  const representationState = deriveRepresentationState(perEngine.map((e) => e.laneBMatched));
  return { perEngine, representationState };
}

// Re-export for the report builder.
export { extractAddresses };
