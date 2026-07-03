import { callDeepSeekChat, type DeepSeekCallCredentials, ProviderCallError } from "./index";

// D-022 live extraction engine: the same JSON-mode chat-completions call as
// generation, reused for structured extraction. The prompt deliberately
// omits canonical_brand_id / claims[].brand_id / claims[].matched_fact_claim_id
// — service.ts's SM-4 pipeline always overwrites those via its own
// alias/fact-claim resolution regardless of what any engine (mock or live)
// returns, so asking the model to guess our internal UUIDs would only cost
// tokens for a value nobody reads.

export interface LiveExtractionInput {
  rawText: string;
  trackedBrandNames: string[];
  factClaims: Array<{ type: string; statement: string }>;
}

export interface LiveExtractionResult {
  payload: unknown;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

const SCHEMA_INSTRUCTIONS = `Return ONLY a JSON object with exactly these keys — no other keys, no markdown fences:
{
  "schema_version": 1,
  "answer_summary": "<=200 char summary of the answer text>",
  "brands": [
    {
      "observed_name": "brand name exactly as it appears in the text",
      "aliases_matched": [],
      "mentioned": true,
      "position": <1-based rank of this brand in the answer, or null if unranked>,
      "recommended": <true if the text recommends this brand>,
      "recommendation_strength": "strong" | "soft" | "neutral" | "discouraged",
      "sentiment": "positive" | "neutral" | "mixed" | "negative",
      "attributes": ["<attribute phrases the text associates with this brand>"],
      "evidence_quote": "<=240 char exact quote from the text supporting this entry"
    }
  ],
  "citations": [
    { "url": "...", "domain": "...", "title": "..." or null, "cited_for_brand_ids": ["<brand names this citation supports, as they appear in TRACKED BRANDS>"] }
  ],
  "claims": [
    {
      "claim_text": "<a checkable factual claim the text makes about the CLIENT brand>",
      "claim_type": "pricing" | "feature" | "company_fact" | "security" | "availability" | "other",
      "verdict": "supported" | "contradicted" | "outdated" | "unsupported" | "ambiguous" | "not_checked",
      "severity": "none" | "low" | "medium" | "high",
      "evidence_quote": "<=240 char exact quote"
    }
  ],
  "refusal": <true if the answer text refuses or declines to answer the question>,
  "malformed": <true if the answer text is garbled, empty, or otherwise unusable>
}
Only include brands from TRACKED BRANDS that are actually mentioned (mentioned: true) — omit brands never mentioned. Only include claims that are checkable statements specifically about the CLIENT brand (the first brand in TRACKED BRANDS), judged against FACT SHEET; use verdict "not_checked" when there is no relevant fact-sheet entry to compare against. Every field listed above must be present on every object — use "" or [] rather than omitting a key. If the answer text mentions no brands, cites no sources, or makes no checkable claims, return empty arrays, not omitted keys.`;

function buildExtractionPrompt(input: LiveExtractionInput): string {
  const brandList = input.trackedBrandNames.length > 0 ? input.trackedBrandNames.join(", ") : "(none tracked)";
  const factSheet =
    input.factClaims.length > 0
      ? input.factClaims.map((f) => `- [${f.type}] ${f.statement}`).join("\n")
      : "(no fact sheet entries)";
  return `TRACKED BRANDS (first is the CLIENT brand, the rest are competitors): ${brandList}

FACT SHEET (ground truth for checkable claims about the client brand):
${factSheet}

ANSWER TEXT:
"""
${input.rawText}
"""

${SCHEMA_INSTRUCTIONS}`;
}

/** Backfills the fields service.ts's SM-4 pipeline always overwrites, so Zod's required (nullable) keys are satisfied regardless of what the model returned. */
function normalizeExtractionPayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const brands = Array.isArray(obj.brands)
    ? obj.brands.map((b) => (typeof b === "object" && b !== null ? { canonical_brand_id: null, ...b } : b))
    : obj.brands;
  const claims = Array.isArray(obj.claims)
    ? obj.claims.map((c) =>
        typeof c === "object" && c !== null ? { brand_id: null, matched_fact_claim_id: null, ...c } : c,
      )
    : obj.claims;
  return { ...obj, brands, claims };
}

export async function callDeepSeekExtraction(
  credentials: DeepSeekCallCredentials,
  input: LiveExtractionInput,
  signal?: AbortSignal,
): Promise<LiveExtractionResult> {
  const result = await callDeepSeekChat(
    credentials,
    {
      messages: [{ role: "user", content: buildExtractionPrompt(input) }],
      temperature: 0,
      response_format: { type: "json_object" },
    },
    signal,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    throw new ProviderCallError("malformed_output", "DeepSeek extraction response was not valid JSON");
  }

  return {
    payload: normalizeExtractionPayload(parsed),
    model: result.model,
    costUsd: result.costUsd,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}
