import { parseResponsesOutput, type ResponsesApiOutput } from "../responses-api";
import { type LiveCredentials, postProviderJson, REASONING_EFFORT, withReasoningEffort } from "../shared";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";

// OpenAI: grounded audit provider (PV-4). Verified against official docs
// 2026-07-03: Responses API, POST https://api.openai.com/v1/responses,
// Bearer auth. Grounded mode adds the `web_search` built-in tool; cited
// sources come back as `url_citation` annotations ({url, title}) on the
// message output's text parts. gpt-5.5 is the current primary model.

const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "gpt-5.5";

// Verified 2026-07-03 (developers.openai.com pricing). Config only (PV-6).
const PRICE_PER_1M_INPUT_USD = 5.0;
const PRICE_PER_1M_OUTPUT_USD = 30.0;
const WEB_SEARCH_COST_PER_CALL_USD = 0.01; // $10 / 1k calls, all models

export function createOpenAIProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "openai",
    displayName: "OpenAI",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const baseUrl = credentials.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.OPENAI_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "OpenAI",
        `${baseUrl}/v1/responses`,
        { Authorization: `Bearer ${credentials.apiKey}` },
        {
          model,
          input: req.promptText,
          reasoning: { effort: REASONING_EFFORT },
          ...(req.mode === "grounded" ? { tools: [{ type: "web_search" }] } : {}),
          ...(req.maxOutputTokens !== undefined ? { max_output_tokens: req.maxOutputTokens } : {}),
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        },
        signal,
      )) as ResponsesApiOutput;

      const { text, citations, searchCalls, tokensIn, tokensOut } = parseResponsesOutput("OpenAI", parsed);
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
      const estimatedInputTokens = Math.ceil(req.promptText.length / 4);
      const estimatedOutputTokens = req.maxOutputTokens ?? 500;
      // Grounded answers typically run 1–3 searches; estimate 2.
      const searchCost = req.mode === "grounded" ? 2 * WEB_SEARCH_COST_PER_CALL_USD : 0;
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        searchCost
      );
    },
  };
}
