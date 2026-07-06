// Shared plumbing for live provider adapters. Moved out of
// src/providers/deepseek in M9 when four more adapters arrived; deepseek
// re-exports these names so its existing importers keep working.

export class ProviderCallError extends Error {
  constructor(
    public readonly errorType:
      | "rate_limit"
      | "timeout"
      | "server_error"
      | "auth_error"
      | "malformed_output"
      | "unsupported_mode",
    message: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

/** RN-6: canonical mapping from HTTP status to our error-type enum. */
export function classifyHttpStatus(status: number): ProviderCallError["errorType"] {
  if (status === 401 || status === 403) return "auth_error";
  if (status === 429) return "rate_limit";
  return "server_error";
}

/**
 * Decrypted, call-ready credentials (C-11: only ever constructed
 * server/worker-side by the runtime resolver, never in UI code). D-020:
 * non-null baseUrl/defaultModel override the env defaults.
 */
export interface LiveCredentials {
  apiKey: string;
  baseUrl?: string | null;
  defaultModel?: string | null;
}

const OFFICIAL_PROVIDER_HOSTS: Record<string, string> = {
  deepseek: "api.deepseek.com",
  openai: "api.openai.com",
  anthropic: "api.anthropic.com",
  google: "generativelanguage.googleapis.com",
  perplexity: "api.perplexity.ai",
};

/**
 * C-11 defense-in-depth: every live provider call sends the bearer/API key to
 * the credential's base URL. Stored overrides, including legacy rows saved
 * before validation existed, must only target HTTPS provider hosts or an
 * explicitly configured deploy-layer proxy host.
 */
export function validateProviderBaseUrlOverride(providerId: string, baseUrl: string): string | null {
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
 * One fetch wrapper all adapters share: timeout/abort mapping (both
 * AbortError from manual aborts and TimeoutError from AbortSignal.timeout,
 * D-039), HTTP status classification, and JSON parsing. Returns the parsed
 * body; adapter-specific response shapes are validated by each caller.
 */
export async function postProviderJson(
  providerName: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
      throw new ProviderCallError("timeout", `${providerName} request timed out or was aborted`);
    }
    throw new ProviderCallError(
      "server_error",
      `${providerName} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    const errorType = classifyHttpStatus(response.status);
    // C-11: never propagate provider/proxy error bodies into run events,
    // job errors, or Settings verification UI. A proxy or upstream could
    // echo request headers, including bearer/API keys.
    throw new ProviderCallError(errorType, `${providerName} returned HTTP ${response.status} (${errorType})`);
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderCallError("malformed_output", `${providerName} response was not valid JSON`);
  }
}

/** Citation normalization: providers give URLs; our Citation shape wants a domain. */
export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
