import { mockProvider } from "./mock";
import type { LLMProvider, ProviderId } from "./types";

// Plain registry map (A2: no provider strategy factory until a real second
// mechanism exists). Live adapters register here in M8/M9.
const registry: Partial<Record<ProviderId, LLMProvider>> = {
  mock: mockProvider,
};

export function getProvider(id: ProviderId): LLMProvider | undefined {
  return registry[id];
}

export function listRegisteredProviders(): LLMProvider[] {
  return Object.values(registry).filter((p): p is LLMProvider => p !== undefined);
}
