import { getActiveCredential, markInvalid, markUsed } from "@/db/repositories/credentials";
import { decryptApiKey } from "@/modules/settings/crypto";
import { createAnthropicProvider } from "@/providers/anthropic";
import { createDeepSeekProvider } from "@/providers/deepseek";
import { createGoogleProvider } from "@/providers/google";
import { mockProvider } from "@/providers/mock";
import { createOpenAIProvider } from "@/providers/openai";
import { createOpenAIEmbeddingProvider } from "@/providers/openai/embeddings";
import { createPerplexityProvider } from "@/providers/perplexity";
import { type LiveCredentials, ProviderCallError } from "@/providers/shared";
import type { EmbeddingProvider, LLMProvider, ProviderId } from "@/providers/types";

// Credential-aware runtime resolution — distinct from the static,
// metadata-only registry (src/providers/registry.ts), which run creation
// uses for capability/cost-estimate display without touching the network
// or decrypting anything (D-035).

const LIVE_FACTORIES: Partial<Record<ProviderId, (credentials: LiveCredentials) => LLMProvider>> = {
  deepseek: createDeepSeekProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  google: createGoogleProvider,
  perplexity: createPerplexityProvider,
};

/**
 * Decrypts and returns the provider's active credential. D-021: decrypt
 * failure marks the row invalid and prompts re-entry — never crashes the
 * worker.
 */
async function resolveLiveCredentials(providerId: ProviderId): Promise<LiveCredentials> {
  const credential = await getActiveCredential(providerId);
  if (!credential) {
    throw new ProviderCallError("auth_error", `No active ${providerId} credential configured in Settings`);
  }
  const apiKey = decryptApiKey(credential.encryptedApiKey);
  if (apiKey === null) {
    await markInvalid(credential.id);
    throw new ProviderCallError(
      "auth_error",
      `Stored ${providerId} credential could not be decrypted — re-enter it in Settings`,
    );
  }
  await markUsed(credential.id);
  return { apiKey, baseUrl: credential.baseUrl, defaultModel: credential.defaultModel };
}

/** Credential-resolved provider instance for an actual generation call — worker-only. */
export async function resolveRuntimeProvider(providerId: ProviderId): Promise<LLMProvider> {
  if (providerId === "mock") return mockProvider;
  const factory = LIVE_FACTORIES[providerId];
  if (!factory) {
    throw new ProviderCallError("unsupported_mode", `No runtime adapter for provider "${providerId}"`);
  }
  return factory(await resolveLiveCredentials(providerId));
}

/**
 * D-041 (supersedes D-036's reuse-the-generation-provider shortcut): the
 * extraction engine is ONE configured provider+model for all live runs —
 * D-022's original wording — read from EXTRACTION_PROVIDER (default
 * deepseek, the cheapest JSON-capable engine). A live run on any provider
 * therefore requires an active credential for the extraction engine too;
 * Settings surfaces this. Only DeepSeek has an extraction adapter in M9 —
 * pointing EXTRACTION_PROVIDER anywhere else fails loudly here, at the
 * first extraction attempt, not silently.
 */
export async function resolveExtractionCredentials(): Promise<LiveCredentials> {
  const engineId = (process.env.EXTRACTION_PROVIDER || "deepseek") as ProviderId;
  if (engineId !== "deepseek") {
    throw new ProviderCallError(
      "unsupported_mode",
      `No live extraction adapter for EXTRACTION_PROVIDER="${engineId}" — only deepseek is supported in M9`,
    );
  }
  return resolveLiveCredentials(engineId);
}

export function embeddingProviderId(): ProviderId {
  return (process.env.EMBEDDING_PROVIDER || "openai") as ProviderId;
}

export async function resolveEmbeddingProvider(): Promise<EmbeddingProvider> {
  const providerId = embeddingProviderId();
  if (providerId !== "openai") {
    throw new ProviderCallError(
      "unsupported_mode",
      `No live embedding adapter for EMBEDDING_PROVIDER="${providerId}" — only openai is supported in M18`,
    );
  }
  return createOpenAIEmbeddingProvider(await resolveLiveCredentials(providerId));
}
