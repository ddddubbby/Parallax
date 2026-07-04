import type { Intent } from "./matrix";

export type Pillar = "presence" | "position" | "perception" | "proof";

/** Canonical display order — the numbering (01-04) every surface shows. */
export const PILLAR_ORDER: Pillar[] = ["presence", "position", "perception", "proof"];

export const PILLARS: Record<
  Pillar,
  {
    label: string;
    clientQuestion: string;
    description: string;
    // EL-1: what the pillar's prompts do, and why it matters to the client.
    whatPromptsDo: string;
    businessValue: string;
  }
> = {
  presence: {
    label: "Presence",
    clientQuestion: "Am I in AI's consideration set?",
    description: "Whether AI answers include and recommend the client brand.",
    whatPromptsDo: "Ask open, unbranded category questions a real buyer would type — no brand named — and measure whether AI volunteers the client.",
    businessValue: "If AI never mentions you unprompted, you are invisible at the top of the funnel where buyers form their shortlist.",
  },
  position: {
    label: "Position",
    clientQuestion: "When compared, do I win?",
    description: "How the client appears against tracked competitors.",
    whatPromptsDo: "Force a head-to-head against the tracked competitor set and measure who AI actually recommends.",
    businessValue: "Shows whether AI puts you ahead of or behind named rivals at the moment of choice — the difference between winning and losing the deal.",
  },
  perception: {
    label: "Perception",
    clientQuestion: "How does AI describe my brand?",
    description: "The qualities, sentiment, and objections attached to the client brand.",
    whatPromptsDo: "Ask about the client directly and stress-test it with objection prompts to surface the qualities and concerns AI attaches to the brand.",
    businessValue: "Reveals the story AI tells about you — the attributes, tone, and objections that shape how buyers feel before they ever reach your site.",
  },
  proof: {
    label: "Proof",
    clientQuestion: "Is the story true - and sourced?",
    description: "Whether claims are accurate and backed by cited sources.",
    whatPromptsDo: "Every answer's factual claims about the client are checked against the fact sheet, and its citations are traced to sources.",
    businessValue: "Catches where AI misstates facts about you or cites the wrong sources — reputational and compliance risk you can correct.",
  },
};

export type CategoryArchetype = "b2b" | "consumer_product" | "consumer_venue";

export const CATEGORY_ARCHETYPES: Record<
  CategoryArchetype,
  { label: string; description: string }
> = {
  b2b: {
    label: "B2B purchase",
    description: "Software, vendors, services, and considered business buying.",
  },
  consumer_product: {
    label: "Consumer product",
    description: "Products a person chooses, buys, subscribes to, or orders.",
  },
  consumer_venue: {
    label: "Consumer venue",
    description: "Places a person visits, books, eats at, or experiences.",
  },
};

export function intentToPillar(intent: Intent): Pillar {
  if (intent === "discovery" || intent === "consideration") return "presence";
  if (intent === "comparison") return "position";
  return "perception";
}

/**
 * Prompt-frame rule (D-054): a metric may never count a signal the prompt
 * itself planted. Frames classify what each cell's prompt plants, derived
 * from intent — PM-9 guarantees unbranded intents contain no tracked brand
 * terms at approval, so the mapping is enforceable, not aspirational.
 */
export type PromptFrame = "unbranded" | "client_branded" | "comparative";

export const PROMPT_FRAMES: Record<PromptFrame, { label: string; plants: string }> = {
  unbranded: { label: "Unbranded", plants: "nothing — no tracked brand appears in the prompt" },
  client_branded: { label: "Client-branded", plants: "the client brand (validation also names desired attributes)" },
  comparative: { label: "Comparative", plants: "the client and all competitors" },
};

export function intentToFrame(intent: Intent): PromptFrame {
  if (intent === "discovery" || intent === "consideration") return "unbranded";
  if (intent === "comparison") return "comparative";
  return "client_branded";
}

const UNBRANDED_INTENTS: Intent[] = ["discovery", "consideration"];

/**
 * D-054: the intents whose samples may feed a metric's denominator at
 * cross-intent scopes (overall/provider/mode/persona/market). `null` means
 * frame-agnostic (the counted signal — claims, citations content, stability
 * — cannot be planted by the prompt). Intent-pure scopes (`intent`,
 * `intent_persona`) are exempt: single-intent drill-down rows are honest at
 * that granularity and stay computed within their own intent.
 */
export function metricIntentFilter(metricKey: string): Intent[] | null {
  if (
    metricKey === "mention_rate" ||
    metricKey === "share_of_voice" ||
    metricKey === "avg_first_position" ||
    metricKey === "recommendation_rate" ||
    metricKey === "citation_share" ||
    metricKey.startsWith("sentiment_organic_")
  ) {
    return UNBRANDED_INTENTS;
  }
  if (metricKey === "comparative_win_rate") return ["comparison"];
  if (metricKey.startsWith("sentiment_solicited_")) return ["validation"];
  return null;
}

export type DirectionOfGood = "higher" | "lower" | "neutral";

export interface MetricGlossaryEntry {
  key: string;
  label: string;
  pillar: Pillar;
  question: string;
  definition: string;
  computationSummary: string;
  intervalCaveat: string;
  directionOfGood: DirectionOfGood;
}

const WILSON_CAVEAT = "Wilson 95% confidence interval when n is sufficient.";
const POINT_ESTIMATE_CAVEAT = "Point estimate only in MVP; no interval method is defined yet.";

export const METRIC_GLOSSARY: Record<string, MetricGlossaryEntry> = {
  mention_rate: {
    key: "mention_rate",
    label: "Mention Rate",
    pillar: "presence",
    question: PILLARS.presence.clientQuestion,
    definition: "Share of unbranded answers that mention the client brand unprompted.",
    computationSummary: "Unbranded-frame samples (discovery, consideration — no tracked brand in the prompt, PM-9) with a client-brand mention, divided by all unbranded eligible samples in scope. Branded prompts are excluded: a mention the prompt planted is not visibility (D-054).",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  recommendation_rate: {
    key: "recommendation_rate",
    label: "Organic Recommendation Rate",
    pillar: "position",
    question: PILLARS.position.clientQuestion,
    definition: "When the field is open, how often AI recommends the client unprompted.",
    computationSummary: "Unbranded-frame samples where the client brand is marked recommended, divided by all unbranded eligible samples in scope. Validation cells ('is X a good fit?') are excluded — an affirmation of the prompt's own premise is not an organic recommendation (D-054).",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  comparative_win_rate: {
    key: "comparative_win_rate",
    label: "Comparative Win Rate",
    pillar: "position",
    question: PILLARS.position.clientQuestion,
    definition: "In a forced head-to-head against the competitor set, how often AI picks the client.",
    computationSummary: "Comparison-frame samples where the client brand is marked recommended, divided by all comparison eligible samples in scope. No comparative rank metric exists: position inside comparison answers mirrors prompt order (the template names the client first), so it is not reported (D-054).",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  share_of_voice: {
    key: "share_of_voice",
    label: "Share of Voice",
    pillar: "presence",
    question: PILLARS.presence.clientQuestion,
    definition: "The client's share of tracked-brand mentions in unbranded answers.",
    computationSummary: "Client mentions divided by all tracked-brand mentions across unbranded-frame samples in scope. Comparative cells are excluded (every named brand is planted, so the ratio collapses to prompt structure) as are client-branded cells (structurally 1.0) — D-054.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "higher",
  },
  avg_first_position: {
    key: "avg_first_position",
    label: "Avg First Position",
    pillar: "presence",
    question: PILLARS.presence.clientQuestion,
    definition: "Where the client appears in AI's unprompted lists, when it appears at all.",
    computationSummary: "Mean client-brand list position across unbranded-frame samples where the client is present. Branded prompts are excluded — a brand named in the prompt is trivially listed first (D-054).",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "lower",
  },
  citation_share: {
    key: "citation_share",
    label: "Citation Share",
    pillar: "proof",
    question: PILLARS.proof.clientQuestion,
    definition: "The client's share of web citations attributed to tracked brands in grounded, unbranded answers.",
    computationSummary: "Citations for the client brand divided by citations for all tracked brands, over grounded unbranded-frame samples in scope. Ungrounded samples are excluded entirely (they cannot carry citations, so counting them misstates n); comparative prompts are excluded because they direct research at every named brand (D-054).",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "higher",
  },
  accuracy_rate: {
    key: "accuracy_rate",
    label: "Accuracy Rate",
    pillar: "proof",
    question: PILLARS.proof.clientQuestion,
    definition: "Share of checked client claims that match the fact sheet.",
    computationSummary: "Supported client claims divided by checked supported, contradicted, outdated, and unsupported client claims.",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  stability_index: {
    key: "stability_index",
    label: "Stability Index",
    pillar: "presence",
    question: PILLARS.presence.clientQuestion,
    definition: "How consistently repeated samples return the same top tracked brands.",
    computationSummary: "Mean pairwise Jaccard similarity of top tracked-brand sets across repetitions.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "higher",
  },
};

const SENTIMENT_LABELS = ["positive", "neutral", "mixed", "negative"] as const;

const SENTIMENT_GROUPS: Record<
  string,
  { groupLabel: string; denominator: string }
> = {
  organic: {
    groupLabel: "organic",
    denominator:
      "client-brand mentions in unbranded-frame samples (discovery, consideration) — how AI talks about the brand when AI brings it up",
  },
  solicited: {
    groupLabel: "solicited",
    denominator:
      "client-brand mentions in validation samples — how AI answers a direct fit question. Objection cells are excluded from all sentiment metrics: their prompts solicit concerns, so their negative skew is by design (their content feeds findings instead)",
  },
};

function sentimentEntry(group: string, label: string): MetricGlossaryEntry {
  const meta = SENTIMENT_GROUPS[group];
  return {
    key: `sentiment_${group}_${label}`,
    label: `${label[0].toUpperCase()}${label.slice(1)} sentiment (${meta.groupLabel})`,
    pillar: "perception",
    question: PILLARS.perception.clientQuestion,
    definition: `Share of ${meta.groupLabel} client-brand mentions classified as ${label}.`,
    computationSummary: `${label[0].toUpperCase()}${label.slice(1)} mentions divided by ${meta.denominator} (D-054). Never averaged into a single score, and never pooled across groups.`,
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: label === "positive" ? "higher" : label === "negative" ? "lower" : "neutral",
  };
}

export function resolveGlossary(metricKey: string): MetricGlossaryEntry {
  const fixed = METRIC_GLOSSARY[metricKey];
  if (fixed) return fixed;

  if (metricKey.startsWith("sentiment_")) {
    const rest = metricKey.slice("sentiment_".length);
    for (const group of Object.keys(SENTIMENT_GROUPS)) {
      for (const label of SENTIMENT_LABELS) {
        if (rest === `${group}_${label}`) return sentimentEntry(group, label);
      }
    }
  }

  if (metricKey.startsWith("attribute_")) {
    const attribute = metricKey.slice("attribute_".length).trim() || "attribute";
    return {
      key: metricKey,
      label: `Attribute: ${attribute}`,
      pillar: "perception",
      question: PILLARS.perception.clientQuestion,
      definition: `Share of client-brand mentions associated with "${attribute}", excluding prompts that planted it.`,
      computationSummary: `Mentions where the extraction associates this attribute, divided by client-brand mentions whose resolved prompt text does NOT contain the attribute phrase — an echo of an attribute the prompt named (e.g. validation's {attribute_list}) is planted, not perceived (D-054). The exclusion matches against stored resolved text, so operator-edited prompts are covered too.`,
      intervalCaveat: POINT_ESTIMATE_CAVEAT,
      directionOfGood: "higher",
    };
  }

  throw new Error(`No metric glossary entry for "${metricKey}"`);
}

/**
 * EL-1: the metrics a pillar's cells accumulate into, derived from the
 * glossary's own pillar tags (single source — never a hand-kept list).
 * Stability is excluded: it is the confidence rail, not a pillar metric.
 * The dynamic perception families (sentiment, attributes) are appended
 * since they are resolved on demand rather than named in the fixed map.
 */
export function pillarMetricLabels(pillar: Pillar): string[] {
  const labels = Object.values(METRIC_GLOSSARY)
    .filter((e) => e.pillar === pillar && e.key !== "stability_index")
    .map((e) => e.label);
  if (pillar === "perception") labels.push("Sentiment", "Attribute associations");
  return labels;
}
