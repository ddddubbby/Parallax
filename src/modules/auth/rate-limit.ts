import { isLockedOut } from "@/core/auth";

// In-memory failure tracking (ST-6). Single-instance, single-shared-
// password MVP — resets on deploy/restart, which only ever HELPS an
// attacker by clearing their lockout, never hurts a legitimate operator.
// A DB-backed table would survive restarts but is unwarranted scope for
// one operator behind one password (A2).
const failuresByKey = new Map<string, number[]>();
const PRUNE_WINDOW_MS = 15 * 60 * 1000;

function keyFor(identifier: string): string {
  return identifier || "global";
}

export function checkLockout(identifier: string): boolean {
  const failures = failuresByKey.get(keyFor(identifier)) ?? [];
  return isLockedOut(failures);
}

export function recordFailure(identifier: string): void {
  const key = keyFor(identifier);
  const now = Date.now();
  const failures = (failuresByKey.get(key) ?? []).filter((t) => now - t < PRUNE_WINDOW_MS);
  failures.push(now);
  failuresByKey.set(key, failures);
}

export function clearFailures(identifier: string): void {
  failuresByKey.delete(keyFor(identifier));
}
