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

export class ProviderCallError extends Error {
  constructor(
    public readonly errorType: "rate_limit" | "timeout" | "server_error" | "auth_error" | "malformed_output" | "unsupported_mode",
    message: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

function classifyHttpStatus(status: number): ProviderCallError["errorType"] {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server_error";
  return "server_error";
}

export interface DeepSeekCallCredentials {
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
}

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
    if (err instanceof Error && err.name === "AbortError") {
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
