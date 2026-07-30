// Leaf module: imports nothing from the runner repository or the budget
// module, so both can share ONE definition of the paid secondary engines
// without the budget.ts -> repositories/runner.ts import cycle. Previously the
// kind -> engine decision was re-derived at five call sites and the env
// defaults were re-typed as literals inside getProviderSpendToday — a missed
// site silently reintroduces the D-050/D-037 wrong-budget bug class.
import { isProviderId, type ProviderId } from "@/core/runner";
import type { MessageLiftTestType } from "@/core/resonance";

function providerIdFromEnv(envName: string, fallback: ProviderId): ProviderId {
  const raw = process.env[envName] || fallback;
  if (isProviderId(raw)) return raw;
  throw new Error(`${envName}="${raw}" is not a registered provider id`);
}

/** D-041: the one extraction engine for all live audit runs. */
export function extractionProviderId(): ProviderId {
  return providerIdFromEnv("EXTRACTION_PROVIDER", "deepseek");
}

/** D-064: the one embedding engine for all live resonance (SSR) runs. */
export function embeddingProviderId(): ProviderId {
  return providerIdFromEnv("EMBEDDING_PROVIDER", "openai");
}

/**
 * The secondary paid engine a run's matrix kind spends on: embeddings for a
 * resonance run's SSR scoring, the extraction engine for an audit run. The
 * single source of truth for cost projection, credential preflight, and
 * daily-budget enforcement.
 */
export function secondaryProviderIdForKind(
  kind: string | null | undefined,
  testType?: MessageLiftTestType | null,
): ProviderId | null {
  if (kind === "resonance" && testType === "ai_recommendation") return null;
  return kind === "resonance" ? embeddingProviderId() : extractionProviderId();
}

export function validateSecondaryProviderConfig(
  kind: string | null | undefined,
  testType?: MessageLiftTestType | null,
): string | null {
  try {
    if (kind === "resonance" && testType === "ai_recommendation") return null;
    if (kind === "resonance") {
      const embedding = embeddingProviderId();
      return embedding === "openai"
        ? null
        : `No live embedding adapter for EMBEDDING_PROVIDER="${embedding}" — only openai is supported in M18`;
    }
    const extraction = extractionProviderId();
    return extraction === "deepseek"
      ? null
      : `No live extraction adapter for EXTRACTION_PROVIDER="${extraction}" — only deepseek is supported in M9`;
  } catch (err) {
    return err instanceof Error ? err.message : "Secondary provider configuration is invalid";
  }
}
