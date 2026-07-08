import {
  EXTRACTION_ATTEMPTS,
  FAILURE_CIRCUIT_BREAKER_RATE,
  MAX_JOB_ATTEMPTS,
  PROVIDER_DOWN_DEAD_LETTERS,
} from "./constants";

// Runner domain: pure planning, cost, backoff, and circuit-breaker math
// (PRD 8.7). No project-layer imports (C-7); the worker and server actions
// call these to make decisions, but the decisions themselves live here so
// they're unit-testable without a database.

// Mirrors src/providers/types.ts GenerationMode/ProviderId. Core cannot
// import from /src/providers (C-7), so these small literal unions are
// duplicated locally — same pattern as Intent in src/core/matrix.ts. The
// UI imports them from here rather than from /src/providers (C-7's "UI
// never imports providers", now also lint-enforced).
export type GenerationMode = "grounded" | "ungrounded";
export const PROVIDER_IDS = [
  "mock",
  "deepseek",
  "minimax",
  "openai",
  "anthropic",
  "google",
  "perplexity",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export type RunMode = "mock" | "live_validation" | "live_audit";
export const RUN_MODES = ["mock", "live_validation", "live_audit"] as const;

export function isRunMode(value: string): value is RunMode {
  return (RUN_MODES as readonly string[]).includes(value);
}

/** Report/export deliverables are built only from terminal completed runs. */
export function isReportableRunState(state: string): boolean {
  return state === "completed";
}

/** The subset of a run_event the pause-reason banner needs to inspect. */
export interface PauseReasonEvent {
  eventType: string;
  message: string;
}

/**
 * A bare "paused" stamp with no reason is indistinguishable from a silently
 * broken run. Priority order: (a) an automated breaker/cap/config event is
 * the most specific and actionable — its own message wins unchanged. (b) an
 * operator_paused event means this was a deliberate manual pause. (c) a
 * paused run with no explanatory event at all (historical data predating
 * this logging, or any future gap) still gets a neutral fallback rather than
 * silence. Returns null when the run isn't paused at all.
 */
export function resolvePauseReason(runState: string, events: readonly PauseReasonEvent[]): string | null {
  if (runState !== "paused") return null;
  const automated = events.find(
    (e) =>
      e.eventType === "circuit_breaker_paused" ||
      e.eventType === "cell_cap_violation" ||
      e.eventType === "worker_config_error",
  );
  if (automated) return automated.message;
  if (events.some((e) => e.eventType === "operator_paused")) {
    return "Paused by operator. Click Resume to continue.";
  }
  return "Paused — no reason on record. Click Resume to continue, or Cancel if this run is no longer needed.";
}

/**
 * C-9 in both directions: a mock run must use only the mock provider
 * (anything else is real spend hidden under a MOCK badge), and a live run
 * must never include the mock provider (fixture output mixed into live
 * aggregates). Enforced at run creation and again per job in the worker,
 * since scripts/tests can insert job rows without going through the action.
 */
export function isProviderAllowedForRunMode(runMode: RunMode, providerId: string): boolean {
  return runMode === "mock" ? providerId === "mock" : providerId !== "mock";
}

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

/**
 * D-042 provider-down detection: repeated dead-letters with zero successes
 * in the same run means the provider is down (bad key, outage, revoked
 * account), not that individual prompts are flaky. A provider that
 * succeeded earlier in the run and then degrades does NOT match — the
 * run-wide failure breaker (RN-7) still guards that case.
 */
export function isProviderDown(succeeded: number, deadLettered: number): boolean {
  return succeeded === 0 && deadLettered >= PROVIDER_DOWN_DEAD_LETTERS;
}

export interface EngineModePair {
  providerId: string;
  mode: GenerationMode;
}

export interface ProviderModeCapability {
  id: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
}

/** Cartesian product of selected providers x selected modes (an "engine-mode"). */
export function engineModePairs(
  providerIds: string[],
  modes: GenerationMode[],
): EngineModePair[] {
  return providerIds.flatMap((providerId) => modes.map((mode) => ({ providerId, mode })));
}

/**
 * C-10/PV-5: a selected engine-mode must be a real provider path, not a
 * silently skipped placeholder. Skips are still useful as a worker backstop
 * for legacy/scripted rows, but interactive run creation blocks them.
 */
export function findUnsupportedEngineModePairs(
  providerIds: string[],
  modes: GenerationMode[],
  capabilities: ProviderModeCapability[],
): EngineModePair[] {
  return engineModePairs(providerIds, modes).filter(({ providerId, mode }) => {
    const cap = capabilities.find((c) => c.id === providerId);
    if (!cap) return true;
    return mode === "grounded" ? !cap.supportsGrounded : !cap.supportsUngrounded;
  });
}

export const DEBUG_GENERATION_ERROR_TYPES = [
  "rate_limit",
  "timeout",
  "server_error",
  "auth_error",
  "malformed_output",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateDebugFailureInjection(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return "Failure injection must be an object";
  const topLevelKeys = Object.keys(value);
  const unknownTopLevel = topLevelKeys.filter((key) => key !== "generation" && key !== "extraction");
  if (unknownTopLevel.length > 0) return `Unknown failure-injection key: ${unknownTopLevel.join(", ")}`;

  if (value.generation !== undefined) {
    if (!isRecord(value.generation)) return "Generation failure injection must be an object";
    const unknownGeneration = Object.keys(value.generation).filter((key) => key !== "rate" && key !== "errorType");
    if (unknownGeneration.length > 0) return `Unknown generation failure-injection key: ${unknownGeneration.join(", ")}`;
    if (!isRate(value.generation.rate)) return "Generation failure injection rate must be a finite number from 0 to 1";
    if (
      typeof value.generation.errorType !== "string" ||
      !(DEBUG_GENERATION_ERROR_TYPES as readonly string[]).includes(value.generation.errorType)
    ) {
      return `Generation failure injection errorType must be one of: ${DEBUG_GENERATION_ERROR_TYPES.join(", ")}`;
    }
  }

  if (value.extraction !== undefined) {
    if (!isRecord(value.extraction)) return "Extraction failure injection must be an object";
    const unknownExtraction = Object.keys(value.extraction).filter((key) => key !== "invalidRate");
    if (unknownExtraction.length > 0) return `Unknown extraction failure-injection key: ${unknownExtraction.join(", ")}`;
    if (!isRate(value.extraction.invalidRate)) return "Extraction failure injection invalidRate must be a finite number from 0 to 1";
  }

  return null;
}
