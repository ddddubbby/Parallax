import { getActiveCredential, markInvalid, markUsed } from "@/db/repositories/credentials";
import { decryptApiKey } from "@/modules/settings/crypto";
import { createDeepSeekProvider, type DeepSeekCallCredentials, ProviderCallError } from "@/providers/deepseek";
import { mockProvider } from "@/providers/mock";
import type { LLMProvider, ProviderId } from "@/providers/types";

/**
 * Decrypts and returns the active DeepSeek credential, shared by both
 * generate (resolveRuntimeProvider) and D-022 live extraction
 * (resolveExtractionCredentials) — "no separate key path" per D-022.
 */
async function resolveDeepSeekCredentials(): Promise<DeepSeekCallCredentials> {
  const credential = await getActiveCredential("deepseek");
  if (!credential) {
    throw new ProviderCallError("auth_error", "No active DeepSeek credential configured in Settings");
  }
  const apiKey = decryptApiKey(credential.encryptedApiKey);
  if (apiKey === null) {
    // D-021: decrypt failure marks the row invalid and prompts re-entry — never crashes the worker.
    await markInvalid(credential.id);
    throw new ProviderCallError("auth_error", "Stored DeepSeek credential could not be decrypted — re-enter it in Settings");
  }
  await markUsed(credential.id);
  return { apiKey, baseUrl: credential.baseUrl, defaultModel: credential.defaultModel };
}

/**
 * Credential-resolved provider instance for an actual call — distinct
 * from the static, metadata-only registry (src/providers/registry.ts),
 * which run creation uses for capability/cost-estimate display without
 * touching the network or decrypting anything.
 */
export async function resolveRuntimeProvider(providerId: ProviderId): Promise<LLMProvider> {
  if (providerId === "mock") return mockProvider;
  if (providerId === "deepseek") return createDeepSeekProvider(await resolveDeepSeekCredentials());
  throw new ProviderCallError("unsupported_mode", `No runtime adapter for provider "${providerId}"`);
}

/**
 * D-022: the extraction engine is "a Settings-configured provider+model
 * resolved through the same provider registry and credential service as
 * generation" — reused here as the response's own generation provider,
 * since M8 has no separate extraction-provider picker (no such settings
 * table exists; MASTER_CONTEXT §9 records this as the M8 scope decision).
 */
export async function resolveExtractionCredentials(providerId: ProviderId): Promise<DeepSeekCallCredentials> {
  if (providerId === "deepseek") return resolveDeepSeekCredentials();
  throw new ProviderCallError("unsupported_mode", `No live extraction engine for provider "${providerId}"`);
}
