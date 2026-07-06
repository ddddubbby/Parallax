import { describe, expect, it } from "vitest";
import { HEARTBEAT_STALE_MS, isWorkerLikelyOffline, resolveWorkerTiming } from "./worker-timing";

describe("isWorkerLikelyOffline (RN-9)", () => {
  it("flags a queued or running run with no recent heartbeat", () => {
    expect(isWorkerLikelyOffline("queued", null)).toBe(true);
    expect(isWorkerLikelyOffline("running", null)).toBe(true);
    expect(isWorkerLikelyOffline("queued", HEARTBEAT_STALE_MS + 1)).toBe(true);
  });

  it("stays quiet when a heartbeat is recent", () => {
    expect(isWorkerLikelyOffline("queued", 1_000)).toBe(false);
    expect(isWorkerLikelyOffline("running", HEARTBEAT_STALE_MS - 1)).toBe(false);
  });

  it("never flags runs that do not need a worker", () => {
    for (const state of ["completed", "paused", "failed", "cancelled", "draft"]) {
      expect(isWorkerLikelyOffline(state, null)).toBe(false);
    }
  });
});

describe("worker timing config (D-039)", () => {
  it("keeps the default provider timeout below the stale-lock window", () => {
    const timing = resolveWorkerTiming({});
    expect(timing.staleLockMs).toBe(60_000);
    expect(timing.providerCallTimeoutMs).toBe(45_000);
    expect(timing.providerCallTimeoutMs).toBeLessThan(timing.staleLockMs);
  });

  it("clamps a misconfigured provider timeout so a paid call cannot outlive its job lock", () => {
    const timing = resolveWorkerTiming({
      WORKER_STALE_LOCK_MS: "60000",
      WORKER_PROVIDER_TIMEOUT_MS: "120000",
    });

    expect(timing.providerCallTimeoutMs).toBe(55_000);
    expect(timing.providerCallTimeoutMs).toBeLessThan(timing.staleLockMs);
  });

  it("falls back on malformed timing values instead of producing NaN timers", () => {
    const timing = resolveWorkerTiming({
      WORKER_STALE_LOCK_MS: "not-a-number",
      WORKER_PROVIDER_TIMEOUT_MS: "-10",
      WORKER_STALE_RECLAIM_INTERVAL_MS: "Infinity",
      WORKER_EXTRACTION_SWEEP_AGE_MS: "0",
      WORKER_EXTRACTION_SWEEP_BATCH: "abc",
    });

    expect(timing).toMatchObject({
      staleLockMs: 60_000,
      staleReclaimIntervalMs: 15_000,
      extractionSweepAgeMs: 60_000,
      extractionSweepBatch: 25,
      providerCallTimeoutMs: 45_000,
    });
  });
});
