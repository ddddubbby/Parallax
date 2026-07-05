// LLMProvider interface — frozen contract per DEVELOPMENT_GUIDELINES.md C2.
// Do not add fields here for a single provider's needs; provider-specific
// behavior belongs in that provider's adapter file.

export type ProviderId =
  | "mock"
  | "deepseek"
  | "minimax"
  | "openai"
  | "anthropic"
  | "google"
  | "perplexity";

export type GenerationMode = "grounded" | "ungrounded";

export interface GenerationRequest {
  promptText: string;
  mode: GenerationMode;
  maxOutputTokens?: number;
  temperature?: number;
  /**
   * The 0-based repetition index within the cell's k samples (D-016).
   * Real provider adapters ignore it — it exists so MockProvider can select
   * a different fixture per rep instead of returning the same text k times,
   * which would make repeated sampling pointless in mock mode.
   */
  repIndex?: number;
}

export interface Citation {
  url: string;
  domain: string;
  title?: string;
}

export interface GenerationResult {
  text: string;
  citations: Citation[];
  modelVersion: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

export interface LLMProvider {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
  defaultModel: string;
  concurrency: number;
  generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>;
  estimateCostUsd(req: GenerationRequest): number;
}

export interface EmbeddingProvider {
  providerId: ProviderId;
  displayName: string;
  defaultModel: string;
  embed(req: { texts: string[]; model?: string; signal?: AbortSignal }): Promise<{
    vectors: number[][];
    model: string;
    tokens: number;
    costUsd: number;
  }>;
  estimateCostUsd(req: { texts: string[]; model?: string }): number;
}
