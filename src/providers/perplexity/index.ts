import {
  domainFromUrl,
  type LiveCredentials,
  postProviderJson,
  ProviderCallError,
} from "../shared";
import type { Citation, GenerationRequest, GenerationResult, LLMProvider } from "../types";

// Perplexity: grounded audit provider (PV-4) — and the first grounded-ONLY
// one: every sonar call searches the web, so an "ungrounded Perplexity
// sample" is not a thing this API can produce (supportsUngrounded: false;
// run planning skips those pairs per PV-5's existing machinery). Verified
// against official docs 2026-07-03: POST https://api.perplexity.ai/v1/sonar
// (the docs' current endpoint — NOT the older /chat/completions), Bearer
// auth, chat-completions-shaped body, `citations[]` (bare URLs) plus
// `search_results[]` ({title, url, snippet, ...}) in the response.

const DEFAULT_BASE_URL = "https://api.perplexity.ai";
const DEFAULT_MODEL = "sonar";

// Verified 2026-07-03 (docs.perplexity.ai pricing): sonar $1/$1 per 1M
// tokens plus a per-request search fee tiered by context size ($5/$8/$12
// per 1k for low/medium/high) — medium assumed. Config only (PV-6).
const PRICE_PER_1M_INPUT_USD = 1.0;
const PRICE_PER_1M_OUTPUT_USD = 1.0;
const REQUEST_FEE_USD = 0.008; // $8 / 1k requests, medium search context

interface SonarApiOutput {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ title?: string | null; url?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

export function createPerplexityProvider(credentials: LiveCredentials): LLMProvider {
  return {
    id: "perplexity",
    displayName: "Perplexity",
    supportsGrounded: true,
    supportsUngrounded: false,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      if (req.mode === "ungrounded") {
        throw new ProviderCallError(
          "unsupported_mode",
          "Perplexity is grounded-only — every sonar call searches the web (PV-5)",
        );
      }
      const baseUrl = credentials.baseUrl || process.env.PERPLEXITY_BASE_URL || DEFAULT_BASE_URL;
      const model = credentials.defaultModel || process.env.PERPLEXITY_DEFAULT_MODEL || DEFAULT_MODEL;
      const start = Date.now();

      const parsed = (await postProviderJson(
        "Perplexity",
        `${baseUrl}/v1/sonar`,
        { Authorization: `Bearer ${credentials.apiKey}` },
        {
          model,
          messages: [{ role: "user", content: req.promptText }],
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxOutputTokens !== undefined ? { max_tokens: req.maxOutputTokens } : {}),
        },
        signal,
      )) as SonarApiOutput;

      const text = parsed.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.length === 0) {
        throw new ProviderCallError("malformed_output", "Perplexity response missing choices[0].message.content");
      }

      // search_results carries titles; citations is bare URLs. Merge them,
      // preferring the titled entries, deduplicated by URL.
      const citations: Citation[] = [];
      const seen = new Set<string>();
      for (const result of parsed.search_results ?? []) {
        if (!result.url || seen.has(result.url)) continue;
        seen.add(result.url);
        citations.push({ url: result.url, domain: domainFromUrl(result.url), title: result.title ?? undefined });
      }
      for (const url of parsed.citations ?? []) {
        if (!url || seen.has(url)) continue;
        seen.add(url);
        citations.push({ url, domain: domainFromUrl(url) });
      }

      const tokensIn = parsed.usage?.prompt_tokens ?? 0;
      const tokensOut = parsed.usage?.completion_tokens ?? 0;
      const costUsd =
        (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        REQUEST_FEE_USD;

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
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD +
        REQUEST_FEE_USD
      );
    },
  };
}
