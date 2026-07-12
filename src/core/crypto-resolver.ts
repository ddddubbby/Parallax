// GEO agent identity resolution (AGENT_PRD §3). On-chain metadata is
// buyer-independent but still attacker-controlled — treat it as hostile input
// that happens to be canonical. This module is PURE: it owns steps 5–8 (the
// sanitization pipeline) and knows nothing about RPC. Steps 1–4 (checksum,
// chain-id check, bytecode, ABI decode) live behind the injectable reader in
// `src/modules/agent/resolver.ts`, which calls sanitizeTokenMetadata() here.
//
// Any failure → the ACP job is rejected BEFORE setBudget. Resolver failure is
// NEVER an evidence finding (AGENT_PRD §3).

import { PROMPT_CONTROL_V1, matchesLexiconTerm } from "./agent-lexicons";

export type AssetChain = "base" | "ethereum";

/** Settlement/audit chain IDs. Base is 8453, Ethereum mainnet is 1. */
export const CHAIN_IDS: Record<AssetChain, number> = {
  base: 8453,
  ethereum: 1,
};

/** AGENT_PRD §3 step 6 caps. */
export const NAME_MAX_CHARS = 64;
export const SYMBOL_MAX_CHARS = 16;

/**
 * Closed set of pre-budget rejection reasons. Every one maps to an ACP
 * reject/refund, never to an evidence finding. Ordered roughly by pipeline
 * stage so the FIRST failure is reported.
 */
export type ResolverRejectionReason =
  | "invalid_address"
  | "chain_id_mismatch"
  | "empty_bytecode"
  | "metadata_read_failed"
  | "empty_name"
  | "empty_symbol"
  | "name_too_long"
  | "symbol_too_long"
  | "newline"
  | "control_char"
  | "bidi_override"
  | "url_like"
  | "prompt_control_term";

export type MetadataField = "name" | "symbol";

export interface ResolverRejection {
  ok: false;
  reason: ResolverRejectionReason;
  field?: MetadataField | "address" | "chain" | "bytecode";
  detail: string;
}

/** The sanitized, canonical token identity. All escaping is applied per-sink downstream. */
export interface SanitizedMetadata {
  ok: true;
  /** NFKC-normalized, validated display name. */
  name: string;
  /** NFKC-normalized, validated ticker symbol. */
  symbol: string;
}

export type SanitizeResult = SanitizedMetadata | ResolverRejection;

// Bidi overrides + directional isolates + implicit marks (Trojan-Source class):
// LRE/RLE/PDF/LRO/RLO, LRI/RLI/FSI/PDI, LRM/RLM, Arabic letter mark.
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/u;
// Newlines (incl. line/paragraph separators) get their own, more specific reason.
const NEWLINE_RE = /[\n\r\u2028\u2029]/u;
// Any other control character: C0 incl. tab (0x09), plus DEL and C1. CR/LF are
// excluded here because NEWLINE_RE catches them first.
const CONTROL_RE = /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

// URL-like heuristic. Schemes and www. are unambiguous; a bare `label.tld`
// against a modest crypto-adjacent TLD set catches "myscam.io" while sparing
// ordinary names that merely contain a period.
const URL_TLDS = [
  "com", "io", "xyz", "net", "org", "app", "finance", "fi",
  "co", "eth", "crypto", "money", "cash", "gg", "dev", "ai",
];
const URL_LIKE_RE = new RegExp(
  `(?:https?:\\/\\/|www\\.|\\b[a-z0-9-]+\\.(?:${URL_TLDS.join("|")})\\b)`,
  "iu",
);

/** Reject the first violation in `value`, or null if the field is clean. */
function scanForViolation(value: string, field: MetadataField): ResolverRejection | null {
  if (NEWLINE_RE.test(value)) {
    return { ok: false, reason: "newline", field, detail: `${field} contains a line break` };
  }
  if (CONTROL_RE.test(value)) {
    return { ok: false, reason: "control_char", field, detail: `${field} contains a control character` };
  }
  if (BIDI_RE.test(value)) {
    return { ok: false, reason: "bidi_override", field, detail: `${field} contains a bidirectional override` };
  }
  if (URL_LIKE_RE.test(value)) {
    return { ok: false, reason: "url_like", field, detail: `${field} contains URL-like text` };
  }
  for (const term of PROMPT_CONTROL_V1) {
    if (matchesLexiconTerm(value, term)) {
      return {
        ok: false,
        reason: "prompt_control_term",
        field,
        detail: `${field} contains prompt-control term "${term}"`,
      };
    }
  }
  return null;
}

/**
 * AGENT_PRD §3 steps 5–7 over already-decoded name/symbol strings.
 * NFKC-normalize, require non-empty, enforce caps, then reject any hostile
 * metadata. Returns the sanitized canonical values or the first rejection.
 */
export function sanitizeTokenMetadata(rawName: string, rawSymbol: string): SanitizeResult {
  const name = rawName.normalize("NFKC");
  const symbol = rawSymbol.normalize("NFKC");

  // Step 5: non-empty (whitespace-only counts as empty).
  if (name.trim().length === 0) {
    return { ok: false, reason: "empty_name", field: "name", detail: "name is empty" };
  }
  if (symbol.trim().length === 0) {
    return { ok: false, reason: "empty_symbol", field: "symbol", detail: "symbol is empty" };
  }

  // Step 6: length caps. Attacker-controlled metadata is rejected, never truncated.
  if (name.length > NAME_MAX_CHARS) {
    return {
      ok: false,
      reason: "name_too_long",
      field: "name",
      detail: `name exceeds ${NAME_MAX_CHARS} chars (${name.length})`,
    };
  }
  if (symbol.length > SYMBOL_MAX_CHARS) {
    return {
      ok: false,
      reason: "symbol_too_long",
      field: "symbol",
      detail: `symbol exceeds ${SYMBOL_MAX_CHARS} chars (${symbol.length})`,
    };
  }

  // Step 7: reject control/bidi/newline/URL-like/prompt-control content.
  return scanForViolation(name, "name") ?? scanForViolation(symbol, "symbol") ?? { ok: true, name, symbol };
}

// ---------------------------------------------------------------------------
// Step 8: escape sanitized metadata independently for each sink. The value is
// already free of control chars, newlines, URLs, and injection markers by the
// time it reaches these, so each escape is a thin, sink-appropriate transform —
// but they stay SEPARATE functions on purpose (one sink's rules never leak into
// another's).
// ---------------------------------------------------------------------------

export type MetadataSink = "prompt" | "json" | "log" | "markdown" | "html";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const MARKDOWN_SPECIALS = /[\\`*_{}\[\]()#+\-.!|>~]/g;

export function escapeForSink(value: string, sink: MetadataSink): string {
  switch (sink) {
    case "html":
      return value.replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
    case "markdown":
      return value.replace(MARKDOWN_SPECIALS, (ch) => `\\${ch}`);
    case "json":
      // Escape the two characters that would break a JSON string body. Callers
      // that serialize with JSON.stringify get this for free; this exists for
      // manual string assembly sinks.
      return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    case "prompt":
    case "log":
      // Sanitized value is already data-only (no injection markers, no control
      // chars); embedding it verbatim is safe. Kept as an explicit branch so
      // future hardening has a home per sink.
      return value;
  }
}
