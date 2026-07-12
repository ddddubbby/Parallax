import { describe, expect, it } from "vitest";
import {
  BoundedDedupeSet,
  canTransitionConnection,
  contentHash,
  eventFingerprint,
  reconnectDelayMs,
} from "./agent-transport";

describe("eventFingerprint", () => {
  const base = { chainId: 8453, jobId: "job-1", kind: "job.created", sender: "0xabc", contentHash: "h", timestamp: 100 };

  it("is stable for identical input and distinct per job id", () => {
    expect(eventFingerprint(base)).toBe(eventFingerprint(base));
    expect(eventFingerprint(base)).not.toBe(eventFingerprint({ ...base, jobId: "job-2" }));
  });

  it("distinguishes kind, sender, content, and timestamp", () => {
    expect(eventFingerprint(base)).not.toBe(eventFingerprint({ ...base, kind: "job.funded" }));
    expect(eventFingerprint(base)).not.toBe(eventFingerprint({ ...base, sender: "0xdef" }));
    expect(eventFingerprint(base)).not.toBe(eventFingerprint({ ...base, contentHash: "h2" }));
    expect(eventFingerprint(base)).not.toBe(eventFingerprint({ ...base, timestamp: 101 }));
  });

  it("treats a null sender as a stable empty value", () => {
    expect(eventFingerprint({ ...base, sender: null })).toBe(eventFingerprint({ ...base, sender: null }));
  });
});

describe("contentHash", () => {
  it("is deterministic and 64-hex", () => {
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }));
    expect(contentHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("BoundedDedupeSet", () => {
  it("reports duplicates and dedupes add", () => {
    const s = new BoundedDedupeSet();
    expect(s.add("k")).toBe(true);
    expect(s.add("k")).toBe(false);
    expect(s.has("k")).toBe(true);
  });

  it("evicts the oldest past the size cap", () => {
    const s = new BoundedDedupeSet(2);
    s.add("a");
    s.add("b");
    s.add("c"); // evicts "a"
    expect(s.has("a")).toBe(false);
    expect(s.has("b")).toBe(true);
    expect(s.has("c")).toBe(true);
    expect(s.size).toBe(2);
  });

  it("expires entries past the TTL", () => {
    let now = 0;
    const s = new BoundedDedupeSet(10, 1000, () => now);
    s.add("k");
    now = 500;
    expect(s.has("k")).toBe(true);
    now = 2000;
    expect(s.has("k")).toBe(false); // expired
    expect(s.add("k")).toBe(true); // re-addable after expiry
  });
});

describe("reconnectDelayMs", () => {
  it("grows exponentially and is capped, with jitter within [0, ceiling)", () => {
    const full = reconnectDelayMs(3, { baseMs: 1000, maxMs: 30_000, rng: () => 1 - Number.EPSILON });
    expect(full).toBeLessThanOrEqual(8000); // 1000 * 2^3
    const capped = reconnectDelayMs(20, { baseMs: 1000, maxMs: 30_000, rng: () => 1 - Number.EPSILON });
    expect(capped).toBeLessThanOrEqual(30_000);
    expect(reconnectDelayMs(5, { rng: () => 0 })).toBe(0);
  });
});

describe("canTransitionConnection", () => {
  it("allows the reconnect cycle and forbids resurrecting a closed socket directly to open", () => {
    expect(canTransitionConnection("connecting", "open")).toBe(true);
    expect(canTransitionConnection("open", "reconnecting")).toBe(true);
    expect(canTransitionConnection("reconnecting", "open")).toBe(true);
    expect(canTransitionConnection("closed", "connecting")).toBe(true);
    expect(canTransitionConnection("closed", "open")).toBe(false);
  });
});
