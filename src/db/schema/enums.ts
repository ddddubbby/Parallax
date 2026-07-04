import { pgEnum } from "drizzle-orm/pg-core";

// Canonical value sets from DEVELOPMENT_GUIDELINES.md C4 and ENGINEERING_SPEC.md.

export const projectStatus = pgEnum("project_status", [
  "draft",
  "active",
  "archived",
]);

export const brandRole = pgEnum("brand_role", ["client", "competitor"]);

export const factClaimType = pgEnum("fact_claim_type", [
  "pricing",
  "feature",
  "company_fact",
  "security",
  "availability",
]);

export const factClaimStatus = pgEnum("fact_claim_status", [
  "active",
  "archived",
]);

export const categoryArchetype = pgEnum("category_archetype", [
  "b2b",
  "consumer_product",
  "consumer_venue",
]);

export const intent = pgEnum("intent", [
  "discovery",
  "consideration",
  "comparison",
  "validation",
  "objection",
]);

export const matrixState = pgEnum("matrix_state", [
  "draft",
  "approved",
  "superseded",
  "discarded",
]);

export const runMode = pgEnum("run_mode", [
  "mock",
  "live_validation",
  "live_audit",
]);

export const runState = pgEnum("run_state", [
  "draft",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const generationMode = pgEnum("generation_mode", [
  "grounded",
  "ungrounded",
]);

export const providerId = pgEnum("provider_id", [
  "mock",
  "deepseek",
  "minimax",
  "openai",
  "anthropic",
  "google",
  "perplexity",
]);

export const jobState = pgEnum("job_state", [
  "queued",
  "running",
  "succeeded",
  "retryable_failed",
  "dead_lettered",
  "cancelled",
  "skipped",
]);

export const providerErrorType = pgEnum("provider_error_type", [
  "rate_limit",
  "timeout",
  "server_error",
  "auth_error",
  "malformed_output",
  "unsupported_mode",
  // M9 graceful degradation (D-042): set on jobs skipped because their
  // provider was detected down mid-run (repeated dead-letters, zero successes).
  "provider_down",
  // Set when the provider call SUCCEEDED but persisting the response failed
  // (a DB fault, not a provider fault). Kept distinct so it is never
  // misclassified as a provider failure and never feeds the provider-down
  // counter (D-042) — a DB blip must not brick a healthy provider.
  "persistence_error",
  "unknown",
]);

export const extractionState = pgEnum("extraction_state", [
  "pending",
  "retrying",
  "valid",
  "dead_lettered",
  "qa_reviewed",
]);

export const recommendationStrength = pgEnum("recommendation_strength", [
  "strong",
  "soft",
  "neutral",
  "discouraged",
]);

export const sentiment = pgEnum("sentiment", [
  "positive",
  "neutral",
  "mixed",
  "negative",
]);

// Extraction claims may be typed `other`; fact-sheet rows may not (CM-1 vs SM claims shape).
export const claimType = pgEnum("claim_type", [
  "pricing",
  "feature",
  "company_fact",
  "security",
  "availability",
  "other",
]);

export const claimVerdict = pgEnum("claim_verdict", [
  "supported",
  "contradicted",
  "outdated",
  "unsupported",
  "ambiguous",
  "not_checked",
]);

export const claimSeverity = pgEnum("claim_severity", [
  "none",
  "low",
  "medium",
  "high",
]);

export const reviewState = pgEnum("review_state", [
  "unreviewed",
  "confirmed",
  "corrected",
]);

export const credentialStatus = pgEnum("credential_status", [
  "missing",
  "active",
  "invalid",
  "disabled",
]);

export const reportSectionState = pgEnum("report_section_state", [
  "generated",
  "edited",
  "regenerated",
]);

export const runEventLevel = pgEnum("run_event_level", [
  "debug",
  "info",
  "warn",
  "error",
]);
