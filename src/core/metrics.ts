import { wilsonInterval } from "./wilson";

// Metrics domain (PRD 8.9, DEVELOPMENT_GUIDELINES E2). All functions here
// are pure over already-eligible-sample data (D-014) — the repository
// layer is responsible for filtering to eligible samples before calling
// these. No project-layer imports (C-7).

export interface MetricResult {
  n: number;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
}

function proportionMetric(successes: number, n: number): MetricResult {
  const { value, ciLow, ciHigh } = wilsonInterval(successes, n);
  return { n, value, ciLow, ciHigh };
}

/** Point estimate with no defined interval method (D-023): Share of Voice, Citation Share, Avg First Position, Stability Index. */
function pointEstimate(value: number, n: number): MetricResult {
  return { n, value, ciLow: null, ciHigh: null };
}

// --- Per-sample eligible-response shape the aggregate metrics consume ---

export interface EligibleSample {
  clientMentioned: boolean;
  clientRecommended: boolean;
  clientPosition: number | null;
  trackedMentionCount: number; // total tracked-brand mentions in this sample (client + competitors)
  clientMentionCount: number; // 0 or 1 in a single sample; kept explicit for SoV summation clarity
}

/** MT-1: Mention Rate = samples where client brand is mentioned / eligible samples. Wilson (D-023, MT-11). */
export function mentionRate(samples: EligibleSample[]): MetricResult {
  const successes = samples.filter((s) => s.clientMentioned).length;
  return proportionMetric(successes, samples.length);
}

/** MT-2: Recommendation Rate = samples where client brand is recommended / eligible samples. Wilson. */
export function recommendationRate(samples: EligibleSample[]): MetricResult {
  const successes = samples.filter((s) => s.clientRecommended).length;
  return proportionMetric(successes, samples.length);
}

/** MT-3: Share of Voice = client brand mentions / all tracked brand mentions in scope. Point estimate. */
export function shareOfVoice(samples: EligibleSample[]): MetricResult {
  const clientMentions = samples.reduce((sum, s) => sum + s.clientMentionCount, 0);
  const allMentions = samples.reduce((sum, s) => sum + s.trackedMentionCount, 0);
  return pointEstimate(allMentions === 0 ? 0 : clientMentions / allMentions, samples.length);
}

/** MT-4: Avg First Position excludes samples where the brand is absent. Point estimate. */
export function avgFirstPosition(samples: EligibleSample[]): MetricResult {
  const positions = samples
    .map((s) => s.clientPosition)
    .filter((p): p is number => p !== null);
  if (positions.length === 0) return pointEstimate(0, 0);
  const mean = positions.reduce((sum, p) => sum + p, 0) / positions.length;
  return pointEstimate(mean, positions.length);
}

export interface CitationSample {
  clientCitationCount: number;
  trackedCitationCount: number;
}

/** MT-5: Citation Share = citations for client brand / citations for all tracked brands. Point estimate. */
export function citationShare(samples: CitationSample[]): MetricResult {
  const client = samples.reduce((sum, s) => sum + s.clientCitationCount, 0);
  const tracked = samples.reduce((sum, s) => sum + s.trackedCitationCount, 0);
  return pointEstimate(tracked === 0 ? 0 : client / tracked, samples.length);
}

/** MT-6: Accuracy Rate = supported client claims / checked client claims. Wilson. "Checked" excludes not_checked/ambiguous. */
export function accuracyRate(verdicts: Array<"supported" | "contradicted" | "outdated" | "unsupported">): MetricResult {
  const successes = verdicts.filter((v) => v === "supported").length;
  return proportionMetric(successes, verdicts.length);
}

/** MT-7: mean of per-cell stability indices at a rollup scope. Point estimate — a mean of means. */
export function meanStabilityIndex(perCellStability: number[]): MetricResult {
  if (perCellStability.length === 0) return pointEstimate(0, 0);
  const mean = perCellStability.reduce((sum, v) => sum + v, 0) / perCellStability.length;
  return pointEstimate(mean, perCellStability.length);
}

export type Sentiment = "positive" | "neutral" | "mixed" | "negative";
const SENTIMENTS: Sentiment[] = ["positive", "neutral", "mixed", "negative"];

/** MT-9: sentiment distribution for one brand — share of mentioning samples per label. Never averaged into a single score. */
export function sentimentDistribution(sentiments: Sentiment[]): Record<Sentiment, MetricResult> {
  const n = sentiments.length;
  const result = {} as Record<Sentiment, MetricResult>;
  for (const label of SENTIMENTS) {
    const count = sentiments.filter((s) => s === label).length;
    result[label] = pointEstimate(n === 0 ? 0 : count / n, n);
  }
  return result;
}

/** MT-10: attribute-association = share of mentioning samples where the extraction associates that attribute. Point estimate. */
export function attributeAssociationRate(
  mentionedAttributeSets: string[][],
  attribute: string,
): MetricResult {
  const n = mentionedAttributeSets.length;
  const count = mentionedAttributeSets.filter((attrs) => attrs.includes(attribute)).length;
  return pointEstimate(n === 0 ? 0 : count / n, n);
}
