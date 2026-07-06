// Single seam for reporting caught/boundary errors. Today it writes to
// console.error (the same sink the worker already uses in src/worker/index.ts);
// a real transport (Sentry) can be wired here behind an env-configured DSN
// without touching call sites. Deliberately dependency-free — this sprint does
// not add a SaaS dependency (see the sprint plan / Decision Log).
//
// Not in src/core: core is pure math/rules with no side effects (C-7). This is
// a leaf side-effecting module, like src/env-bootstrap.ts.

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

/** Report an unexpected error with structured context. Never throws. */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    const digest =
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : undefined;
    const payload = {
      ...context,
      ...(digest ? { digest } : {}),
    };
    console.error("[error]", payload, error);
  } catch {
    // Reporting must never mask the original failure.
  }
}
