/**
 * M34 Phase 0 — draft protocol surfaces.
 *
 * These strings are candidates until analyze.ts freezes them into
 * fixtures/framing/*. After GO they are promoted verbatim into Phase 1/2
 * production code. Do not silently edit after freeze.
 */

/** Shared uncertainty allowance appended to every representation prompt (BF-3). */
export const UNCERTAINTY_ALLOWANCE =
  "If you are unsure about any detail, say so rather than guessing.";

/**
 * Six minimally-leading, brand-named but non-evaluative representation prompts.
 * Only placeholder: `{client_brand}`. No persona/market/category/JTBD/
 * attributes/competitors/recommendation/purchase vocabulary.
 *
 * Perturbations vary the description angle (identity, overview, description,
 * activity, audience, concise summary) while keeping the uncertainty clause
 * identical — a systematic difference from the organic-in-context lane.
 */
export const REPRESENTATION_PROMPTS_V1 = [
  {
    variantKey: "v1",
    text: `What is {client_brand}? ${UNCERTAINTY_ALLOWANCE}`,
  },
  {
    variantKey: "v2",
    text: `Tell me about {client_brand}. ${UNCERTAINTY_ALLOWANCE}`,
  },
  {
    variantKey: "v3",
    text: `How would you describe {client_brand}? ${UNCERTAINTY_ALLOWANCE}`,
  },
  {
    variantKey: "v4",
    text: `What does {client_brand} make or offer? ${UNCERTAINTY_ALLOWANCE}`,
  },
  {
    variantKey: "v5",
    text: `Who is {client_brand} typically for? ${UNCERTAINTY_ALLOWANCE}`,
  },
  {
    variantKey: "v6",
    text: `In a few sentences, explain {client_brand}. ${UNCERTAINTY_ALLOWANCE}`,
  },
] as const;

export const FRAME_DIMENSIONS = [
  "category",
  "offering",
  "audience",
  "occasion",
  "attribute",
  "differentiator",
  "concern",
  "uncertainty",
] as const;

export type FrameDimension = (typeof FRAME_DIMENSIONS)[number];

export const FRAME_STANCES = ["stated", "implied", "hedged"] as const;
export type FrameStance = (typeof FRAME_STANCES)[number];

export const FRAME_TERMINAL_STATES = [
  "ok",
  "insufficient_evidence",
  "no_frame",
  "uncertain",
  "malformed",
] as const;

export type FrameTerminalState = (typeof FRAME_TERMINAL_STATES)[number];

/**
 * Blind frame-extraction schema instructions.
 * Input contract (enforced by the assembler): raw text + observed brand name
 * + this schema ONLY. Never fact sheet, attributes, competitors, prompt, or
 * operator labels.
 */
export const BLIND_FRAME_SCHEMA_INSTRUCTIONS = `Return ONLY a JSON object with exactly these keys — no other keys, no markdown fences:
{
  "schema_version": 1,
  "state": "ok" | "insufficient_evidence" | "no_frame" | "uncertain" | "malformed",
  "frames": [
    {
      "frame_label": "<canonical noun phrase naming the framing — see LABEL RULES>",
      "frame_dimension": "category" | "offering" | "audience" | "occasion" | "attribute" | "differentiator" | "concern" | "uncertainty",
      "stance": "stated" | "implied" | "hedged",
      "evidence_quote": "<exact quote from the answer text supporting this frame; if longer than 240 characters, truncate to the first 240 characters>"
    }
  ]
}
LABEL RULES (frame_label):
- lowercase; 1 to 4 words; singular where natural.
- Use the most GENERIC phrase that still captures the frame: "action camera", not "consumer action camera company".
- Never include the observed brand name in the label (every frame is already about it).
- Never join two framings with "and"/"&"/"/" in one label — emit two separate frame objects instead.
- Reuse the EXACT same label string every time the same underlying framing recurs in your frames list.
Rules:
- Extract how the answer frames the OBSERVED BRAND — the story it tells about what the brand is, offers, who it is for, when it is used, what attributes or differentiators it carries, or any concerns/uncertainty.
- Include a frame only when the answer text supports it with an exact evidence_quote.
- Do not invent marketing language absent from the text.
- If the answer barely mentions the brand or gives no usable framing, return state "insufficient_evidence" or "no_frame" with frames: [].
- If the answer hedges heavily without a clear frame, return state "uncertain".
- If the answer is empty/garbled, return state "malformed".
- Never use external knowledge about the brand; use only the answer text.
- Every object must include every listed field; use [] rather than omitting keys.`;

export function buildBlindFrameExtractionPrompt(input: {
  observedBrandName: string;
  rawText: string;
}): string {
  return `OBSERVED BRAND NAME: ${input.observedBrandName}

ANSWER TEXT:
"""
${input.rawText}
"""

${BLIND_FRAME_SCHEMA_INSTRUCTIONS}`;
}

/**
 * Draft eligibility thresholds — frozen into fixtures/framing/<protocolVersion>.json on GO.
 *
 * v1 → v2 (2026-07-10, after run 1's NO-GO): INSTRUMENT changes only —
 * blind-extraction prompt gains label-form rules + quote-truncation permission
 * (blind-frame-extraction.v2), label normalization gains conjunct-sort +
 * plural-fold (frame-cluster.v2), and per-frame salvage replaces
 * whole-payload voiding. Every numeric eligibility threshold below is
 * byte-identical to v1. The v1 fixture is retained as the run-1 NO-GO record.
 */
export const DRAFT_ELIGIBILITY = {
  protocolVersion: "framing-protocol.v2",
  promptProtocolVersion: "representation-prompts.v1",
  clusteringVersion: "frame-cluster.v2",
  blindExtractionVersion: "blind-frame-extraction.v2",
  extractionSchemaVersion: 1,
  repetitionsPerVariant: 5,
  variantCount: 6,
  /** Neutral: frame wins a variant at ≥ this many of 5 responses. */
  neutralVariantWinMin: 3,
  /** Neutral: frame must win at least this many of 6 variants. */
  neutralVariantWinsRequired: 5,
  /** Organic: cell qualifies when spontaneous client mentions ≥ this of 5 reps. */
  organicCellQualifyMin: 3,
  /** Organic: frame wins a qualifying cell at majority of client-mentioning responses. */
  organicCellWinMajority: true,
  /** Organic: frame must win at least this many distinct qualifying cells. */
  organicCellWinsRequired: 5,
  /** Propose-only cosine threshold for clustering (Phase 3 default). */
  clusteringCosineThreshold: 0.82,
  /** Sensitivity sweep for Phase 0 analysis. */
  clusteringCosineSweep: [0.78, 0.8, 0.82, 0.85],
  leaveOneOutRequired: true,
  uniqueTopRequired: true,
  tiesFail: true,
} as const;

export const FEASIBILITY_PROJECTS = {
  insta360: { slug: "i-57a09303f357", name: "Insta 360" },
  heytea: { slug: "heytea-be18", name: "Heytea" },
} as const;

/**
 * Scopes whose results are diagnostic-only and may NEVER count toward the
 * Phase-0 GO gate, with the reason recorded. An invalid dataset passing the
 * rules must not freeze the protocol.
 */
export const GATE_EXCLUDED_SCOPES: Record<string, string> = {
  "organic|heytea-be18|deepseek|ungrounded":
    "Heytea is stored with category_archetype=b2b (the D-052 defect): its audit ran B2B-procurement prompt templates against a consumer tea brand, and BF-24 excludes B2B projects from framing baselines. Kept as instrument diagnostics; never gate evidence.",
};

/** Soft spend ceiling for the Phase 0 neutral mini-run (generations + extractions). */
export const NEUTRAL_MINI_RUN_CAP_USD = 8;

/**
 * Per-engine sampling for the neutral lane. This is a PROTOCOL PARAMETER, not
 * an implementation detail: the two engines are not sampled identically.
 *
 * Verified 2026-07-10 against the live API: `gpt-5.5` rejects any non-default
 * temperature on /v1/responses with HTTP 400 ("Unsupported parameter:
 * 'temperature' is not supported with this model.", param=temperature).
 * Omitting it, or sending temperature=1, both return 200. DeepSeek accepts 0.7.
 * `undefined` means "omit the parameter — use the model default".
 *
 * The asymmetry is sound only because each engine is scored as its own
 * population and never pooled (D-080 / C-12). It must be disclosed wherever
 * neutral-lane results are reported, never silently normalized away.
 */
export const NEUTRAL_SAMPLING: Record<"deepseek" | "openai", { temperature: number | undefined }> = {
  deepseek: { temperature: 0.7 },
  openai: { temperature: undefined },
};
