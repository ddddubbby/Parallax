// Guardrail defaults from DEVELOPMENT_GUIDELINES.md section D and PRD PM-2.
// These are the canonical values; nothing else in the codebase may restate them.

export const MAX_CELLS_PER_RUN = 50;
export const DEFAULT_MATRIX_CELLS = 40;
export const AUDIT_REPETITIONS = 5;
export const VALIDATION_REPETITIONS = 2;
export const DEFAULT_VALIDATION_RUN_CAP_USD = 2;
export const DEFAULT_AUDIT_RUN_CAP_USD = 25;
export const DEFAULT_PROVIDER_CONCURRENCY = 3;
export const MAX_JOB_ATTEMPTS = 3;
export const EXTRACTION_ATTEMPTS = 2;
export const FAILURE_CIRCUIT_BREAKER_RATE = 0.2;
// D-042 provider-down detection: a provider with this many dead-letters
// and zero successes in one run is treated as down; its remaining queued
// jobs are skipped so other providers can finish (M9 graceful degradation).
export const PROVIDER_DOWN_DEAD_LETTERS = 5;

// Small-n guard for aggregate client-facing claims (D-015).
export const SMALL_N_THRESHOLD = 30;

// Findings engine thresholds (RB-1). Named and documented rather than
// buried in condition literals, so a future tuning pass has one place to
// look and every threshold is independently unit-testable.
export const LOST_SHORTLIST_COMPETITOR_RATE = 0.6;
export const LOST_SHORTLIST_CLIENT_RATE = 0.2;
export const POSITIONING_GAP_RATE = 0.3;
export const GROUNDED_UNGROUNDED_SPLIT_POINTS = 0.15;
export const SOURCE_CONCENTRATION_SHARE = 0.4;
export const LOW_STABILITY_INDEX = 0.5;

// PM-2 default 40-cell allocation, bottom-funnel weighted.
export const DEFAULT_INTENT_ALLOCATION = {
  comparison: 12,
  consideration: 10,
  validation: 8,
  objection: 6,
  discovery: 4,
} as const;
