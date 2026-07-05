// Leaf module: imports nothing from the runner repository or the budget
// module, so both can share ONE definition of the paid secondary engines
// without the budget.ts -> repositories/runner.ts import cycle. Previously the
// kind -> engine decision was re-derived at five call sites and the env
// defaults were re-typed as literals inside getProviderSpendToday — a missed
// site silently reintroduces the D-050/D-037 wrong-budget bug class.

/** D-041: the one extraction engine for all live audit runs. */
export function extractionProviderId(): string {
  return process.env.EXTRACTION_PROVIDER || "deepseek";
}

/** D-064: the one embedding engine for all live resonance (SSR) runs. */
export function embeddingProviderId(): string {
  return process.env.EMBEDDING_PROVIDER || "openai";
}

/**
 * The secondary paid engine a run's matrix kind spends on: embeddings for a
 * resonance run's SSR scoring, the extraction engine for an audit run. The
 * single source of truth for cost projection, credential preflight, and
 * daily-budget enforcement.
 */
export function secondaryProviderIdForKind(kind: string | null | undefined): string {
  return kind === "resonance" ? embeddingProviderId() : extractionProviderId();
}
