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
export const DESCRIPTOR_V1_VERSION = "descriptor_v1";
export const ADVICE_PROSE_V1_VERSION = "advice_prose_v1";

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

/**
 * Category vocabulary counted in matched answers as the Descriptor Profile (M3).
 * NEVER computed on Lane A (its prompts plant category words — contamination
 * rule C-A). Two-letter "ai" relies on the word-boundary matcher (D-062).
 */
export const DESCRIPTOR_V1: readonly string[] = [
  "meme",
  "community",
  "utility",
  "governance",
  "defi",
  "gaming",
  "ai",
  "infrastructure",
  "payment",
  "stablecoin",
  "layer 1",
  "layer 2",
];

/**
 * Verdict/advice vocabulary forbidden in OUR authored report prose (C-16 / the
 * RB-5 forbidden-phrase pattern). NEVER applied to quoted model evidence —
 * attributed engine language like "bullish" stays verbatim (AGENT_PRD §10).
 */
export const ADVICE_PROSE_V1: readonly string[] = [
  "buy",
  "sell",
  "price target",
  "safe investment",
  "good investment",
  "guaranteed return",
  "legitimacy score",
  "trust score",
  "scam score",
  "risk score",
  "bullish",
  "bearish",
];

/**
 * Clear refusal phrases (AGENT_PRD §5's refusal-vs-absence distinction). A
 * refusal is an engine DECLINING to answer — counted and reported separately,
 * excluded from rate denominators (D-014). Deliberately narrow: "I can't find
 * anything about this token" is a real `absent` observation, NOT a refusal, so
 * bare "i can't"/"i cannot" are excluded and only decline-to-help forms match.
 */
export const REFUSAL_V1: readonly string[] = [
  "i can't help",
  "i cannot help",
  "i can't assist",
  "i cannot assist",
  "i'm not able to help",
  "i am not able to help",
  "i'm unable to assist",
  "i am unable to assist",
  "i can't provide",
  "i cannot provide information",
  "i won't be able to help",
  "as an ai language model",
  "against my guidelines",
  "i cannot comply",
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

export interface LexiconHit {
  /** The canonical lexicon term (not the surface form). */
  term: string;
  /** Character offsets into the text the spans were found in. */
  start: number;
  end: number;
  /** The exact surface text matched (may be a plural). */
  quoted: string;
}

/**
 * All spans of `term` in `text`, with offsets. Same matching rules as
 * matchesLexiconTerm (word/phrase boundary + trailing-plural fold; substring
 * for non-word terms). Offsets index `text` directly, so callers that match on
 * a masked copy get offsets that are valid in the identical-length original.
 */
export function findLexiconTermSpans(text: string, term: string): LexiconHit[] {
  const hits: LexiconHit[] = [];
  const needle = term.toLowerCase();
  if (isNonWordTerm(needle)) {
    const haystack = text.toLowerCase();
    let idx = haystack.indexOf(needle);
    while (idx !== -1) {
      hits.push({ term, start: idx, end: idx + needle.length, quoted: text.slice(idx, idx + needle.length) });
      idx = haystack.indexOf(needle, idx + needle.length);
    }
    return hits;
  }
  const re = new RegExp(`\\b${escapeRegExp(needle)}s?\\b`, "giu");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    hits.push({ term, start: match.index, end: match.index + match[0].length, quoted: match[0] });
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return hits;
}

/** Every hit of every lexicon term in `text`, sorted by start offset. */
export function findLexiconHits(text: string, lexicon: readonly string[]): LexiconHit[] {
  return lexicon
    .flatMap((term) => findLexiconTermSpans(text, term))
    .sort((a, b) => a.start - b.start);
}
