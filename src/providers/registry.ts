import { createDeepSeekProvider } from "./deepseek";
import { mockProvider } from "./mock";
import type { LLMProvider, ProviderId } from "./types";

// Plain registry map (A2: no provider strategy factory until a real second
// mechanism exists). Live adapters register here in M8/M9.
//
// The DeepSeek entry here is metadata-only (empty credentials) — safe to
// list at run creation for capability/displayName/cost-estimate purposes,
// since none of those touch the network. generate() must never be called
// on THIS instance; the worker resolves a real, decrypted-credential
// instance per call via resolveRuntimeProvider (modules/runner/provider-resolver.ts).
const registry: Partial<Record<ProviderId, LLMProvider>> = {
  mock: mockProvider,
  deepseek: createDeepSeekProvider({ apiKey: "" }),
};

export function getProvider(id: ProviderId): LLMProvider | undefined {
  return registry[id];
}

export function listRegisteredProviders(): LLMProvider[] {
  return Object.values(registry).filter((p): p is LLMProvider => p !== undefined);
}
