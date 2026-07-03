import {
  domainFromUrl,
  type LiveCredentials,
  postProviderJson,
  ProviderCallError,
} from "../shared";
import type { Citation, GenerationRequest, GenerationResult, LLMProvider } from "../types";

// Google (Gemini — prose says Gemini, code says `google` per the glossary):
// grounded audit provider (PV-4). Verified against official docs 2026-07-03:
// POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent,
// x-goog-api-key header, google_search tool for grounding, usageMetadata
// token fields, and grounding billed per query ($35/1k for 2.5 models).
//
// CAVEAT (recorded in ENGINEERING_SPEC §3): Google's docs now foreground a
// new "Interactions API", and the generateContent grounding-response shape
// could not be re-verified from the live pages on the implementation date.
// The parsing below follows the documented stable generateContent schema
// (candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}) and
// parses defensively — a grounded response with an unexpected shape yields
// empty citations (a visible, honest observation) rather than a crash. The
// first live grounded validation run must confirm this shape before any
// grounded audit-grade run uses this provider.

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MODEL = "gemini-2.5-flash";

// Verified 2026-07-03 (ai.google.dev pricing, gemini-2.5-flash). Config only (PV-6).
const PRICE_PER_1M_INPUT_USD = 0.3;
const PRICE_PER_1M_OUTPUT_USD = 2.5;
const GROUNDED_PROMPT_COST_USD = 0.035; // $35 / 1k grounded prompts (2.5 models)

interface GenerateContentOutput {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      webSearchQueries?: string[];
    };
  }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  modelVersion?: string;
}

export function createGoogleProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "google",
    displayName: "Gemini",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const baseUrl = credentials.baseUrl || process.env.GOOGLE_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.GOOGLE_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "Gemini",
        `${baseUrl}/v1beta/models/${model}:generateContent`,
        { "x-goog-api-key": credentials.apiKey },
        {
          contents: [{ parts: [{ text: req.promptText }] }],
          ...(req.mode === "grounded" ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
            ...(req.maxOutputTokens !== undefined ? { maxOutputTokens: req.maxOutputTokens } : {}),
          },
        },
        signal,
      )) as GenerateContentOutput;

      const candidate = parsed.candidates?.[0];
      const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
      if (!text) {
        throw new ProviderCallError("malformed_output", "Gemini response contained no candidate text");
      }

      const citations: Citation[] = [];
      const seen = new Set<string>();
      for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
        const uri = chunk.web?.uri;
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        citations.push({ url: uri, domain: domainFromUrl(uri), title: chunk.web?.title });
      }

      const tokensIn = parsed.usageMetadata?.promptTokenCount ?? 0;
      const tokensOut = parsed.usageMetadata?.candidatesTokenCount ?? 0;
      // Grounding is billed per grounded prompt for 2.5 models — one flat
      // charge when the model actually searched (webSearchQueries present).
      const searched = (candidate?.groundingMetadata?.webSearchQueries?.length ?? 0) > 0;
      const costUsd =
        (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        (req.mode === "grounded" && searched ? GROUNDED_PROMPT_COST_USD : 0);

      return {
        text,
        citations,
        modelVersion: parsed.modelVersion ?? model,
        tokensIn,
        tokensOut,
        costUsd,
        latencyMs: Date.now() - start,
      };
    },

    estimateCostUsd(req: GenerationRequest): number {
      const estimatedInputTokens = Math.ceil(req.promptText.length / 4);
      const estimatedOutputTokens = req.maxOutputTokens ?? 500;
      const groundingCost = req.mode === "grounded" ? GROUNDED_PROMPT_COST_USD : 0;
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        groundingCost
      );
    },
  };
}
