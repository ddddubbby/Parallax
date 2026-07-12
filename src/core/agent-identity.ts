// Mechanical identity classifier (AGENT_PRD §8) + representation_state
// derivation (§9). Answers the buyer's "my token or an impostor?" question by
// literal matching only — no LLM, no sentiment. Runs on Lane A and Lane B.

import { qualifiedTickerSpans, type TokenIdentityText } from "./agent-extraction";
import type { AssetChain } from "./crypto-resolver";

export type IdentityClass = "matched" | "namesake" | "ambiguous" | "absent";

export interface ClassifierResponse {
  rawText: string;
  /** Citation URLs attached to the answer (domains already normalized upstream). */
  citations: string[];
}

export interface ClassifierIdentity extends TokenIdentityText {
  address: string;
  chain: AssetChain;
}

const ADDRESS_RE = /0x[0-9a-fA-F]{40}/g;

/** Every 0x…40-hex address in `text`, lowercased. */
export function extractAddresses(text: string): string[] {
  return (text.match(ADDRESS_RE) ?? []).map((a) => a.toLowerCase());
}

/** Chain/explorer signals present in the answer text + citations, per chain. */
function chainSignals(text: string, citations: string[]): Record<AssetChain, boolean> {
  const hay = `${text}\n${citations.join("\n")}`.toLowerCase();
  const base =
    /\bbasescan\b/.test(hay) ||
    /\bon\s+base\b/.test(hay) ||
    /\bbase\s+(chain|network|mainnet|l2|blockchain)\b/.test(hay);
  const ethereum =
    /\betherscan\b/.test(hay) ||
    /\bethereum\b/.test(hay) ||
    /\beth\s+mainnet\b/.test(hay);
  return { base, ethereum };
}

/**
 * Classify one answer's identity against the target token (AGENT_PRD §8).
 * A qualified ticker is ONLY `$TICKER`, `(TICKER)`, or a name-adjacent bare
 * ticker — never a bare short word.
 */
export function classifyIdentity(
  response: ClassifierResponse,
  identity: ClassifierIdentity,
): IdentityClass {
  const target = identity.address.toLowerCase();
  const haystack = `${response.rawText}\n${response.citations.join("\n")}`.toLowerCase();

  // §8.1 first clause: the target contract address in the answer or its
  // citations is the strongest anchor — matched outright.
  if (haystack.includes(target)) return "matched";

  const namePresent = response.rawText.toLowerCase().includes(identity.name.toLowerCase());
  const tickerPresent = qualifiedTickerSpans(response.rawText, identity).length > 0;

  // §8.4: no contract, exact name, or qualified ticker → absent.
  if (!namePresent && !tickerPresent) return "absent";

  const otherAddresses = [
    ...extractAddresses(response.rawText),
    ...response.citations.flatMap((c) => extractAddresses(c)),
  ].filter((a) => a !== target);

  // A different contract tied to this name/ticker is a namesake (§8.2).
  if (otherAddresses.length > 0) return "namesake";

  const signals = chainSignals(response.rawText, response.citations);
  const matchesChain = signals[identity.chain];
  const otherChain = (Object.keys(signals) as AssetChain[]).some(
    (c) => c !== identity.chain && signals[c],
  );

  // §8.1 second clause: exact name AND qualified ticker together, exactly one
  // matching chain/explorer reference, no conflicting contract → matched.
  if (namePresent && tickerPresent) {
    if (matchesChain && !otherChain) return "matched";
    if (otherChain && !matchesChain) return "namesake"; // only a different chain (§8.2)
    return "ambiguous"; // no chain evidence, or both chains referenced (§8.3)
  }

  // Only one of name/ticker present, no contract evidence → not enough to
  // confirm identity (§8.3).
  return "ambiguous";
}

export type RepresentationState = "estimable" | "sparse" | "not_estimable";

/**
 * AGENT_PRD §9 representation_state (evidence, never a payment/completion gate):
 * estimable if ≥1 engine has Lane-B `matched` n ≥ 30; sparse if some matched
 * samples exist but no engine reaches 30; not_estimable if zero matched on
 * every engine.
 */
export function deriveRepresentationState(matchedCountsPerEngine: number[]): RepresentationState {
  if (matchedCountsPerEngine.some((n) => n >= 30)) return "estimable";
  if (matchedCountsPerEngine.some((n) => n > 0)) return "sparse";
  return "not_estimable";
}
