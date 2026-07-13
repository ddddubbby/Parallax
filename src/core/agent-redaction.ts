// redact_v1 (AGENT_PRD §10, D-109-narrowed): a versioned, machine-testable
// redaction policy with EXACTLY two categories — (a) credential/secret
// patterns (private keys, seed phrases, API-key formats; regex + entropy
// rules) and (b) personal-data patterns (emails, phone numbers,
// government-ID-shaped numbers; pattern rules). Nothing else is redactable.
// Content that automated safety signals flag but these rules cannot classify
// fails the JOB closed (reject/refund + post-terminal incident review) — that
// gate rides on live provider safety metadata and is enforced at the gateway,
// not here. Every redaction retains offsets, policy code, rule id, and the
// source hash; raw evidence stays immutable and internal (C-3).

import { sha256Hex } from "./canonical-json";

export const REDACT_V1_VERSION = "redact_v1";

export type RedactionCategory = "credential_secret" | "personal_data";

export interface RedactionSpan {
  start: number;
  end: number;
  category: RedactionCategory;
  /** Which rule fired — the machine-testable "omission reason". */
  rule: string;
  policy: typeof REDACT_V1_VERSION;
}

interface Rule {
  id: string;
  category: RedactionCategory;
  re: RegExp;
  /** Optional post-filter on the matched text (e.g. entropy threshold). */
  accept?: (match: string) => boolean;
}

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// Common English function words — a deterministic prose screen for the seed-
// phrase rule (BIP39 wordlist matching is the upgrade path once @scure/bip39
// is available offline; until then any 12+-word run containing one of these is
// prose, not a mnemonic — mnemonics never contain them).
const FUNCTION_WORDS = new Set([
  "the", "and", "of", "to", "in", "is", "it", "that", "for", "on", "with",
  "as", "at", "by", "an", "be", "or", "are", "this", "was", "but", "not",
  "from", "they", "we", "his", "her", "its", "have", "has", "had", "you",
  "your", "their", "there", "which", "will", "would", "can", "could",
]);

function looksLikeMnemonic(match: string): boolean {
  const words = match.trim().split(/\s+/);
  if (words.length < 12 || words.length > 24) return false;
  if (words.some((w) => FUNCTION_WORDS.has(w))) return false;
  // Mnemonics are (near-)duplicate-free; prose repeats words.
  return new Set(words).size >= words.length - 1;
}

const RULES: Rule[] = [
  // --- (a) credential/secret patterns ---
  {
    id: "hex_private_key",
    category: "credential_secret",
    // 32-byte hex — private-key-shaped. Deliberately also catches tx hashes
    // (indistinguishable by shape; a public hash redacted is harmless, a leaked
    // key missed is catastrophic). 40-hex addresses do NOT match.
    re: /\b(?:0x)?[0-9a-fA-F]{64}\b/g,
  },
  {
    id: "api_key_format",
    category: "credential_secret",
    re: /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g,
  },
  {
    id: "jwt",
    category: "credential_secret",
    re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    id: "high_entropy_token",
    category: "credential_secret",
    re: /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g,
    accept: (m) => shannonEntropy(m) > 4.5,
  },
  {
    id: "seed_phrase",
    category: "credential_secret",
    re: /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g,
    accept: looksLikeMnemonic,
  },
  // --- (b) personal-data patterns ---
  {
    id: "email",
    category: "personal_data",
    re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    id: "phone",
    category: "personal_data",
    // +country…, (xxx) xxx-xxxx, or xxx-xxx-xxxx. Date shapes (4-2-2) do not match.
    re: /(?:\+\d{1,3}[ .-]?\d{2,4}[ .-]?\d{3,4}[ .-]?\d{3,4}|\(\d{3}\)\s?\d{3}[ .-]\d{4}|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b)/g,
  },
  {
    id: "government_id",
    category: "personal_data",
    re: /\b\d{3}-\d{2}-\d{4}\b/g, // SSN-shaped
  },
];

/** All redact_v1 spans in `text`, sorted by start, overlaps merged (first rule wins). */
export function findRedactions(text: string): RedactionSpan[] {
  const spans: RedactionSpan[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      if (rule.accept && !rule.accept(m[0])) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, category: rule.category, rule: rule.id, policy: REDACT_V1_VERSION });
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: RedactionSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) continue; // contained/overlapping — first (earlier/longer) wins
    merged.push(s);
  }
  return merged;
}

export interface RedactionResult {
  text: string;
  redactions: Array<RedactionSpan & { sourceSha256: string }>;
}

/**
 * Publication-side masking: replace each span with `[REDACTED:category]`.
 * The record keeps the ORIGINAL offsets + the source text's hash so the
 * omission is auditable against immutable internal evidence.
 */
export function redactForPublication(text: string): RedactionResult {
  const spans = findRedactions(text);
  if (spans.length === 0) return { text, redactions: [] };
  const sourceSha256 = sha256Hex(text);
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start) + `[REDACTED:${span.category}]`;
    cursor = span.end;
  }
  out += text.slice(cursor);
  return { text: out, redactions: spans.map((s) => ({ ...s, sourceSha256 })) };
}
