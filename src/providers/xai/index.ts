import { type LiveCredentials, ProviderCallError } from "../shared";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";

// xAI (Grok) — the GEO agent's third grounded engine (AGENT_PRD §5). M36 adds
// it as a METADATA-ONLY provider: the enum value, registry entry, and
// capabilities exist so the worker can schedule its jobs and mock-first agent
// runs fan across all three engines (routed to mockProvider by run_mode=mock).
// The real live adapter — official grounded-search path + normalized citations,
// capability contract before model pick — lands in M38. Until then generate()
// throws, and xai is intentionally absent from LIVE_FACTORIES so a LIVE xai run
// fails loudly rather than silently returning nothing.

const DEFAULT_MODEL = "grok-4.3"; // AGENT_PRD §5 candidate; pinned for real at M38.

// Placeholder list price (config only; re-pinned from measured billable calls
// at M38 per assumption-register A6). NOT authoritative.
const PLACEHOLDER_COST_PER_CALL_USD = 0.02;

export function createXaiProvider(_credentials: LiveCredentials): LLMProvider {
  return {
    id: "xai",
    displayName: "Grok",
    supportsGrounded: true,
    supportsUngrounded: false,
    defaultModel: DEFAULT_MODEL,
    concurrency: 3,

    async generate(_req: GenerationRequest, _signal?: AbortSignal): Promise<GenerationResult> {
      throw new ProviderCallError(
        "unsupported_mode",
        "xAI (Grok) live adapter is not implemented until M38 — mock runs route through the mock provider",
      );
    },

    estimateCostUsd(): number {
      return PLACEHOLDER_COST_PER_CALL_USD;
    },
  };
}
