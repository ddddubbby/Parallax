"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCredential as deleteCredentialRow,
  disableCredential as disableCredentialRow,
  enableCredential as enableCredentialRow,
  getActiveCredential,
  markInvalid,
  markVerified,
  saveCredential as saveCredentialRow,
} from "@/db/repositories/credentials";
import { decryptApiKey, encryptApiKey } from "@/modules/settings/crypto";
import { createAnthropicProvider } from "@/providers/anthropic";
import { createDeepSeekProvider } from "@/providers/deepseek";
import { createGoogleProvider } from "@/providers/google";
import { createOpenAIProvider } from "@/providers/openai";
import { createPerplexityProvider } from "@/providers/perplexity";
import { type LiveCredentials, ProviderCallError } from "@/providers/shared";
import type { LLMProvider, ProviderId } from "@/providers/types";

type ActionResult = { ok: true } | { ok: false; error: string };

const SETTINGS_PATH = "/settings";
// Same env var and default as the worker's per-call deadline
// (WORKER_PROVIDER_TIMEOUT_MS) — a Verify call is a real provider.generate()
// through this server action, so a hung provider must not tie up the
// request indefinitely, same as every other call site.
const VERIFY_TIMEOUT_MS = Number(process.env.WORKER_PROVIDER_TIMEOUT_MS ?? 45_000);

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

/**
 * C-11 defense-in-depth: every provider call sends the bearer/API key to
 * the credential's base URL, so an arbitrary override is a one-field
 * key-exfiltration path (e.g. via a hijacked session). Overrides are
 * limited to HTTPS against the provider's official host or the host
 * already configured at the deploy layer (<PROVIDER>_BASE_URL, D-020) —
 * pointing at a proxy is a deploy-config decision, not a form field.
 */
const OFFICIAL_PROVIDER_HOSTS: Record<string, string> = {
  deepseek: "api.deepseek.com",
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  google: "generativelanguage.googleapis.com",
  perplexity: "api.perplexity.ai",
};

function validateBaseUrlOverride(providerId: ProviderId, baseUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return "Base URL override is not a valid URL";
  }
  if (parsed.protocol !== "https:") {
    return "Base URL override must use https";
  }
  const allowedHosts = new Set<string>();
  const official = OFFICIAL_PROVIDER_HOSTS[providerId];
  if (official) allowedHosts.add(official);
  const envBase = process.env[`${providerId.toUpperCase()}_BASE_URL`];
  if (envBase) {
    try {
      allowedHosts.add(new URL(envBase).hostname);
    } catch {
      // Malformed deploy config never widens the allowlist.
    }
  }
  if (!allowedHosts.has(parsed.hostname)) {
    return `Base URL host "${parsed.hostname}" is not allowlisted for ${providerId} — provider keys are only sent to ${[...allowedHosts].join(", ")} (C-11)`;
  }
  return null;
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
  if (!LIVE_PROVIDER_IDS.includes(providerId)) {
    return { ok: false, error: `No live adapter for provider "${providerId}" yet` };
  }
  const baseUrlOverride = options?.baseUrl?.trim();
  if (baseUrlOverride) {
    const baseUrlError = validateBaseUrlOverride(providerId, baseUrlOverride);
    if (baseUrlError) return { ok: false, error: baseUrlError };
  }

  const encrypted = encryptApiKey(trimmed);
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
  const credential = await getActiveCredential(providerId);
  if (!credential || credential.id !== credentialId) {
    return { ok: false, error: "Credential not found or not active" };
  }

  const apiKey = decryptApiKey(credential.encryptedApiKey);
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
  await disableCredentialRow(credentialId);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function enableCredential(credentialId: string): Promise<ActionResult> {
  const updated = await enableCredentialRow(credentialId);
  if (updated === 0) {
    return { ok: false, error: "Credential must be disabled before it can be enabled" };
  }
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

export async function deleteCredential(credentialId: string): Promise<ActionResult> {
  await deleteCredentialRow(credentialId);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
