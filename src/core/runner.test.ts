import { describe, expect, it } from "vitest";
import { MAX_JOB_ATTEMPTS } from "./constants";
import {
  checkCostCap,
  computeFailureRate,
  computePlannedCalls,
  decideRetry,
  engineModePairs,
  estimateRunCostUsd,
  findUnsupportedEngineModePairs,
  isPartial,
  isProviderAllowedForRunMode,
  resolvePauseReason,
  shouldTripBreaker,
} from "./runner";

describe("computePlannedCalls (RN-1)", () => {
  it("multiplies cells x providers x modes x reps", () => {
    expect(computePlannedCalls(40, 1, 2, 5)).toBe(400);
    expect(computePlannedCalls(50, 1, 1, 5)).toBe(250);
  });
});

describe("estimateRunCostUsd / checkCostCap (RN-2)", () => {
  it("sums generation + extraction cost per planned call", () => {
    expect(estimateRunCostUsd(100, 0.001, 0.002)).toBeCloseTo(0.3, 6);
  });

  it("defaults extraction cost to 0 (mock is fixture-backed, D-022)", () => {
    expect(estimateRunCostUsd(100, 0.001)).toBeCloseTo(0.1, 6);
  });

  it("blocks when projected cost exceeds the cap", () => {
    const result = checkCostCap(0.3, 0.1);
    expect(result.ok).toBe(false);
    expect(result.overBy).toBeCloseTo(0.2, 6);
  });

  it("allows when projected cost is within the cap", () => {
    expect(checkCostCap(0.1, 2).ok).toBe(true);
  });
});

describe("decideRetry / MAX_JOB_ATTEMPTS (RN-5, RN-6)", () => {
  it("retries with increasing backoff below the attempt ceiling", () => {
    const first = decideRetry(1);
    const second = decideRetry(2);
    expect(first.action).toBe("retry");
    expect(second.action).toBe("retry");
    if (first.action === "retry" && second.action === "retry") {
      expect(second.nextAttemptDelayMs).toBeGreaterThan(first.nextAttemptDelayMs);
    }
  });

  it("dead-letters at MAX_JOB_ATTEMPTS", () => {
    expect(decideRetry(MAX_JOB_ATTEMPTS).action).toBe("dead_letter");
    expect(decideRetry(MAX_JOB_ATTEMPTS + 1).action).toBe("dead_letter");
  });
});

describe("computeFailureRate / shouldTripBreaker (RN-7)", () => {
  it("is 0 with no finished jobs", () => {
    expect(computeFailureRate(0, 0)).toBe(0);
  });

  it("trips on failure rate above 20%", () => {
    expect(shouldTripBreaker(0, 100, 7, 3).trip).toBe(true); // 30% dead-lettered
    expect(shouldTripBreaker(0, 100, 7, 3).reason).toBe("failure_rate");
    expect(shouldTripBreaker(0, 100, 9, 1).trip).toBe(false); // 10%
  });

  it("trips when actual cost reaches the cap regardless of failure rate", () => {
    const result = shouldTripBreaker(5, 5, 10, 0);
    expect(result.trip).toBe(true);
    expect(result.reason).toBe("cost_cap");
  });
});

describe("isPartial (RN-8)", () => {
  it("is derived from dead-letters or cancellations, never a stored flag", () => {
    expect(isPartial(0, 0)).toBe(false);
    expect(isPartial(1, 0)).toBe(true);
    expect(isPartial(0, 2)).toBe(true);
  });
});

describe("engineModePairs", () => {
  it("is the cartesian product of providers and modes", () => {
    const pairs = engineModePairs(["mock"], ["grounded", "ungrounded"]);
    expect(pairs).toEqual([
      { providerId: "mock", mode: "grounded" },
      { providerId: "mock", mode: "ungrounded" },
    ]);
  });
});

describe("findUnsupportedEngineModePairs (C-10/PV-5)", () => {
  const capabilities = [
    { id: "deepseek", supportsGrounded: false, supportsUngrounded: true },
    { id: "openai", supportsGrounded: true, supportsUngrounded: true },
    { id: "perplexity", supportsGrounded: true, supportsUngrounded: false },
  ];

  it("returns selected provider/mode pairs with no real provider path", () => {
    expect(findUnsupportedEngineModePairs(["deepseek", "openai"], ["grounded"], capabilities)).toEqual([
      { providerId: "deepseek", mode: "grounded" },
    ]);
    expect(findUnsupportedEngineModePairs(["perplexity"], ["ungrounded"], capabilities)).toEqual([
      { providerId: "perplexity", mode: "ungrounded" },
    ]);
  });

  it("allows only fully supported selections", () => {
    expect(findUnsupportedEngineModePairs(["openai"], ["grounded", "ungrounded"], capabilities)).toEqual([]);
  });
});

describe("isProviderAllowedForRunMode (C-9, both directions)", () => {
  it("mock runs allow only the mock provider — a live provider would be real spend under a MOCK label", () => {
    expect(isProviderAllowedForRunMode("mock", "mock")).toBe(true);
    expect(isProviderAllowedForRunMode("mock", "deepseek")).toBe(false);
  });

  it("live runs never allow the mock provider — fixtures must not mix into live aggregates", () => {
    expect(isProviderAllowedForRunMode("live_validation", "deepseek")).toBe(true);
    expect(isProviderAllowedForRunMode("live_validation", "mock")).toBe(false);
    expect(isProviderAllowedForRunMode("live_audit", "deepseek")).toBe(true);
    expect(isProviderAllowedForRunMode("live_audit", "mock")).toBe(false);
  });
});

describe("resolvePauseReason (manual-pause observability)", () => {
  it("returns null when the run isn't paused, regardless of events", () => {
    expect(resolvePauseReason("running", [{ eventType: "operator_paused", message: "x" }])).toBeNull();
    expect(resolvePauseReason("completed", [])).toBeNull();
  });

  it("prefers an automated breaker/cap/config event's own message over operator_paused", () => {
    const events = [
      { eventType: "operator_paused", message: "Run paused by operator." },
      { eventType: "circuit_breaker_paused", message: "Run paused by circuit breaker (cost_cap): ..." },
    ];
    expect(resolvePauseReason("paused", events)).toBe("Run paused by circuit breaker (cost_cap): ...");
  });

  it("recognizes all three automated event types as the most specific reason", () => {
    expect(resolvePauseReason("paused", [{ eventType: "cell_cap_violation", message: "cap msg" }])).toBe("cap msg");
    expect(resolvePauseReason("paused", [{ eventType: "worker_config_error", message: "config msg" }])).toBe(
      "config msg",
    );
  });

  it("falls back to an operator-pause message when only operator_paused exists", () => {
    expect(resolvePauseReason("paused", [{ eventType: "operator_paused", message: "Run paused by operator." }])).toBe(
      "Paused by operator. Click Resume to continue.",
    );
  });

  it("falls back to a neutral message when a paused run has no explanatory event at all — the reported bug's exact shape", () => {
    expect(resolvePauseReason("paused", [])).toBe(
      "Paused — no reason on record. Click Resume to continue, or Cancel if this run is no longer needed.",
    );
    expect(resolvePauseReason("paused", [{ eventType: "worker_heartbeat", message: "beat" }])).toBe(
      "Paused — no reason on record. Click Resume to continue, or Cancel if this run is no longer needed.",
    );
  });
});
