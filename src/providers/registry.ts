import { createAnthropicProvider } from "./anthropic";
import { createDeepSeekProvider } from "./deepseek";
import { createGoogleProvider } from "./google";
import { mockProvider } from "./mock";
import { createOpenAIProvider } from "./openai";
import { createPerplexityProvider } from "./perplexity";
import { ProviderCallError } from "./shared";
import { createXaiProvider } from "./xai";
import type { LLMProvider, ProviderId } from "./types";

// Plain registry map (A2: no provider strategy factory until a real second
// mechanism exists).
//
// Every live entry here is metadata-only (empty credentials) — safe to
// list at run creation for capability/displayName/cost-estimate purposes,
// since none of those touch the network. generate() must never be called
// on THESE instances; the worker resolves a real, decrypted-credential
// instance per call via resolveRuntimeProvider (modules/runner/provider-resolver.ts).
function metadataOnly(provider: LLMProvider): LLMProvider {
  return {
    ...provider,
    async generate() {
      throw new ProviderCallError(
        "unsupported_mode",
        `Provider registry entry "${provider.id}" is metadata-only; use resolveRuntimeProvider for live calls (C-11/C-7)`,
      );
    },
  };
}

const registry: Partial<Record<ProviderId, LLMProvider>> = {
  mock: mockProvider,
  deepseek: metadataOnly(createDeepSeekProvider({ apiKey: "" })),
  openai: metadataOnly(createOpenAIProvider({ apiKey: "" })),
  anthropic: metadataOnly(createAnthropicProvider({ apiKey: "" })),
  google: metadataOnly(createGoogleProvider({ apiKey: "" })),
  perplexity: metadataOnly(createPerplexityProvider({ apiKey: "" })),
  // M36: metadata-only so the worker schedules xai jobs for mock-first agent
  // runs. Live adapter (and LIVE_FACTORIES entry) lands in M38.
  xai: metadataOnly(createXaiProvider({ apiKey: "" })),
};

export function getProvider(id: ProviderId): LLMProvider | undefined {
  return registry[id];
}

export function listRegisteredProviders(): LLMProvider[] {
  return Object.values(registry).filter((p): p is LLMProvider => p !== undefined);
}
