"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCredential as deleteCredentialRow,
  disableCredential as disableCredentialRow,
  getActiveCredential,
  markInvalid,
  markVerified,
  saveCredential as saveCredentialRow,
} from "@/db/repositories/credentials";
import { decryptApiKey, encryptApiKey } from "@/modules/settings/crypto";
import { callDeepSeekChat, ProviderCallError } from "@/providers/deepseek";
import type { ProviderId } from "@/providers/types";

type ActionResult = { ok: true } | { ok: false; error: string };

const SETTINGS_PATH = "/settings";

// Providers with a live adapter wired up to resolveRuntimeProvider — the
// only ones Settings can actually accept a key for right now (M9 adds
// MiniMax/OpenAI/Anthropic/Gemini/Perplexity to this list as they land).
const LIVE_PROVIDER_IDS: readonly ProviderId[] = ["deepseek"];

/**
 * C-11 defense-in-depth: every provider call sends `Authorization: Bearer
 * <key>` to the credential's base URL, so an arbitrary override is a
 * one-field key-exfiltration path (e.g. via a hijacked session). Overrides
 * are limited to HTTPS against the provider's official host or the host
 * already configured at the deploy layer (<PROVIDER>_BASE_URL, D-020) —
 * pointing at a proxy is a deploy-config decision, not a form field.
 */
const OFFICIAL_PROVIDER_HOSTS: Record<string, string> = { deepseek: "api.deepseek.com" };

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

  try {
    await callDeepSeekChat(
      { apiKey, baseUrl: credential.baseUrl, defaultModel: credential.defaultModel },
      { messages: [{ role: "user", content: "Reply with the single word OK." }], max_tokens: 5 },
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

export async function deleteCredential(credentialId: string): Promise<ActionResult> {
  await deleteCredentialRow(credentialId);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
