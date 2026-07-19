import type { Intent } from "./matrix";
import type { CategoryArchetype } from "./semantic";

/**
 * M23 (D-079): the framing aspect a template's evidence answers — the
 * producer side of the Evidence-Layer -> Simulation-Layer contract (the
 * LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md synthesis section). This is a pure
 * core mapping, never a DB column: every seeded row's aspect is either the
 * intent's default or an explicit per-row override (price/promo templates
 * living inside an existing intent, per the pinned decision).
 */
export type FrameAspect =
  | "presence"
  | "positioning"
  | "perception_attributes"
  | "factual_claims"
  | "framing_associations"
  | "pricing"
  | "promotions";

/** Default aspect(s) a plain template of a given intent produces. */
export const DEFAULT_FRAME_ASPECTS: Record<Intent, FrameAspect[]> = {
  discovery: ["presence"],
  consideration: ["presence"],
  comparison: ["positioning"],
  validation: ["perception_attributes", "factual_claims"],
  objection: ["perception_attributes"],
  representation: ["framing_associations"],
};

export interface PromptTemplateSeed {
  archetype: CategoryArchetype;
  intent: Intent;
  variantKey: string;
  text: string;
  /**
   * Overrides the intent's default frame aspect(s). Only set when a
   * template's evidentiary content diverges from what its intent usually
   * produces — e.g. a price/promo template living inside `comparison`.
   */
  frameAspects?: FrameAspect[];
  /**
   * Opt-in gate (M23/D-079): price/promo templates seed inactive so the
   * default allocation pool, golden dataset, and mock-e2e expectations stay
   * unchanged (D-016 risk note). Undefined means active (existing rows).
   */
  active?: boolean;
}

export const REPRESENTATION_PROMPT_PROTOCOL_VERSION = "representation-prompts.v4";
export const REPRESENTATION_PROMPTS = [
  { variantKey: "a1", text: "What is {client_brand}?" },
  { variantKey: "a2", text: "Describe {client_brand}." },
  { variantKey: "a3", text: "Tell me about {client_brand}." },
  { variantKey: "a4", text: "Give an overview of {client_brand}." },
  { variantKey: "a5", text: "Explain {client_brand}." },
] as const;

export function frameAspectsForTemplate(t: Pick<PromptTemplateSeed, "intent" | "frameAspects">): FrameAspect[] {
  return t.frameAspects ?? DEFAULT_FRAME_ASPECTS[t.intent];
}

/**
 * Coverage-panel lookup: a cell only carries intent + variantKey (plus the
 * project's single archetype), so this resolves back to the seed row's
 * frame aspect(s). A variantKey with no matching seed row (a future
 * operator-authored template) falls back to the intent's default rather
 * than throwing — the panel degrades to intent-only granularity for it.
 */
export function frameAspectsForCell(
  archetype: CategoryArchetype,
  intent: Intent,
  variantKey: string,
): FrameAspect[] {
  const seed = TEMPLATE_SEED.find(
    (t) => t.archetype === archetype && t.intent === intent && t.variantKey === variantKey,
  );
  return seed ? frameAspectsForTemplate(seed) : DEFAULT_FRAME_ASPECTS[intent];
}

// Three variant phrasings per intent and archetype (PRD 8.4, AT-2).
// The b2b pack preserves the original PRD text; consumer packs remove
// procurement-language jargon that invalidates consumer-category audits.
// M23 (D-079): each archetype also gets two opt-in price/promo variants
// (variantKey v4/v5, active:false) inside the `comparison` intent — the
// verified coverage hole (LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md 2c: zero
// of the 45 default templates mention price/cost/deal/offer/discount).
// M28 (D-085): every {job_to_be_done} slot across all three archetypes is
// noun-phrase-compatible ("...for {job_to_be_done}?", "...working on/focused
// on {job_to_be_done}?") — a single stored buyer-goal value (e.g. "night
// street photography") must read grammatically no matter which variant it
// lands in. The two verb-phrase-framed b2b/consumer_product v2 rows
// ("trying to"/"who wants to") were rewritten; see prompt-templates.test.ts
// for the standing regression assertion.
export const TEMPLATE_SEED: PromptTemplateSeed[] = [
  { archetype: "b2b", intent: "discovery", variantKey: "v1", text: "What tools should a {persona} in {market} consider for {job_to_be_done}?" },
  { archetype: "b2b", intent: "discovery", variantKey: "v2", text: "Which solutions would you shortlist for a {persona} in {market} working on {job_to_be_done}?" },
  { archetype: "b2b", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What should I look at for {job_to_be_done}?" },
  { archetype: "b2b", intent: "consideration", variantKey: "v1", text: "What are the best options for {persona} teams evaluating {category} in {market}?" },
  { archetype: "b2b", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} options for a {persona} buyer in {market}." },
  { archetype: "b2b", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} vendors are worth a demo?" },
  { archetype: "b2b", intent: "comparison", variantKey: "v1", text: "Compare {brand_list} for a {persona} buyer in {market}." },
  { archetype: "b2b", intent: "comparison", variantKey: "v2", text: "How do {brand_list} stack up for {persona} teams in {market}?" },
  { archetype: "b2b", intent: "comparison", variantKey: "v3", text: "Among {brand_list}, which fits a {persona} in {market} best, and why?" },
  { archetype: "b2b", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good fit for {persona} teams that care about {attribute_list}?" },
  { archetype: "b2b", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to a {persona} prioritizing {attribute_list}?" },
  { archetype: "b2b", intent: "validation", variantKey: "v3", text: "For a {persona} that values {attribute_list}, what are {client_brand}'s strengths and weaknesses?" },
  { archetype: "b2b", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "b2b", intent: "objection", variantKey: "v2", text: "What are the most common criticisms of {client_brand} from {persona} buyers?" },
  { archetype: "b2b", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide against {client_brand}?" },

  { archetype: "consumer_product", intent: "discovery", variantKey: "v1", text: "What {category} options should a {persona} in {market} consider for {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "discovery", variantKey: "v2", text: "Which {category} products are worth trying for a {persona} in {market} focused on {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What should I buy or try for {job_to_be_done}?" },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v1", text: "What are the best {category} choices for a {persona} in {market}?" },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} options for someone like a {persona} in {market}." },
  { archetype: "consumer_product", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} products would you seriously consider?" },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v1", text: "Compare {brand_list} for a {persona} in {market}." },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v2", text: "How do {brand_list} compare for someone who cares about {attribute_list}?" },
  { archetype: "consumer_product", intent: "comparison", variantKey: "v3", text: "Among {brand_list}, which would you pick for a {persona} in {market}, and why?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good choice for a {persona} who cares about {attribute_list}?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to someone prioritizing {attribute_list}?" },
  { archetype: "consumer_product", intent: "validation", variantKey: "v3", text: "For a {persona}, what are {client_brand}'s strengths and weaknesses around {attribute_list}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v2", text: "What do people most often criticize about {client_brand}?" },
  { archetype: "consumer_product", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide not to choose {client_brand}?" },
  ...REPRESENTATION_PROMPTS.map((prompt) => ({
    archetype: "consumer_product" as const,
    intent: "representation" as const,
    ...prompt,
    frameAspects: ["framing_associations" as const],
  })),

  { archetype: "consumer_venue", intent: "discovery", variantKey: "v1", text: "Where should a {persona} in {market} go for {job_to_be_done}?" },
  { archetype: "consumer_venue", intent: "discovery", variantKey: "v2", text: "What {category} places should a {persona} in {market} consider?" },
  { archetype: "consumer_venue", intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What places should I check out for {job_to_be_done}?" },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v1", text: "What are the best {category} places for a {persona} in {market}?" },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v2", text: "Rank the leading {category} spots for someone like a {persona} in {market}." },
  { archetype: "consumer_venue", intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} places would you seriously consider visiting?" },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v1", text: "Compare {brand_list} for a {persona} in {market}." },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v2", text: "How do {brand_list} compare for someone who cares about {attribute_list}?" },
  { archetype: "consumer_venue", intent: "comparison", variantKey: "v3", text: "Among {brand_list}, where should a {persona} in {market} go, and why?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v1", text: "Is {client_brand} a good place for a {persona} who cares about {attribute_list}?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to someone looking for {attribute_list}?" },
  { archetype: "consumer_venue", intent: "validation", variantKey: "v3", text: "For a {persona}, what are {client_brand}'s strengths and weaknesses around {attribute_list}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v2", text: "What do visitors most often criticize about {client_brand}?" },
  { archetype: "consumer_venue", intent: "objection", variantKey: "v3", text: "Why might a {persona} decide not to go to {client_brand}?" },
  ...REPRESENTATION_PROMPTS.map((prompt) => ({
    archetype: "consumer_venue" as const,
    intent: "representation" as const,
    ...prompt,
    frameAspects: ["framing_associations" as const],
  })),

  // M23 (D-079): opt-in price/promo variants, active:false by default so the
  // default 40-cell allocation, golden dataset, and mock-e2e expectations
  // are unchanged until an operator deliberately activates them (coverage
  // panel recommendation, matrix board control).
  {
    archetype: "b2b",
    intent: "comparison",
    variantKey: "v4",
    text: "How does pricing compare among {brand_list} for a {persona} buyer in {market}?",
    frameAspects: ["pricing"],
    active: false,
  },
  {
    archetype: "b2b",
    intent: "comparison",
    variantKey: "v5",
    text: "What current deals or discounts make any of {brand_list} worth choosing for a {persona} buyer in {market}?",
    frameAspects: ["promotions"],
    active: false,
  },
  {
    archetype: "consumer_product",
    intent: "comparison",
    variantKey: "v4",
    text: "How does price compare among {brand_list} for a {persona} in {market}?",
    frameAspects: ["pricing"],
    active: false,
  },
  {
    archetype: "consumer_product",
    intent: "comparison",
    variantKey: "v5",
    text: "What deals or discounts make any of {brand_list} worth buying for a {persona} in {market}?",
    frameAspects: ["promotions"],
    active: false,
  },
  {
    archetype: "consumer_venue",
    intent: "comparison",
    variantKey: "v4",
    text: "How do prices compare among {brand_list} for a {persona} in {market}?",
    frameAspects: ["pricing"],
    active: false,
  },
  {
    archetype: "consumer_venue",
    intent: "comparison",
    variantKey: "v5",
    text: "What deals or specials make any of {brand_list} worth visiting for a {persona} in {market}?",
    frameAspects: ["promotions"],
    active: false,
  },
];
