import type { Intent } from "./matrix";

export type Pillar = "presence" | "position" | "perception" | "proof";

export const PILLARS: Record<
  Pillar,
  { label: string; clientQuestion: string; description: string }
> = {
  presence: {
    label: "Presence",
    clientQuestion: "Am I in AI's consideration set?",
    description: "Whether AI answers include and recommend the client brand.",
  },
  position: {
    label: "Position",
    clientQuestion: "When compared, do I win?",
    description: "How the client appears against tracked competitors.",
  },
  perception: {
    label: "Perception",
    clientQuestion: "How does AI describe my brand?",
    description: "The qualities, sentiment, and objections attached to the client brand.",
  },
  proof: {
    label: "Proof",
    clientQuestion: "Is the story true - and sourced?",
    description: "Whether claims are accurate and backed by cited sources.",
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
    definition: "Share of eligible answers that mention the client brand.",
    computationSummary: "Eligible samples with a client-brand mention divided by all eligible samples in scope.",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  recommendation_rate: {
    key: "recommendation_rate",
    label: "Recommendation Rate",
    pillar: "presence",
    question: PILLARS.presence.clientQuestion,
    definition: "Share of eligible answers that recommend the client brand.",
    computationSummary: "Eligible samples where the client brand is marked recommended divided by all eligible samples in scope.",
    intervalCaveat: WILSON_CAVEAT,
    directionOfGood: "higher",
  },
  share_of_voice: {
    key: "share_of_voice",
    label: "Share of Voice",
    pillar: "position",
    question: PILLARS.position.clientQuestion,
    definition: "The client's share of tracked-brand mentions in the sampled answers.",
    computationSummary: "Client mentions divided by all mentions of tracked client and competitor brands in scope.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "higher",
  },
  avg_first_position: {
    key: "avg_first_position",
    label: "Avg First Position",
    pillar: "position",
    question: PILLARS.position.clientQuestion,
    definition: "Average first listed position when the client brand appears.",
    computationSummary: "Mean client-brand position across samples where the client brand is present.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "lower",
  },
  citation_share: {
    key: "citation_share",
    label: "Citation Share",
    pillar: "proof",
    question: PILLARS.proof.clientQuestion,
    definition: "The client's share of citations attributed to tracked brands.",
    computationSummary: "Citations for the client brand divided by citations for all tracked brands in scope.",
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
  sentiment_positive: {
    key: "sentiment_positive",
    label: "Positive Sentiment",
    pillar: "perception",
    question: PILLARS.perception.clientQuestion,
    definition: "Share of client-brand mentions classified as positive.",
    computationSummary: "Positive client-brand mentions divided by all client-brand mentions in scope.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "higher",
  },
  sentiment_neutral: {
    key: "sentiment_neutral",
    label: "Neutral Sentiment",
    pillar: "perception",
    question: PILLARS.perception.clientQuestion,
    definition: "Share of client-brand mentions classified as neutral.",
    computationSummary: "Neutral client-brand mentions divided by all client-brand mentions in scope.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "neutral",
  },
  sentiment_mixed: {
    key: "sentiment_mixed",
    label: "Mixed Sentiment",
    pillar: "perception",
    question: PILLARS.perception.clientQuestion,
    definition: "Share of client-brand mentions classified as mixed.",
    computationSummary: "Mixed client-brand mentions divided by all client-brand mentions in scope.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "neutral",
  },
  sentiment_negative: {
    key: "sentiment_negative",
    label: "Negative Sentiment",
    pillar: "perception",
    question: PILLARS.perception.clientQuestion,
    definition: "Share of client-brand mentions classified as negative.",
    computationSummary: "Negative client-brand mentions divided by all client-brand mentions in scope.",
    intervalCaveat: POINT_ESTIMATE_CAVEAT,
    directionOfGood: "lower",
  },
};

export function resolveGlossary(metricKey: string): MetricGlossaryEntry {
  const fixed = METRIC_GLOSSARY[metricKey];
  if (fixed) return fixed;

  if (metricKey.startsWith("attribute_")) {
    const attribute = metricKey.slice("attribute_".length).trim() || "attribute";
    return {
      key: metricKey,
      label: `Attribute: ${attribute}`,
      pillar: "perception",
      question: PILLARS.perception.clientQuestion,
      definition: `Share of client-brand mentions associated with "${attribute}".`,
      computationSummary: "Mentions where the extraction associates this attribute divided by all client-brand mentions in scope.",
      intervalCaveat: POINT_ESTIMATE_CAVEAT,
      directionOfGood: "higher",
    };
  }

  throw new Error(`No metric glossary entry for "${metricKey}"`);
}
