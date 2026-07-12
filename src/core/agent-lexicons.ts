// GEO agent lexicons (AGENT_PRD §6) — checked in and versioned; any text
// change is a new version and a new offering version. This module owns the two
// lexicons M36 needs: `risk_v1` (prompt design-time P4 guard) and
// `prompt_control_v1` (resolver step-7 metadata rejection). The extraction
// lexicons `descriptor_v1`/`advice_prose_v1` and the metric-side matching land
// in M37; they are deliberately NOT here yet (surgical scope).
//
// Matching rules (D-062 lesson): word/phrase-boundary with plural folding so a
// two-letter term like "ai" never matches inside another word. Terms that
// contain non-word characters (e.g. "http://") cannot use \b boundaries, so
// they fall back to a case-insensitive substring check.

export const RISK_V1_VERSION = "risk_v1";
export const PROMPT_CONTROL_V1_VERSION = "prompt_control_v1";

/**
 * Warning/negative-signal vocabulary. Used two ways: (M37) counted in model
 * answers as Risk-Language Rate, and (M36, P4) asserted absent from every
 * prompt cell so a metric never counts a signal its own prompt planted.
 */
export const RISK_V1: readonly string[] = [
  "scam",
  "rug",
  "rug pull",
  "fraud",
  "honeypot",
  "exploit",
  "hacked",
  "hack",
  "phishing",
  "malware",
  "ponzi",
  "manipulation",
  "wash trading",
  "unaudited",
  "unverified",
  "anonymous team",
  "liquidity risk",
  "contract risk",
  "volatility",
  "speculative",
];

/**
 * Injection markers. On-chain token metadata is attacker-controlled; any of
 * these appearing in a resolved name/symbol rejects the job before budget
 * (resolver step 7). The two URL schemes double as the URL-like guard's floor.
 */
export const PROMPT_CONTROL_V1: readonly string[] = [
  "ignore previous",
  "system prompt",
  "developer message",
  "assistant message",
  "tool call",
  "reveal secret",
  "http://",
  "https://",
];

/** True when `term` contains a character that cannot sit next to a \b word boundary. */
function isNonWordTerm(term: string): boolean {
  return /[^\p{L}\p{N} ]/u.test(term);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whole-word / whole-phrase match with plural folding, case-insensitive.
 * A trailing "s" on the matched span is tolerated (folds "scams" → "scam")
 * but the term itself is matched at word boundaries so "ai" never fires
 * inside "chair" or "email". Non-word terms (URLs) use substring matching
 * since \b is undefined next to "/" or ":".
 */
export function matchesLexiconTerm(text: string, term: string): boolean {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();
  if (isNonWordTerm(needle)) {
    return haystack.includes(needle);
  }
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}s?\\b`, "u");
  return pattern.test(haystack);
}

/** True if `text` contains ANY term from `lexicon`. */
export function containsAnyLexiconTerm(text: string, lexicon: readonly string[]): boolean {
  return lexicon.some((term) => matchesLexiconTerm(text, term));
}
