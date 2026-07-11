/**
 * framing-protocol.v4 blind SPAN extractor (D-098 §1).
 * The model authors NO identity — only character-offset spans into the immutable
 * raw text. Server validates raw_text[start:end] reproduces exactly; unsupported
 * spans are rejected and counted, never stitched. Free-form gloss is
 * reviewer-convenience only. Blind input: raw text + observed brand name + schema.
 */
import { z } from "zod";
import { createOpenAIProvider } from "../../src/providers/openai";
import type { LiveCredentials } from "../../src/providers/shared";
import { HARNESS_PROVIDER_TIMEOUT_MS, withProviderRetry } from "./shared";

/**
 * Extraction engine (pinned protocol parameter, D-098). Switched from
 * deepseek-v4-flash to gpt-5.4-nano after CAL surfaced a DeepSeek json_object
 * ceiling: v4 span extraction emits a span list that GROWS with response
 * length, and DeepSeek returns an empty/non-JSON 200 for large json outputs
 * (~23% of dev responses >6000 chars failed; DeepSeek also proved intermittently
 * unreliable at any length). gpt-5.4-nano one-shots the longest responses, is
 * the cheapest OpenAI tier ($0.20/$1.25 per 1M), and is cheaper per-call than
 * DeepSeek was. The bounded-output AUDIT extractor is unaffected and stays on
 * DeepSeek (D-041) — verified: 168 long audit responses all extracted valid.
 */
export const V4_EXTRACTION_MODEL = "gpt-5.4-nano";
const V4_EXTRACTION_PRICE = { in: 0.2, out: 1.25 }; // USD per 1M tokens, gpt-5.4-nano (2026-07)

export const V4_DIMENSIONS = [
  "category",
  "offering",
  "audience",
  "occasion",
  "attribute",
  "differentiator",
  "concern",
  "uncertainty",
] as const;
export const V4_STANCES = ["stated", "implied", "hedged"] as const;
export const V4_STATES = [
  "ok",
  "no_frame",
  "uncertain",
  "insufficient_evidence",
  "entity_ambiguous",
  "malformed",
] as const;
export type V4State = (typeof V4_STATES)[number];

const spanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  dimension: z.enum(V4_DIMENSIONS),
  stance: z.enum(V4_STANCES),
  gloss: z.string().max(60).optional(),
});
const envelopeSchema = z.object({
  schema_version: z.literal(4),
  state: z.enum(V4_STATES),
  spans: z.array(spanSchema),
});

export interface VerifiedSpan {
  start: number;
  end: number;
  text: string; // exact raw_text[start:end]
  dimension: (typeof V4_DIMENSIONS)[number];
  stance: (typeof V4_STANCES)[number];
  gloss: string | null;
}

export interface V4ExtractionResult {
  state: V4State;
  spans: VerifiedSpan[];
  droppedSpans: number; // offset-unsupported, rejected
  parseError: string | null;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  extractorInput: string;
}

export const V4_SCHEMA_INSTRUCTIONS = `You will be given an ANSWER TEXT about an OBSERVED BRAND. Return ONLY a JSON object — no markdown fences:
{
  "schema_version": 4,
  "state": "ok" | "no_frame" | "uncertain" | "insufficient_evidence" | "entity_ambiguous" | "malformed",
  "spans": [
    { "start": <int>, "end": <int>, "dimension": "category|offering|audience|occasion|attribute|differentiator|concern|uncertainty", "stance": "stated|implied|hedged", "gloss": "<=60 chars, optional" }
  ]
}
Rules:
- Each span is a [start, end) CHARACTER offset into the ANSWER TEXT exactly as given (0-indexed, end exclusive). The substring answer_text[start:end] must be an EXACT, verbatim, contiguous slice — do not paraphrase, trim, or merge across gaps.
- A span marks a stretch of text that frames the OBSERVED BRAND on one dimension (what it is / offers / who for / when used / an attribute, differentiator, concern, or expressed uncertainty).
- stance: "stated" (explicit), "implied" (entailed but not explicit), "hedged" (uncertain/qualified wording — this is how you record uncertainty; there is no uncertainty instruction).
- gloss is a short human label for reviewers only; it has no scoring role — keep spans precise regardless of gloss.
- If the answer barely mentions the brand or gives no framing: state "insufficient_evidence" or "no_frame", spans: [].
- If the brand NAME alone cannot identify which entity is meant (ambiguous/generic): state "entity_ambiguous", spans: [].
- Use only the ANSWER TEXT; never external knowledge about the brand.
- Prefer several precise short spans over one long span. Offsets must be exact — they are validated.`;

export function buildV4ExtractionPrompt(input: { observedBrandName: string; rawText: string }): string {
  return `OBSERVED BRAND NAME: ${input.observedBrandName}

ANSWER TEXT:
"""
${input.rawText}
"""

${V4_SCHEMA_INSTRUCTIONS}`;
}

export async function callV4SpanExtraction(
  credentials: LiveCredentials,
  input: { observedBrandName: string; rawText: string },
): Promise<V4ExtractionResult> {
  const extractorInput = buildV4ExtractionPrompt(input);
  // gpt-5.4-nano via /v1/responses (no per-model json mode needed — the schema
  // says "return ONLY a JSON object" and salvage parsing handles the rest).
  // Cost is recomputed with nano pricing (the OpenAI adapter's costUsd uses
  // gpt-5.5 defaults, wrong for nano).
  const provider = createOpenAIProvider({ ...credentials, defaultModel: V4_EXTRACTION_MODEL });
  const gen = await withProviderRetry(
    () => provider.generate({ promptText: extractorInput, mode: "ungrounded" }, AbortSignal.timeout(HARNESS_PROVIDER_TIMEOUT_MS)),
    "v4-extract",
  );
  const result = {
    text: gen.text,
    model: gen.modelVersion,
    tokensIn: gen.tokensIn,
    tokensOut: gen.tokensOut,
    costUsd: (gen.tokensIn / 1e6) * V4_EXTRACTION_PRICE.in + (gen.tokensOut / 1e6) * V4_EXTRACTION_PRICE.out,
  };

  let state: V4State = "malformed";
  const spans: VerifiedSpan[] = [];
  let droppedSpans = 0;
  let parseError: string | null = null;
  const raw = input.rawText;
  try {
    const env = envelopeSchema.parse(JSON.parse(result.text));
    state = env.state;
    for (const s of env.spans) {
      // Server-side offset verification: the ONLY thing that makes a span real.
      if (s.start >= s.end || s.end > raw.length) {
        droppedSpans += 1;
        continue;
      }
      const text = raw.slice(s.start, s.end);
      if (text.length === 0 || text.trim().length === 0) {
        droppedSpans += 1;
        continue;
      }
      spans.push({ start: s.start, end: s.end, text, dimension: s.dimension, stance: s.stance, gloss: s.gloss ?? null });
    }
    if (state === "ok" && spans.length === 0 && env.spans.length > 0) {
      // model claimed ok but every span failed verification
      parseError = `all ${env.spans.length} spans failed offset verification`;
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    state = "malformed";
  }

  return {
    state,
    spans,
    droppedSpans,
    parseError,
    model: result.model,
    costUsd: result.costUsd,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    extractorInput,
  };
}

/** Deduplicate spans by exact text (case-insensitive, whitespace-normalized) — the mapping-budget unit. */
export function dedupSpanTexts(spans: VerifiedSpan[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of spans) {
    const key = s.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(s.text.trim());
    }
  }
  return out;
}
