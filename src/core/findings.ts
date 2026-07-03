import {
  GROUNDED_UNGROUNDED_SPLIT_POINTS,
  LOST_SHORTLIST_CLIENT_RATE,
  LOST_SHORTLIST_COMPETITOR_RATE,
  LOW_STABILITY_INDEX,
  POSITIONING_GAP_RATE,
  SOURCE_CONCENTRATION_SHARE,
} from "./constants";
import { escapeModelText } from "./md";

// Findings engine (RB-1, PRD 8.11). Pure functions over pre-fetched data —
// the repository layer queries metrics/brand_mentions/claims/citations and
// hands plain data structures here. No project-layer imports (C-7).

export interface Finding {
  findingType: string;
  severity: "none" | "low" | "medium" | "high";
  title: string;
  bodyMd: string;
  evidence: Record<string, unknown>;
  directionalOnly: boolean;
}

// "High-intent" cells per PRD's lost-shortlist definition are the two
// intents that most directly represent a bottom-funnel decision moment —
// comparison (head-to-head) and validation (fit-check) — as opposed to
// top-of-funnel discovery or post-decision objection handling.
const HIGH_INTENT = new Set(["comparison", "validation"]);

export interface CellBrandPresence {
  cellId: string;
  intent: string;
  clientRate: number;
  topCompetitorName: string;
  topCompetitorRate: number;
  n: number;
}

/**
 * RB-1 / glossary: lost-shortlist cell — a high-intent cell where a
 * competitor appears in >=60% of samples and the client appears in <=20%.
 * D-015: exempt from the n>=30 threshold, but always directional-only.
 */
export function findLostShortlistCells(cells: CellBrandPresence[]): Finding[] {
  return cells
    .filter(
      (c) =>
        HIGH_INTENT.has(c.intent) &&
        c.topCompetitorRate >= LOST_SHORTLIST_COMPETITOR_RATE &&
        c.clientRate <= LOST_SHORTLIST_CLIENT_RATE,
    )
    .map((c) => ({
      findingType: "lost_shortlist",
      severity: "high" as const,
      title: `Lost shortlist: ${c.topCompetitorName} dominates a ${c.intent} cell`,
      bodyMd: `In a ${c.intent} cell (n=${c.n} samples), ${c.topCompetitorName} appeared in ${Math.round(c.topCompetitorRate * 100)}% of answers while the client brand appeared in only ${Math.round(c.clientRate * 100)}%.`,
      evidence: { cellId: c.cellId, intent: c.intent, clientRate: c.clientRate, topCompetitorName: c.topCompetitorName, topCompetitorRate: c.topCompetitorRate, n: c.n },
      directionalOnly: true,
    }));
}

export interface AttributeRate {
  attribute: string;
  rate: number;
  n: number;
}

/** RB-1: positioning gaps — desired attributes with a low client association rate. */
export function findPositioningGaps(attributes: AttributeRate[]): Finding[] {
  return attributes
    .filter((a) => a.rate < POSITIONING_GAP_RATE)
    .map((a) => ({
      findingType: "positioning_gap",
      severity: a.rate < POSITIONING_GAP_RATE / 2 ? ("medium" as const) : ("low" as const),
      title: `Positioning gap: "${a.attribute}"`,
      bodyMd: `The client brand was associated with "${a.attribute}" in only ${Math.round(a.rate * 100)}% of eligible samples (n=${a.n}), despite it being a desired positioning attribute.`,
      evidence: { attribute: a.attribute, rate: a.rate, n: a.n },
      directionalOnly: false,
    }));
}

export interface MisinformationSummary {
  highSeverityCount: number;
  mediumSeverityCount: number;
  totalCount: number;
}

/** RB-1: misinformation flag — a single aggregate finding, since itemized claims already have their own report section (RB-4). */
export function findMisinformationFlag(summary: MisinformationSummary): Finding[] {
  if (summary.totalCount === 0) return [];
  const severity = summary.highSeverityCount > 0 ? "high" : summary.mediumSeverityCount > 0 ? "medium" : "low";
  return [
    {
      findingType: "misinformation",
      severity,
      title: `${summary.totalCount} misinformation issue${summary.totalCount === 1 ? "" : "s"} found`,
      bodyMd: `${summary.highSeverityCount} high-severity and ${summary.mediumSeverityCount} medium-severity claims about the client brand were contradicted, unsupported, or outdated relative to the fact sheet. See the misinformation register for the full itemized list.`,
      evidence: { ...summary },
      directionalOnly: false,
    },
  ];
}

export interface ModeRate {
  mode: "grounded" | "ungrounded";
  rate: number;
  n: number;
}

/** RB-1: grounded-vs-ungrounded mechanism split — a large gap suggests citations are changing what gets said, not just how it's sourced. */
export function findGroundedUngroundedSplit(rates: ModeRate[]): Finding[] {
  const grounded = rates.find((r) => r.mode === "grounded");
  const ungrounded = rates.find((r) => r.mode === "ungrounded");
  if (!grounded || !ungrounded) return [];
  const gap = Math.abs(grounded.rate - ungrounded.rate);
  if (gap < GROUNDED_UNGROUNDED_SPLIT_POINTS) return [];
  const higher = grounded.rate > ungrounded.rate ? "grounded" : "ungrounded";
  return [
    {
      findingType: "grounded_ungrounded_split",
      severity: "medium",
      title: "Grounded vs. ungrounded answers diverge",
      bodyMd: `Mention Rate is ${Math.round(gap * 100)} percentage points higher in ${higher} answers (grounded: ${Math.round(grounded.rate * 100)}% n=${grounded.n}, ungrounded: ${Math.round(ungrounded.rate * 100)}% n=${ungrounded.n}). Citations may be materially changing what gets said, not just where it comes from.`,
      evidence: { grounded, ungrounded, gapPoints: gap },
      directionalOnly: false,
    },
  ];
}

export interface DomainShare {
  domain: string;
  citationCount: number;
}

/** RB-1: source concentration — one domain dominating citations is a single-point-of-narrative-failure risk. */
export function findSourceConcentration(domains: DomainShare[]): Finding[] {
  const total = domains.reduce((sum, d) => sum + d.citationCount, 0);
  if (total === 0) return [];
  const top = [...domains].sort((a, b) => b.citationCount - a.citationCount)[0];
  const share = top.citationCount / total;
  if (share < SOURCE_CONCENTRATION_SHARE) return [];
  // The domain string is model-derived citation data (untrusted in live
  // mode) and this title/bodyMd flows into rendered report markdown.
  const safeDomain = escapeModelText(top.domain);
  return [
    {
      findingType: "source_concentration",
      severity: "low",
      title: `Citations concentrated on ${safeDomain}`,
      bodyMd: `${safeDomain} accounts for ${Math.round(share * 100)}% of all citations in this run. Brand visibility in AI answers may be disproportionately dependent on how this one source describes the market.`,
      evidence: { domain: top.domain, share, citationCount: top.citationCount, totalCitations: total },
      directionalOnly: false,
    },
  ];
}

export interface CellStability {
  cellId: string;
  intent: string;
  stabilityIndex: number;
  n: number;
}

/** RB-1 / D-015: low-stability clusters — exempt from n>=30, always directional-only. */
export function findLowStabilityClusters(cells: CellStability[]): Finding[] {
  return cells
    .filter((c) => c.stabilityIndex < LOW_STABILITY_INDEX)
    .map((c) => ({
      findingType: "low_stability",
      severity: "low" as const,
      title: `Low answer stability in a ${c.intent} cell`,
      bodyMd: `Repeated samples of this cell agreed on the top brands only ${Math.round(c.stabilityIndex * 100)}% of the time (Jaccard similarity across ${c.n} reps), indicating volatile or inconsistent answers.`,
      evidence: { cellId: c.cellId, intent: c.intent, stabilityIndex: c.stabilityIndex, n: c.n },
      directionalOnly: true,
    }));
}
