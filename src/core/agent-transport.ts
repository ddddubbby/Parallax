// Hardened transport primitives for the ACP gateway (AGENT_BUILD_PLAN §4.4).
// The raw acp-node-v2 SDK has an unbounded dedupe set, omits the job id from its
// dedupe key, hides reconnect health, and doesn't reliably check HTTP status —
// so ALL of it sits behind the VirtualsGatewayClient boundary, and these pure
// primitives provide the fingerprinting, bounded dedupe, and reconnect discipline
// the boundary needs. Pure so they are exhaustively unit-testable with no network.

import { createHash } from "node:crypto";

/**
 * Canonical event fingerprint (§4.4): chain + job + kind/type + sender + content
 * hash + timestamp. Unlike the SDK's dedupe key it ALWAYS includes the job id, so
 * an identical event kind on two different jobs is never collapsed.
 */
export function eventFingerprint(input: {
  chainId: number;
  jobId: string;
  kind: string;
  sender: string | null;
  contentHash: string;
  timestamp: number | string;
}): string {
  const canonical = [
    input.chainId,
    input.jobId,
    input.kind,
    input.sender ?? "",
    input.contentHash,
    String(input.timestamp),
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** SHA-256 of an event's content, for the fingerprint's content-hash component. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? null), "utf8").digest("hex");
}

/**
 * Bounded in-memory dedupe (§4.4): 10,000 entries / 24h, IN ADDITION to durable
 * DB dedupe. Evicts the oldest entry past the size cap and lazily drops expired
 * entries. This is a latency optimization; the DB unique constraint is the
 * completeness guarantee.
 */
export class BoundedDedupeSet {
  private readonly entries = new Map<string, number>(); // key → inserted-at ms
  constructor(
    private readonly maxSize = 10_000,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** True if `key` was already seen (and not expired). */
  has(key: string): boolean {
    const at = this.entries.get(key);
    if (at === undefined) return false;
    if (this.now() - at > this.ttlMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  /** Record `key`; returns false if it was already present (a duplicate). */
  add(key: string): boolean {
    if (this.has(key)) return false;
    this.entries.set(key, this.now());
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * Bounded exponential reconnect backoff with full jitter (§4.4). Never exceeds
 * `maxMs`; the jitter spreads reconnect storms across instances.
 */
export function reconnectDelayMs(
  attempt: number,
  opts: { baseMs?: number; maxMs?: number; rng?: () => number } = {},
): number {
  const base = opts.baseMs ?? 1000;
  const max = opts.maxMs ?? 30_000;
  const rng = opts.rng ?? Math.random;
  const ceiling = Math.min(max, base * 2 ** Math.max(0, attempt));
  return Math.floor(rng() * ceiling);
}

/** Explicit connection state (§4.4: the SDK hides reconnect health). */
export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

const CONNECTION_TRANSITIONS: Record<ConnectionState, readonly ConnectionState[]> = {
  connecting: ["open", "reconnecting", "closed"],
  open: ["reconnecting", "closed"],
  reconnecting: ["open", "reconnecting", "closed"],
  closed: ["connecting"],
};

export function canTransitionConnection(from: ConnectionState, to: ConnectionState): boolean {
  return CONNECTION_TRANSITIONS[from].includes(to);
}
