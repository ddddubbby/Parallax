import {
  EXTRACTION_ATTEMPTS,
  FAILURE_CIRCUIT_BREAKER_RATE,
  MAX_JOB_ATTEMPTS,
} from "./constants";

// Runner domain: pure planning, cost, backoff, and circuit-breaker math
// (PRD 8.7). No project-layer imports (C-7); the worker and server actions
// call these to make decisions, but the decisions themselves live here so
// they're unit-testable without a database.

// Mirrors src/providers/types.ts GenerationMode. Core cannot import from
// /src/providers (C-7), so this small literal union is duplicated locally —
// same pattern as Intent in src/core/matrix.ts.
export type GenerationMode = "grounded" | "ungrounded";

export const EXTRACTION_ENGINE_MOCK_COST_USD = 0;

/** RN-1: planned generation calls = cells x selected engine-modes x reps. */
export function computePlannedCalls(
  cellCount: number,
  providerCount: number,
  modeCount: number,
  repetitions: number,
): number {
  return cellCount * providerCount * modeCount * repetitions;
}

/**
 * RN-2: generation + one planned extraction call per generation call
 * (D-022). Mock runs use fixture-backed extraction at $0 (D-022); a
 * non-zero extraction cost is threaded in once a live extraction engine
 * exists (M5+).
 */
export function estimateRunCostUsd(
  plannedCalls: number,
  generationCostPerCallUsd: number,
  extractionCostPerCallUsd: number = EXTRACTION_ENGINE_MOCK_COST_USD,
): number {
  return plannedCalls * (generationCostPerCallUsd + extractionCostPerCallUsd);
}

export interface CapCheckResult {
  ok: boolean;
  projectedCostUsd: number;
  overBy?: number;
}

/** RN-2: run creation blocks if projected cost exceeds the operator's cap. */
export function checkCostCap(
  projectedCostUsd: number,
  costCapUsd: number,
): CapCheckResult {
  const ok = projectedCostUsd <= costCapUsd;
  return ok
    ? { ok, projectedCostUsd }
    : { ok, projectedCostUsd, overBy: projectedCostUsd - costCapUsd };
}

/** RN-5: exponential backoff with a cap, tuned so mock runs finish well under MK-6's 2 minutes. */
export function backoffMs(attemptNumber: number): number {
  const BASE_MS = 200;
  const MAX_MS = 3_000;
  return Math.min(BASE_MS * 2 ** Math.max(0, attemptNumber - 1), MAX_MS);
}

export type RetryDecision =
  | { action: "retry"; nextAttemptDelayMs: number }
  | { action: "dead_letter" };

/** RN-6: MAX_JOB_ATTEMPTS is the hard ceiling on retries per job. */
export function decideRetry(attemptNumber: number): RetryDecision {
  if (attemptNumber >= MAX_JOB_ATTEMPTS) return { action: "dead_letter" };
  return { action: "retry", nextAttemptDelayMs: backoffMs(attemptNumber) };
}

export function decideExtractionRetry(attemptNumber: number): RetryDecision {
  if (attemptNumber >= EXTRACTION_ATTEMPTS) return { action: "dead_letter" };
  return { action: "retry", nextAttemptDelayMs: backoffMs(attemptNumber) };
}

/** RN-7: failure rate over jobs that have reached a terminal outcome so far. */
export function computeFailureRate(succeeded: number, deadLettered: number): number {
  const finished = succeeded + deadLettered;
  return finished === 0 ? 0 : deadLettered / finished;
}

/** RN-7: circuit breaker trips at the cost cap or above the failure-rate threshold. */
export function shouldTripBreaker(
  actualCostUsd: number,
  costCapUsd: number,
  succeeded: number,
  deadLettered: number,
): { trip: boolean; reason?: "cost_cap" | "failure_rate" } {
  if (actualCostUsd >= costCapUsd) return { trip: true, reason: "cost_cap" };
  if (computeFailureRate(succeeded, deadLettered) > FAILURE_CIRCUIT_BREAKER_RATE) {
    return { trip: true, reason: "failure_rate" };
  }
  return { trip: false };
}

/** RN-8: partial is derived, never stored — true if any job didn't cleanly succeed. */
export function isPartial(deadLettered: number, cancelled: number): boolean {
  return deadLettered > 0 || cancelled > 0;
}

export interface EngineModePair {
  providerId: string;
  mode: GenerationMode;
}

/** Cartesian product of selected providers x selected modes (an "engine-mode"). */
export function engineModePairs(
  providerIds: string[],
  modes: GenerationMode[],
): EngineModePair[] {
  return providerIds.flatMap((providerId) => modes.map((mode) => ({ providerId, mode })));
}
