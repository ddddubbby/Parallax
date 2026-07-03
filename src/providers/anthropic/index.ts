import {
  domainFromUrl,
  type LiveCredentials,
  postProviderJson,
  ProviderCallError,
} from "../shared";
import type { Citation, GenerationRequest, GenerationResult, LLMProvider } from "../types";

// Anthropic: grounded audit provider (PV-4). Verified against official docs
// 2026-07-03: Messages API, POST https://api.anthropic.com/v1/messages,
// x-api-key + anthropic-version headers, max_tokens required. Grounded mode
// adds the `web_search_20250305` server tool (the basic version — it works
// on every current model and defaults to direct calls, unlike the newer
// dynamic-filtering versions); citations come back on text blocks as
// `web_search_result_location` entries ({url, title, cited_text}).

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 1024; // max_tokens is required by the Messages API
const GROUNDED_MAX_SEARCHES = 3;

// Verified 2026-07-03 (platform.claude.com pricing): Sonnet 5 introductory
// $2/$10 per 1M through 2026-08-31, then $3/$15. The post-introductory rate
// is used so estimates stay conservative past the switch. Config only (PV-6).
const PRICE_PER_1M_INPUT_USD = 3.0;
const PRICE_PER_1M_OUTPUT_USD = 15.0;
const WEB_SEARCH_COST_PER_CALL_USD = 0.01; // $10 / 1k searches

interface MessagesApiOutput {
  content?: Array<{
    type?: string;
    text?: string;
    citations?: Array<{ type?: string; url?: string; title?: string | null }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  };
  model?: string;
}

export function createAnthropicProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "anthropic",
    displayName: "Anthropic",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const baseUrl = credentials.baseUrl || process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.ANTHROPIC_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "Anthropic",
        `${baseUrl}/v1/messages`,
        { "x-api-key": credentials.apiKey, "anthropic-version": ANTHROPIC_VERSION },
        {
          model,
          max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
          messages: [{ role: "user", content: req.promptText }],
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.mode === "grounded"
            ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: GROUNDED_MAX_SEARCHES }] }
            : {}),
        },
        signal,
      )) as MessagesApiOutput;

      const textBlocks = (parsed.content ?? []).filter((block) => block.type === "text");
      const text = textBlocks.map((block) => block.text ?? "").join("");
      if (!text) {
        throw new ProviderCallError("malformed_output", "Anthropic response contained no text blocks");
      }

      const citations: Citation[] = [];
      const seen = new Set<string>();
      for (const block of textBlocks) {
        for (const citation of block.citations ?? []) {
          if (citation.type !== "web_search_result_location" || !citation.url || seen.has(citation.url)) continue;
          seen.add(citation.url);
          citations.push({
            url: citation.url,
            domain: domainFromUrl(citation.url),
            title: citation.title ?? undefined,
          });
        }
      }

      const tokensIn = parsed.usage?.input_tokens ?? 0;
      const tokensOut = parsed.usage?.output_tokens ?? 0;
      const searchCalls = parsed.usage?.server_tool_use?.web_search_requests ?? 0;
      const costUsd =
        (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        searchCalls * WEB_SEARCH_COST_PER_CALL_USD;

      return {
        text,
        citations,
        modelVersion: parsed.model ?? model,
        tokensIn,
        tokensOut,
        costUsd,
        latencyMs: Date.now() - start,
      };
    },

    estimateCostUsd(req: GenerationRequest): number {
      const estimatedInputTokens = Math.ceil(req.promptText.length / 4);
      const estimatedOutputTokens = req.maxOutputTokens ?? 500;
      const searchCost = req.mode === "grounded" ? 2 * WEB_SEARCH_COST_PER_CALL_USD : 0;
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        searchCost
      );
    },
  };
}
