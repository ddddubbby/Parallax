import { type LiveCredentials, postProviderJson } from "../shared";
import type { EmbeddingProvider } from "../types";

// Verified against official OpenAI API docs 2026-07-05:
// POST /v1/embeddings; text-embedding-3-small remains a listed embedding model.
const DEFAULT_BASE_URL = "https://api.openai.com";
const DEFAULT_MODEL = "text-embedding-3-small";
const PRICE_PER_1M_TOKENS_USD = 0.02;

interface EmbeddingsApiResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  model?: string;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

export function estimateOpenAIEmbeddingCostUsd(texts: string[]): number {
  const estimatedTokens = texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
  return (estimatedTokens / 1_000_000) * PRICE_PER_1M_TOKENS_USD;
}

export function createOpenAIEmbeddingProvider(credentials: LiveCredentials): EmbeddingProvider {
  return {
    providerId: "openai",
    displayName: "OpenAI embeddings",
    defaultModel: credentials.defaultModel || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL,

    async embed(req) {
      const baseUrl = credentials.baseUrl || process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
      const model = req.model || credentials.defaultModel || process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_MODEL;
      const parsed = (await postProviderJson(
        "OpenAI embeddings",
        `${baseUrl}/v1/embeddings`,
        { Authorization: `Bearer ${credentials.apiKey}` },
        { model, input: req.texts },
        req.signal,
      )) as EmbeddingsApiResponse;

      // Return the raw vectors and cost WITHOUT throwing on a wrong count /
      // invalid shape: a 200 response is already billed, so the caller must
      // record its cost before validating (D-022, mirroring the audit
      // extraction adapter which returns raw payload for the service to
      // validate). Shape validation lives in liveSsrScore.
      const rows = parsed.data ?? [];
      const vectors = [...rows]
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((row) => row.embedding) as number[][];

      const tokens = parsed.usage?.total_tokens ?? parsed.usage?.prompt_tokens ?? 0;
      return {
        vectors,
        model: parsed.model ?? model,
        tokens,
        costUsd: (tokens / 1_000_000) * PRICE_PER_1M_TOKENS_USD,
      };
    },

    estimateCostUsd(req) {
      return estimateOpenAIEmbeddingCostUsd(req.texts);
    },
  };
}
