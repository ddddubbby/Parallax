import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLockout, clearFailures, recordFailure, resetFailuresForTest } from "./rate-limit";

describe("login rate limiter", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetFailuresForTest();
  });

  it("locks out a repeated caller after five failures", () => {
    for (let i = 0; i < 5; i += 1) recordFailure("203.0.113.10");

    expect(checkLockout("203.0.113.10")).toBe(true);
  });

  it("also locks out rotated identifiers through the global failure bucket", () => {
    for (let i = 0; i < 25; i += 1) recordFailure(`203.0.113.${i}`);

    expect(checkLockout("203.0.113.99")).toBe(true);
  });

  it("bounds caller identifiers before storing rate-limit keys", () => {
    const prefix = "x".repeat(128);
    for (let i = 0; i < 5; i += 1) recordFailure(`${prefix}-attacker-controlled-suffix-${i}`);

    expect(checkLockout(`${prefix}-different-suffix`)).toBe(true);
  });

  it("expires global failures with the same rolling window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T00:00:00Z"));
    for (let i = 0; i < 25; i += 1) recordFailure(`203.0.113.${i}`);

    vi.setSystemTime(new Date("2026-07-06T00:16:00Z"));

    expect(checkLockout("203.0.113.99")).toBe(false);
  });

  it("clears the caller's own bucket but preserves the global bucket after a successful login", () => {
    // One identifier fails past its own lockout; the global bucket also fills.
    for (let i = 0; i < 6; i += 1) recordFailure("203.0.113.4");
    for (let i = 0; i < 19; i += 1) recordFailure(`203.0.113.${i + 10}`);
    expect(checkLockout("203.0.113.4")).toBe(true);

    // A legitimate login from 203.0.113.4 clears ITS bucket, but must NOT wipe
    // the distributed-attack count other rotated identifiers accumulated —
    // otherwise routine operator logins defeat the global guard.
    clearFailures("203.0.113.4");

    expect(checkLockout("203.0.113.99")).toBe(true);
  });
});
