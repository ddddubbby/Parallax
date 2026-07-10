import { createHash } from "node:crypto";

export const V3_PROTOCOL_VERSION = "framing-protocol.v3";
export const V3_PROMPT_VERSION = "representation-prompts.v3";
export const V3_EXTRACTION_VERSION = "blind-frame-extraction.v3";
export const V3_CLUSTERING_VERSION = "complete-link-concepts.v1";
export const V3_REVIEW_VERSION = "blind-review.v1";

export const V3_ADMISSION_PROMPTS = [
  { variantKey: "a1", text: "What is {client_brand}?" },
  { variantKey: "a2", text: "Tell me about {client_brand}." },
  { variantKey: "a3", text: "How would you describe {client_brand}?" },
  { variantKey: "a4", text: "In a few sentences, explain {client_brand}." },
  { variantKey: "a5", text: "Describe {client_brand} in your own words." },
  { variantKey: "a6", text: "Provide a brief overview of {client_brand}." },
] as const;

export const V3_DIAGNOSTIC_PROBES = [
  { variantKey: "p1-offering", text: "What does {client_brand} make or offer?" },
  { variantKey: "p2-audience", text: "Who is {client_brand} typically for?" },
] as const;

export const UNCERTAINTY_ALLOWANCE_V3 =
  "If you are unsure about any detail, say so rather than guessing.";

export type PromptArm = "with_uncertainty_clause" | "without_uncertainty_clause";

export function resolveV3Prompt(
  template: string,
  brandName: string,
  arm: PromptArm,
): string {
  const base = template.replaceAll("{client_brand}", brandName);
  return arm === "with_uncertainty_clause"
    ? `${base} ${UNCERTAINTY_ALLOWANCE_V3}`
    : base;
}

export const V3_DIMENSIONS = [
  "category",
  "offering",
  "audience",
  "occasion",
  "attribute",
  "differentiator",
  "concern",
  "uncertainty",
] as const;

export type V3Dimension = (typeof V3_DIMENSIONS)[number];
export const V3_FRAME_KINDS = ["identity", "association"] as const;
export type V3FrameKind = (typeof V3_FRAME_KINDS)[number];
export const V3_STANCES = ["stated", "implied", "hedged"] as const;
export type V3Stance = (typeof V3_STANCES)[number];
export const V3_TERMINAL_STATES = [
  "ok",
  "insufficient_evidence",
  "no_frame",
  "uncertain",
  "entity_ambiguous",
  "malformed",
] as const;
export type V3TerminalState = (typeof V3_TERMINAL_STATES)[number];

export const V3_EXTRACTION_INSTRUCTIONS = `Return ONLY a JSON object with exactly these keys — no markdown fences:
{
  "schema_version": 3,
  "state": "ok" | "insufficient_evidence" | "no_frame" | "uncertain" | "entity_ambiguous" | "malformed",
  "frames": [
    {
      "concept_label": "<lowercase 1-5 word noun phrase for the underlying concept>",
      "frame_dimension": "category" | "offering" | "audience" | "occasion" | "attribute" | "differentiator" | "concern" | "uncertainty",
      "frame_kind": "identity" | "association",
      "stance": "stated" | "implied" | "hedged",
      "evidence_quote": "<16-240 character exact contiguous substring copied from ANSWER TEXT>"
    }
  ]
}
Concept rules:
- A concept names what the brand is/offers or an association attached to it. Dimension is a tag on this observation, not part of concept identity.
- Use the same concept_label when the same concept could legitimately be tagged under more than one dimension.
- Keep strategically distinct concepts separate (for example "budget action camera" and "professional action camera").
- identity = what the brand is or offers; association = audience, occasion, attribute, differentiator, concern, or uncertainty.
- Never include the observed brand name in concept_label. Never infer from external knowledge.
Evidence rules:
- evidence_quote must be copied exactly and contiguously from ANSWER TEXT. Do not stitch passages, normalize punctuation, add ellipses, or paraphrase.
- If no exact supporting substring of 16-240 characters exists, omit that frame.
- If every candidate frame lacks exact support, return insufficient_evidence with frames: [].
State rules:
- entity_ambiguous means the answer may discuss a different entity with the same or similar name.
- no_frame means the brand is present but no usable framing is expressed.
- uncertain means the answer is too hedged to support a clear frame.
- malformed means the answer is empty or garbled.
- Every object includes every listed field; use [] instead of omitting frames.`;

export function buildV3ExtractionPrompt(input: {
  observedBrandName: string;
  rawText: string;
}): string {
  return `OBSERVED BRAND NAME: ${input.observedBrandName}\n\nANSWER TEXT:\n\"\"\"\n${input.rawText}\n\"\"\"\n\n${V3_EXTRACTION_INSTRUCTIONS}`;
}

export const V3_PREREGISTERED_RULES = {
  repetitionsPerVariant: 5,
  admissionVariantKeys: V3_ADMISSION_PROMPTS.map((prompt) => prompt.variantKey),
  diagnosticProbeKeys: V3_DIAGNOSTIC_PROBES.map((prompt) => prompt.variantKey),
  conceptWinsVariantAt: 3,
  conceptWinsRequired: 5,
  leaveOneVariantOutWinsRequired: 4,
  atLeastOneStableIdentityConcept: true,
  multipleStableConceptsAllowed: true,
  clusteringMethod: "complete_link" as const,
  clusteringThresholdCandidates: [0.78, 0.8, 0.82, 0.85, 0.88],
  thresholdSelection:
    "Choose the highest candidate that passes synonym-consolidation and polysemy controls while keeping distinct-concept and over-merge controls separate; no brand data participates.",
  uncertaintyClauseDecision:
    "Retain the clause only if, for every development provider, it reduces entity_ambiguous|uncertain|insufficient_evidence by at least 10 percentage points and the stable-concept set is identical (Jaccard=1). Otherwise omit it.",
  organicCellQualifyMentions: 3,
  organicConceptCellMajority: true,
  organicConceptWinsRequired: 5,
  reviewBlinding:
    "Review packets contain labels, dimensions and support excerpts only; never counts, variants, cells, providers, prevalence or eligibility. Mapping locks before scoring.",
  heldoutGate: {
    crocs: "must yield an eligible profile with at least one stable identity concept",
    xiaomi:
      "must preserve multiple distinct stable identities or abstain; must not pass by merging strategically distinct categories",
    controls: "all four controls must pass",
    tuning: "any method change after held-out scoring means v4 and replacement held-outs",
  },
} as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}
