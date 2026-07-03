import { classifyHttpStatus, type LiveCredentials, ProviderCallError } from "../shared";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";

// DeepSeek: first live validation provider (D-007, PV-2). Verified against
// official docs 2026-07-03: OpenAI-compatible Chat Completions,
// POST https://api.deepseek.com/chat/completions (no /v1/ segment), Bearer
// auth. supportsGrounded stays false until a verified grounded/citation
// path exists (PV-5) — DeepSeek's plain chat completions API returns no
// citations.

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

// Per-1M-token pricing, cache-miss rates (conservative — we cannot predict
// cache hits ahead of a call). Verified against official docs 2026-07-03;
// treated as config, never hard-coded into cost logic elsewhere (PV-6).
const PRICE_PER_1M_INPUT_USD = 0.14;
const PRICE_PER_1M_OUTPUT_USD = 0.28;

// ProviderCallError and the credentials shape moved to ../shared in M9 when
// four more adapters arrived; re-exported so M8-era importers keep working.
export { ProviderCallError };
export type DeepSeekCallCredentials = LiveCredentials;

/**
 * Shared by generation and extraction (both are chat completions calls) —
 * see src/providers/deepseek/extraction.ts. D-020: a non-null base_url/
 * default_model on the credential row overrides the env/default.
 */
export async function callDeepSeekChat(
  credentials: DeepSeekCallCredentials,
  body: { messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number; response_format?: { type: "json_object" } },
  signal?: AbortSignal,
): Promise<{ text: string; tokensIn: number; tokensOut: number; costUsd: number; latencyMs: number; model: string }> {
  const baseUrl = credentials.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL;
  const model = credentials.defaultModel || process.env.DEEPSEEK_DEFAULT_MODEL || DEFAULT_MODEL;
  const start = Date.now();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify({ model, ...body }),
      signal,
    });
  } catch (err) {
    // AbortController.abort() rejects with "AbortError"; AbortSignal.timeout()
    // (what the worker actually passes) rejects with "TimeoutError".
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new ProviderCallError("timeout", "DeepSeek request timed out or was aborted");
    }
    throw new ProviderCallError("server_error", `DeepSeek request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const errorType = classifyHttpStatus(response.status);
    const bodyText = await response.text().catch(() => "");
    throw new ProviderCallError(errorType, `DeepSeek returned ${response.status}: ${bodyText.slice(0, 500)}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ProviderCallError("malformed_output", "DeepSeek response was not valid JSON");
  }

  const parsed = json as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };
  const text = parsed.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new ProviderCallError("malformed_output", "DeepSeek response missing choices[0].message.content");
  }

  const tokensIn = parsed.usage?.prompt_tokens ?? 0;
  const tokensOut = parsed.usage?.completion_tokens ?? 0;
  const costUsd = (tokensIn / 1_000_000) * PRICE_PER_1M_INPUT_USD + (tokensOut / 1_000_000) * PRICE_PER_1M_OUTPUT_USD;

  return { text, tokensIn, tokensOut, costUsd, latencyMs, model: parsed.model ?? model };
}

/**
 * D-022: run planning includes one estimated extraction call per planned
 * generation call. Conservative sizing for the extraction prompt (schema
 * instructions + fact sheet + a typical answer, ~2500 tokens in) and its
 * structured JSON reply (~600 tokens out) — an overestimate is the safe
 * direction for a pre-run cap check.
 */
export function estimateExtractionCostUsd(): number {
  const EST_INPUT_TOKENS = 2_500;
  const EST_OUTPUT_TOKENS = 600;
  return (
    (EST_INPUT_TOKENS / 1_000_000) * PRICE_PER_1M_INPUT_USD +
    (EST_OUTPUT_TOKENS / 1_000_000) * PRICE_PER_1M_OUTPUT_USD
  );
}

/**
 * The registry entry has no credentials of its own (C-11 — never env-var
 * API keys); callers must resolve a decrypted credential and pass it via
 * this factory before the adapter can actually call DeepSeek.
 */
export function createDeepSeekProvider(credentials: DeepSeekCallCredentials): LLMProvider {
  return {
    id: "deepseek",
    displayName: "DeepSeek",
    supportsGrounded: false,
    supportsUngrounded: true,
    defaultModel: credentials.defaultModel || DEFAULT_MODEL,
    concurrency: 3,

    async generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      if (req.mode === "grounded") {
        throw new ProviderCallError("unsupported_mode", "DeepSeek does not support grounded mode (PV-5)");
      }
      const result = await callDeepSeekChat(
        credentials,
        {
          messages: [{ role: "user", content: req.promptText }],
          temperature: req.temperature,
          max_tokens: req.maxOutputTokens,
        },
        signal,
      );
      return {
        text: result.text,
        citations: [], // DeepSeek's plain chat API returns no citations (PV-5)
        modelVersion: result.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      };
    },

    estimateCostUsd(req: GenerationRequest): number {
      // Rough pre-call estimate: ~4 chars/token, output capped by maxOutputTokens
      // or a conservative default. Real cost comes from the API's usage field.
      const estimatedInputTokens = Math.ceil(req.promptText.length / 4);
      const estimatedOutputTokens = req.maxOutputTokens ?? 500;
      return (
        (estimatedInputTokens / 1_000_000) * PRICE_PER_1M_INPUT_USD +
        (estimatedOutputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT_USD
      );
    },
  };
}
