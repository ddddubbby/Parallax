import { stableIndex } from "@/core/hash";
import {
  RECOMMENDATION_PROMPT_MARKER,
  RESONANCE_PROMPT_MARKER,
} from "@/core/resonance";
import type { GenerationRequest, GenerationResult, LLMProvider, ProviderId } from "../types";
import { loadMockFixtures, loadMockResonanceFixtures } from "./fixtures";

// Mock is provider #0 (D-002): always available, zero-cost, permanently
// registered. It never fails — fixture archetypes like "refusal" and
// "malformed output" are successful generations whose *content* represents
// those cases; job-level failures are injected by the worker (D-011).

const MOCK_MODEL_VERSION = "mock-fixture-v1";
const MOCK_COST_PER_CALL_USD = 0.0006;
// Test-only override (e.g. scripts/test-mock-e2e.ts widens this to make a
// worker kill land reliably mid-flight). Unset in real usage — 15ms keeps
// mock runs well under the MK-6 two-minute budget.
const MOCK_LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 15);

/**
 * Build a mock provider that keys its fixture selection by `fixtureProviderId`.
 * Normally that is "mock"; when a mock RUN fans across the GEO agent's three
 * engines (M36), each is served by a mock provider bound to its own id so the
 * D-016 key (resolved_text, provider_id, rep) actually varies fixtures per
 * engine — otherwise every engine would return identical text. The `id` field
 * carries the same value; the worker records job.providerId regardless, so this
 * only affects fixture selection.
 */
export function createMockProviderFor(fixtureProviderId: ProviderId): LLMProvider {
  return {
    id: fixtureProviderId,
    displayName: "Mock",
    supportsGrounded: true,
    supportsUngrounded: true,
    defaultModel: MOCK_MODEL_VERSION,
    concurrency: 8,

    async generate(req: GenerationRequest): Promise<GenerationResult> {
      if (req.promptText.includes(RECOMMENDATION_PROMPT_MARKER)) {
        const text = mockRecommendation(req.promptText, fixtureProviderId, req.repIndex ?? 0);
        await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
        return {
          text,
          citations: [],
          modelVersion: MOCK_MODEL_VERSION,
          tokensIn: Math.ceil(req.promptText.length / 4),
          tokensOut: Math.ceil(text.length / 4),
          costUsd: MOCK_COST_PER_CALL_USD,
          latencyMs: MOCK_LATENCY_MS,
        };
      }
      const resonance = req.promptText.includes(RESONANCE_PROMPT_MARKER);
      const auditFixtures = resonance ? null : loadMockFixtures();
      const resonanceFixtures = resonance ? loadMockResonanceFixtures() : null;
      const fixtures = resonanceFixtures ?? auditFixtures ?? [];
      const key = buildFixtureSelectionKey(req.promptText, fixtureProviderId, req.repIndex ?? 0);
      const idx = stableIndex(key, fixtures.length);
      const fixture = fixtures[idx];
      await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
      return {
        text: fixture.text,
        citations: auditFixtures && req.mode === "grounded" ? auditFixtures[idx].citations : [],
        modelVersion: MOCK_MODEL_VERSION,
        tokensIn: Math.ceil(req.promptText.length / 4),
        tokensOut: Math.ceil(fixture.text.length / 4),
        costUsd: MOCK_COST_PER_CALL_USD,
        latencyMs: MOCK_LATENCY_MS,
      };
    },

    estimateCostUsd(): number {
      return MOCK_COST_PER_CALL_USD;
    },
  };
}

function mockRecommendation(promptText: string, providerId: string, repIndex: number): string {
  const target = promptText.match(/\bLedgerFox\b/i)?.[0] ?? "ResonanceTarget";
  const rank = stableIndex(`${promptText}|${providerId}|${repIndex}|recommendation`, 6) + 1;
  const alternatives = ["SpendPilot", "Clearbooks", "Northstar", "Opal", "Keystone"];
  const brands = alternatives.slice(0, 5);
  if (rank <= 5) brands[rank - 1] = target;
  return JSON.stringify({
    recommendations: brands.map((brand, index) => ({
      rank: index + 1,
      brand,
      product: null,
      reason: `Mock recommendation ${index + 1} for this shopping situation.`,
    })),
  });
}

// Provider #0 (D-002): always available, zero-cost, permanently registered.
export const mockProvider: LLMProvider = createMockProviderFor("mock");

/** D-016 selection key: stable hash input is (resolved_text, provider_id, rep_index). */
export function buildFixtureSelectionKey(
  resolvedText: string,
  providerId: string,
  repIndex: number,
): string {
  return `${resolvedText}|${providerId}|${repIndex}`;
}
