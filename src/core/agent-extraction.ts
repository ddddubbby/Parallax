// Mechanical extraction for the GEO agent (AGENT_PRD §6). No LLM reads model
// output: fixed, versioned lexicons + literal matching over the immutable raw
// answers. This module owns the name/ticker masking (C-C) and the masked
// descriptor/risk hit extraction; the identity classifier and metrics build on
// it. Every count links to (start, end, quoted) offsets into the ORIGINAL text.

import { type LexiconHit, findLexiconHits } from "./agent-lexicons";

/**
 * NFKC-normalized token identity as resolved upstream (crypto-resolver). The
 * name/symbol here are already sanitized; masking treats them as literal spans.
 */
export interface TokenIdentityText {
  name: string;
  symbol: string;
}

interface Span {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive substring occurrences of `needle` in `text`. */
function substringSpans(text: string, needle: string): Span[] {
  const spans: Span[] = [];
  if (!needle) return spans;
  const haystack = text.toLowerCase();
  const lower = needle.toLowerCase();
  let idx = haystack.indexOf(lower);
  while (idx !== -1) {
    spans.push({ start: idx, end: idx + lower.length });
    idx = haystack.indexOf(lower, idx + lower.length);
  }
  return spans;
}

/** Word-boundary occurrences of the bare ticker (case-insensitive). */
function bareTickerSpans(text: string, symbol: string): Span[] {
  if (!symbol) return [];
  const spans: Span[] = [];
  const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`, "giu");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return spans;
}

/**
 * The qualified-ticker spans (AGENT_PRD §6/§8): `$TICKER`, `(TICKER)`, or a bare
 * ticker ADJACENT to an exact-name occurrence. A bare ticker elsewhere is never
 * "qualified" — it could be an ordinary word.
 */
export function qualifiedTickerSpans(text: string, identity: TokenIdentityText): Span[] {
  const spans: Span[] = [];
  spans.push(...substringSpans(text, `$${identity.symbol}`));
  spans.push(...substringSpans(text, `(${identity.symbol})`));

  const nameSpans = substringSpans(text, identity.name);
  const bare = bareTickerSpans(text, identity.symbol);
  const ADJACENT = 3; // allow " (", ") ", " " between name and ticker.
  for (const t of bare) {
    const adjacent = nameSpans.some(
      (n) =>
        (n.end <= t.start && t.start - n.end <= ADJACENT) ||
        (t.end <= n.start && n.start - t.end <= ADJACENT),
    );
    if (adjacent) spans.push(t);
  }
  return spans;
}

/**
 * C-C steps 1–2: length-preserving masked working copy. Every span of the exact
 * name and every qualified-ticker form is replaced by the SAME number of space
 * characters, so all offsets stay identical to the original. Descriptor/risk
 * matching runs on this copy so a token literally named "AI Corp" or "RugRadio"
 * cannot manufacture a descriptor/risk hit from its own name.
 */
export function maskIdentity(text: string, identity: TokenIdentityText): string {
  const spans = [...substringSpans(text, identity.name), ...qualifiedTickerSpans(text, identity)];
  if (spans.length === 0) return text;
  const chars = [...text];
  for (const span of spans) {
    for (let i = span.start; i < span.end && i < chars.length; i++) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

/**
 * C-C steps 3–4: run lexicon matching on the masked copy, then report each hit
 * with offsets into (and the surface text of) the ORIGINAL — identical by
 * construction, so the quoted receipt is the real answer text, never spaces.
 */
export function maskedLexiconHits(
  original: string,
  identity: TokenIdentityText,
  lexicon: readonly string[],
): LexiconHit[] {
  const masked = maskIdentity(original, identity);
  return findLexiconHits(masked, lexicon).map((hit) => ({
    ...hit,
    quoted: original.slice(hit.start, hit.end),
  }));
}
