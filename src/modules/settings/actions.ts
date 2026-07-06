"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCredential as deleteCredentialRow,
  disableCredential as disableCredentialRow,
  enableCredential as enableCredentialRow,
  findActiveLiveRunUsingProvider,
  getActiveCredential,
  getActiveCredentialLifecycleSummary,
  getCredentialEnableSummary,
  getCredentialLifecycleSummary,
  markInvalid,
  markVerified,
  saveCredential as saveCredentialRow,
} from "@/db/repositories/credentials";
import { isUuid } from "@/core/id";
import { CredentialConfigError, decryptApiKey, encryptApiKey } from "@/modules/settings/crypto";
import { resolveWorkerTiming } from "@/core/worker-timing";
import { createAnthropicProvider } from "@/providers/anthropic";
import { createDeepSeekProvider } from "@/providers/deepseek";
import { createGoogleProvider } from "@/providers/google";
import { createOpenAIProvider } from "@/providers/openai";
import { createPerplexityProvider } from "@/providers/perplexity";
import { type LiveCredentials, ProviderCallError, validateProviderBaseUrlOverride } from "@/providers/shared";
import type { LLMProvider, ProviderId } from "@/providers/types";
import { embeddingProviderId, extractionProviderId } from "@/modules/runner/provider-ids";

type ActionResult = { ok: true } | { ok: false; error: string };

const SETTINGS_PATH = "/settings";
// Same env var and default as the worker's per-call deadline
// (WORKER_PROVIDER_TIMEOUT_MS) — a Verify call is a real provider.generate()
// through this server action, so a hung provider must not tie up the
// request indefinitely, same as every other call site.
const VERIFY_TIMEOUT_MS = resolveWorkerTiming().providerCallTimeoutMs;

// Providers with a live adapter wired up to resolveRuntimeProvider — the
// only ones Settings can actually accept a key for (MiniMax remains a
// PV-3 candidate, not built).
const LIVE_PROVIDER_IDS: readonly ProviderId[] = [
  "deepseek",
  "openai",
  "anthropic",
  "google",
  "perplexity",
];
const MIN_API_KEY_LENGTH = 8;

// Duplicated factory map rather than importing the runtime resolver: the
// resolver reads/mutates credential rows (markUsed/markInvalid) as a side
// effect, and verify needs to test a credential without those semantics.
const VERIFY_FACTORIES: Partial<Record<ProviderId, (c: LiveCredentials) => LLMProvider>> = {
  deepseek: createDeepSeekProvider,
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  google: createGoogleProvider,
  perplexity: createPerplexityProvider,
};

async function destructiveCredentialLifecycleError(credentialId: string): Promise<string | null> {
  const credential = await getCredentialLifecycleSummary(credentialId);
  if (!credential) return "Credential not found";
  if (credential.status !== "active") return null;

  let secondaryProviders: { audit: ProviderId; resonance: ProviderId };
  try {
    secondaryProviders = { audit: extractionProviderId(), resonance: embeddingProviderId() };
  } catch (err) {
    return err instanceof Error ? err.message : "Secondary provider configuration is invalid";
  }

  const activeRun = await findActiveLiveRunUsingProvider(credential.providerId, secondaryProviders);
  if (!activeRun) return null;
  return `Credential is in use by ${activeRun.state} live run ${activeRun.id.slice(0, 8)}. Pause or finish the run before disabling or deleting this key.`;
}

async function credentialRotationLifecycleError(providerId: ProviderId): Promise<string | null> {
  const activeCredential = await getActiveCredentialLifecycleSummary(providerId);
  if (!activeCredential) return null;

  let secondaryProviders: { audit: ProviderId; resonance: ProviderId };
  try {
    secondaryProviders = { audit: extractionProviderId(), resonance: embeddingProviderId() };
  } catch (err) {
    return err instanceof Error ? err.message : "Secondary provider configuration is invalid";
  }

  const activeRun = await findActiveLiveRunUsingProvider(providerId, secondaryProviders);
  if (!activeRun) return null;
  return `Credential is in use by ${activeRun.state} live run ${activeRun.id.slice(0, 8)}. Pause or finish the run before rotating this key.`;
}

/**
 * ST-3 add/update and rotate share identical mechanics — saveCredential
 * (D-020) disables any existing active row and inserts a new one, so a
 * fresh key for a provider with no active row ("add") and a fresh key for
 * a provider that already has one ("rotate") are the same call.
 */
export async function saveCredential(
  providerId: ProviderId,
  apiKey: string,
  options?: { label?: string; baseUrl?: string; defaultModel?: string },
): Promise<ActionResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, error: "API key is required" };
  if (trimmed.length < MIN_API_KEY_LENGTH) {
    return { ok: false, error: `API key must be at least ${MIN_API_KEY_LENGTH} characters so Settings never displays the entire secret (C-11)` };
  }
  if (!LIVE_PROVIDER_IDS.includes(providerId)) {
    return { ok: false, error: `No live adapter for provider "${providerId}" yet` };
  }
  const baseUrlOverride = options?.baseUrl?.trim();
  if (baseUrlOverride) {
    const baseUrlError = validateProviderBaseUrlOverride(providerId, baseUrlOverride);
    if (baseUrlError) return { ok: false, error: baseUrlError };
  }
  const lifecycleError = await credentialRotationLifecycleError(providerId);
  if (lifecycleError) return { ok: false, error: lifecycleError };

  let encrypted: ReturnType<typeof encryptApiKey>;
  try {
    encrypted = encryptApiKey(trimmed);
  } catch (err) {
    if (err instanceof CredentialConfigError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Credential encryption failed" };
  }
  try {
    await saveCredentialRow({
      providerId,
      label: options?.label?.trim() || "default",
      encryptedApiKey: encrypted.ciphertext,
      keyVersion: encrypted.keyVersion,
      apiKeyLast4: encrypted.last4,
      apiKeyFingerprint: encrypted.fingerprint,
      baseUrl: options?.baseUrl?.trim() || null,
      defaultModel: options?.defaultModel?.trim() || null,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * ST-3 verify: a minimal, cheap live call proves the key actually
 * authenticates before the operator trusts it for a run. Only an
 * authentication failure (bad/revoked key) deactivates the credential — a
 * transient rate limit or timeout just reports the error and leaves the
 * credential active so the operator can retry.
 */
export async function verifyCredential(
  credentialId: string,
  providerId: ProviderId,
): Promise<ActionResult> {
  if (!LIVE_PROVIDER_IDS.includes(providerId)) {
    return { ok: false, error: `No live adapter for provider "${providerId}"` };
  }
  const credential = await getActiveCredential(providerId);
  if (!credential || credential.id !== credentialId) {
    return { ok: false, error: "Credential not found or not active" };
  }
  if (credential.baseUrl) {
    const baseUrlError = validateProviderBaseUrlOverride(providerId, credential.baseUrl);
    if (baseUrlError) return { ok: false, error: baseUrlError };
  }

  let apiKey: string | null;
  try {
    apiKey = decryptApiKey(credential.encryptedApiKey);
  } catch (err) {
    if (err instanceof CredentialConfigError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Stored key could not be decrypted — re-enter it" };
  }
  if (apiKey === null) {
    await markInvalid(credentialId);
    revalidatePath(SETTINGS_PATH);
    return { ok: false, error: "Stored key could not be decrypted — re-enter it" };
  }

  const factory = VERIFY_FACTORIES[providerId];
  if (!factory) {
    return { ok: false, error: `No live adapter for provider "${providerId}"` };
  }
  const provider = factory({ apiKey, baseUrl: credential.baseUrl, defaultModel: credential.defaultModel });

  try {
    // Grounded-only providers (Perplexity) can't take an ungrounded probe;
    // everything else verifies with the cheapest possible ungrounded call.
    await provider.generate(
      {
        promptText: "Reply with the single word OK.",
        mode: provider.supportsUngrounded ? "ungrounded" : "grounded",
        maxOutputTokens: 16,
      },
      AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    );
  } catch (err) {
    const errorType = err instanceof ProviderCallError ? err.errorType : "server_error";
    const message = err instanceof ProviderCallError ? err.message : "Verification call failed";
    if (errorType === "auth_error") await markInvalid(credentialId);
    revalidatePath(SETTINGS_PATH);
    return { ok: false, error: message };
  }

  await markVerified(credentialId);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function disableCredential(credentialId: string): Promise<ActionResult> {
  if (!isUuid(credentialId)) return { ok: false, error: "Invalid credential id" };
  const lifecycleError = await destructiveCredentialLifecycleError(credentialId);
  if (lifecycleError) return { ok: false, error: lifecycleError };
  const updated = await disableCredentialRow(credentialId);
  if (updated === 0) {
    return { ok: false, error: "Credential not found" };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function enableCredential(credentialId: string): Promise<ActionResult> {
  if (!isUuid(credentialId)) return { ok: false, error: "Invalid credential id" };
  const credential = await getCredentialEnableSummary(credentialId);
  if (!credential || credential.status !== "disabled") {
    return { ok: false, error: "Credential must be disabled before it can be enabled" };
  }
  if (!LIVE_PROVIDER_IDS.includes(credential.providerId)) {
    return { ok: false, error: `No live adapter for provider "${credential.providerId}" yet` };
  }
  if (credential.baseUrl) {
    const baseUrlError = validateProviderBaseUrlOverride(credential.providerId, credential.baseUrl);
    if (baseUrlError) return { ok: false, error: baseUrlError };
  }
  const lifecycleError = await credentialRotationLifecycleError(credential.providerId);
  if (lifecycleError) return { ok: false, error: lifecycleError };
  const updated = await enableCredentialRow(credentialId);
  if (updated === 0) {
    return { ok: false, error: "Credential must be disabled before it can be enabled" };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deleteCredential(credentialId: string): Promise<ActionResult> {
  if (!isUuid(credentialId)) return { ok: false, error: "Invalid credential id" };
  const lifecycleError = await destructiveCredentialLifecycleError(credentialId);
  if (lifecycleError) return { ok: false, error: lifecycleError };
  const deleted = await deleteCredentialRow(credentialId);
  if (deleted === 0) {
    return { ok: false, error: "Credential not found" };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
