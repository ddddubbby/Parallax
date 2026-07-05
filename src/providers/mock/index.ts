import { stableIndex } from "@/core/hash";
import { RESONANCE_PROMPT_MARKER } from "@/core/resonance";
import type { GenerationRequest, GenerationResult, LLMProvider } from "../types";
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

export const mockProvider: LLMProvider = {
  id: "mock",
  displayName: "Mock",
  supportsGrounded: true,
  supportsUngrounded: true,
  defaultModel: MOCK_MODEL_VERSION,
  concurrency: 8,

  async generate(req: GenerationRequest): Promise<GenerationResult> {
    const resonance = req.promptText.includes(RESONANCE_PROMPT_MARKER);
    const auditFixtures = resonance ? null : loadMockFixtures();
    const resonanceFixtures = resonance ? loadMockResonanceFixtures() : null;
    const fixtures = resonanceFixtures ?? auditFixtures ?? [];
    const key = buildFixtureSelectionKey(req.promptText, "mock", req.repIndex ?? 0);
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

/** D-016 selection key: stable hash input is (resolved_text, provider_id, rep_index). */
export function buildFixtureSelectionKey(
  resolvedText: string,
  providerId: string,
  repIndex: number,
): string {
  return `${resolvedText}|${providerId}|${repIndex}`;
}
