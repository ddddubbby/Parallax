import { isLockedOut } from "@/core/auth";

// In-memory failure tracking (ST-6). Single-instance, single-shared-
// password MVP — resets on deploy/restart, which only ever HELPS an
// attacker by clearing their lockout, never hurts a legitimate operator.
// A DB-backed table would survive restarts but is unwarranted scope for
// one operator behind one password (A2).
const failuresByKey = new Map<string, number[]>();
const PRUNE_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_KEY = "__global_login_failures__";
const ANONYMOUS_KEY = "__anonymous_login_failures__";
const GLOBAL_LOCKOUT_THRESHOLD = 25;
const MAX_IDENTIFIER_LENGTH = 128;

function keyFor(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) return ANONYMOUS_KEY;
  return trimmed.slice(0, MAX_IDENTIFIER_LENGTH);
}

function recentFailures(key: string, now = Date.now()): number[] {
  return (failuresByKey.get(key) ?? []).filter((t) => now - t < PRUNE_WINDOW_MS);
}

function appendFailure(key: string, now: number): void {
  const failures = recentFailures(key, now);
  failures.push(now);
  failuresByKey.set(key, failures);
}

export function checkLockout(identifier: string): boolean {
  return isLockedOut(recentFailures(keyFor(identifier))) || recentFailures(GLOBAL_KEY).length >= GLOBAL_LOCKOUT_THRESHOLD;
}

export function recordFailure(identifier: string): void {
  const now = Date.now();
  appendFailure(keyFor(identifier), now);
  appendFailure(GLOBAL_KEY, now);
}

export function clearFailures(identifier: string): void {
  // Only the caller's own bucket. A successful login proves THIS identifier is
  // legitimate, not that a distributed attack across other rotated identifiers
  // has stopped — clearing GLOBAL_KEY here let the operator's routine logins
  // reset an attacker's accumulated global count, defeating the guard. The
  // global bucket self-prunes on its own 15-minute rolling window.
  failuresByKey.delete(keyFor(identifier));
}

export function resetFailuresForTest(): void {
  failuresByKey.clear();
}
