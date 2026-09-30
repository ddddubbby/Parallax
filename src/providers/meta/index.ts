import { parseResponsesOutput, type ResponsesApiOutput } from "../responses-api";
import { type LiveCredentials, postProviderJson, REASONING_EFFORT, withReasoningEffort } from "../shared";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";

// Meta Model API (Muse Spark): live audit engine, M63/D-143 — the model
// underneath the Meta Muse app, never the Muse agent itself (the app adds
// memory, partner merchants and checkout that the API does not). Verified
// against dev.meta.ai 2026-09-29: POST https://api.meta.ai/v1/responses,
// Bearer auth, OpenAI-compatible. Search grounding exists only on the
// Responses API: the `web_search` tool yields a `web_search_call` item per
// search and `url_citation` annotations ({url, title}) on `output_text`.

const DEFAULT_BASE_URL = "https://api.meta.ai";
const DEFAULT_MODEL = "muse-spark-1.3";

// Verified 2026-09-29 (dev.meta.ai pricing, standard tier). Config only (PV-6).
const PRICE_PER_1M_INPUT_USD = 1.25;
const PRICE_PER_1M_OUTPUT_USD = 4.25;
const WEB_SEARCH_COST_PER_CALL_USD = 0.0025; // $2.50 / 1k search queries

// Muse Spark reasons before answering and reasoning tokens count against the
// output cap; a tiny cap (Settings Verify asks for 16) would end the call
// before any output_text exists. Caps below this floor are raised to it.
const MIN_OUTPUT_TOKENS = 1024;
// Reasoning makes answers longer than the 500-token default other adapters
// assume; the pre-run estimate errs high so C-2 guards fail closed.
const ESTIMATED_OUTPUT_TOKENS = 1500;
// D-145, from four live grounded probes (2026-09-29): search results come
// back as input tokens (17.8k–49.7k), answers ran 2.3k–3.3k tokens and each
// call searched 4–11 times. Estimates sit at or above the observed highs.
const GROUNDED_ESTIMATED_INPUT_TOKENS = 40_000;
const GROUNDED_ESTIMATED_OUTPUT_TOKENS = 3_000;
const GROUNDED_ESTIMATED_SEARCHES = 8;

export function createMetaProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "meta",
    displayName: "Muse Spark",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const baseUrl = credentials.baseUrl || process.env.META_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.META_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "Meta",
        `${baseUrl}/v1/responses`,
        { Authorization: `Bearer ${credentials.apiKey}` },
        {
          model,
          input: req.promptText,
          reasoning: { effort: REASONING_EFFORT },
          ...(req.mode === "grounded"
            ? { tools: [{ type: "web_search" }], include: ["web_search_call.results"] }
            : {}),
          ...(req.maxOutputTokens !== undefined
            ? { max_output_tokens: Math.max(req.maxOutputTokens, MIN_OUTPUT_TOKENS) }
            : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
        signal,
      )) as ResponsesApiOutput;

      const { text, citations, searchCalls, tokensIn, tokensOut } = parseResponsesOutput("Meta", parsed);
      const costUsd =
        (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        searchCalls * WEB_SEARCH_COST_PER_CALL_USD;

      return {
        text,
        citations,
        modelVersion: withReasoningEffort(parsed.model ?? model),
        tokensIn,
        tokensOut,
        costUsd,
        latencyMs: Date.now() - start,
      };
    },

    estimateCostUsd(req: GenerationRequest): number {
      const grounded = req.mode === "grounded";
      const promptTokens = Math.ceil(req.promptText.length / 4);
      const estimatedInputTokens = grounded ? Math.max(promptTokens, GROUNDED_ESTIMATED_INPUT_TOKENS) : promptTokens;
      const estimatedOutputTokens = Math.max(
        req.maxOutputTokens ?? (grounded ? GROUNDED_ESTIMATED_OUTPUT_TOKENS : ESTIMATED_OUTPUT_TOKENS),
        MIN_OUTPUT_TOKENS,
      );
      const searchCost = grounded ? GROUNDED_ESTIMATED_SEARCHES * WEB_SEARCH_COST_PER_CALL_USD : 0;
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        searchCost
      );
    },
  };
}
