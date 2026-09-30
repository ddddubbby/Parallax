import { parseResponsesOutput, type ResponsesApiOutput } from "../responses-api";
import { type LiveCredentials, postProviderJson, REASONING_EFFORT, withReasoningEffort } from "../shared";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";

// xAI (Grok): live audit engine, M63/D-143 — the model underneath Grok Bot,
// never Grok Bot itself (the app adds memory, plugins and checkout that the
// API does not). Verified against docs.x.ai 2026-09-29: Responses API,
// POST https://api.x.ai/v1/responses, Bearer auth. Grounded mode adds the
// server-side `web_search` tool; inline citations are on by default and come
// back as `url_citation` annotations on `output_text` parts, the same shape
// as OpenAI. `x_search` is deliberately not enabled: it bills per post and
// profile returned, which the pre-run cost estimate cannot bound (C-2).

const DEFAULT_BASE_URL = "https://api.x.ai";
const DEFAULT_MODEL = "grok-4.7";

// Verified 2026-09-29 (docs.x.ai models + pricing). Config only (PV-6).
// The >=200k-prompt-token tier ($4/$12) is unreachable for audit prompts.
const PRICE_PER_1M_INPUT_USD = 2.0;
const PRICE_PER_1M_OUTPUT_USD = 6.0;
const WEB_SEARCH_COST_PER_CALL_USD = 0.005; // $5 / 1k calls

// Grok 4.7 reasons before answering and reasoning tokens count against the
// output cap; a tiny cap (Settings Verify asks for 16) would end the call
// before any output_text exists. Caps below this floor are raised to it.
const MIN_OUTPUT_TOKENS = 1024;
// Reasoning makes answers longer than the 500-token default other adapters
// assume; the pre-run estimate errs high so C-2 guards fail closed.
const ESTIMATED_OUTPUT_TOKENS = 1500;
// D-145: grounded search feeds results back as input tokens. These mirror the
// Muse Spark live evidence (up to 49.7k in, 3.3k out, 4–11 searches) until
// Grok's own first validation run re-pins them.
const GROUNDED_ESTIMATED_INPUT_TOKENS = 40_000;
const GROUNDED_ESTIMATED_OUTPUT_TOKENS = 3_000;
const GROUNDED_ESTIMATED_SEARCHES = 8;

export function createXaiProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "xai",
    displayName: "Grok",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const baseUrl = credentials.baseUrl || process.env.XAI_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.XAI_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "xAI",
        `${baseUrl}/v1/responses`,
        { Authorization: `Bearer ${credentials.apiKey}` },
        {
          model,
          input: req.promptText,
          reasoning: { effort: REASONING_EFFORT },
          ...(req.mode === "grounded" ? { tools: [{ type: "web_search" }] } : {}),
          ...(req.maxOutputTokens !== undefined
            ? { max_output_tokens: Math.max(req.maxOutputTokens, MIN_OUTPUT_TOKENS) }
            : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
        signal,
      )) as ResponsesApiOutput;

      const { text, citations, searchCalls, tokensIn, tokensOut } = parseResponsesOutput("xAI", parsed);
      // If xAI omits web_search_call items from `output`, a cited answer
      // still searched at least once — never bill a grounded answer as free.
      const billedSearches = Math.max(searchCalls, citations.length > 0 ? 1 : 0);
      const costUsd =
        (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        billedSearches * WEB_SEARCH_COST_PER_CALL_USD;

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
