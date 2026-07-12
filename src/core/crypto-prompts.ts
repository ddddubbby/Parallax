// GEO agent prompt matrix `crypto_geo_prompts_v1` (AGENT_PRD §4). 20 cells in
// three lanes: Lane A never names the token (a mention there is earned, never
// planted); Lanes B/C name it deliberately (description is elicited, never
// inferred from silence). This is the prompt-frame rule (D-054): a metric never
// counts a signal its own prompt planted.
//
// Repo mapping (AGENT_PRD §4): Lane A cells use the existing `discovery` intent;
// Lanes B/C use the existing `representation` intent, distinguished by variant
// key. NO new intent enum value. 20 cells < the C-1 50-cell cap.
//
// Prompts are FROZEN and versioned (P5): any text change is a new prompt-matrix
// version and a new offering version.

import type { AssetChain } from "./crypto-resolver";
import { escapeForSink } from "./crypto-resolver";

export const CRYPTO_GEO_PROMPTS_VERSION = "crypto_geo_prompts_v1";

export type CryptoLane = "A" | "B" | "C";
export type CryptoIntent = "discovery" | "representation";

/** AGENT_PRD §2 `discovery_category` — selects the Lane-A prompt pack ONLY. */
export type DiscoveryCategory =
  | "meme_token"
  | "ai_agent"
  | "defi"
  | "gaming"
  | "rwa"
  | "general_crypto";

/** Deterministic category-phrase mapping (AGENT_PRD §4). No other values. */
export const CATEGORY_PHRASE: Record<DiscoveryCategory, string> = {
  meme_token: "meme tokens",
  ai_agent: "AI agent tokens",
  defi: "DeFi tokens",
  gaming: "gaming tokens",
  rwa: "real-world asset (RWA) tokens",
  general_crypto: "tokens",
};

/** Human chain label used in prompt text. */
export const CHAIN_LABEL: Record<AssetChain, string> = {
  base: "Base",
  ethereum: "Ethereum",
};

export interface CryptoPromptTemplate {
  lane: CryptoLane;
  intent: CryptoIntent;
  variantKey: string;
  text: string;
}

// Lane A — unbranded discovery (6 cells). Interpolates {chain} and
// {category_phrase} only; NEVER the name or symbol (P3, scanned per job).
const LANE_A: CryptoPromptTemplate[] = [
  { lane: "A", intent: "discovery", variantKey: "a1", text: "What are the most talked-about {category_phrase} on {chain} right now?" },
  { lane: "A", intent: "discovery", variantKey: "a2", text: "Which {category_phrase} on {chain} are worth knowing about?" },
  { lane: "A", intent: "discovery", variantKey: "a3", text: "I'm exploring {category_phrase} on {chain} — which ones come up the most?" },
  { lane: "A", intent: "discovery", variantKey: "a4", text: "What are the biggest {category_phrase} on {chain} by popularity?" },
  { lane: "A", intent: "discovery", variantKey: "a5", text: "Which {category_phrase} on {chain} are getting attention this year?" },
  { lane: "A", intent: "discovery", variantKey: "a6", text: "If someone wanted a shortlist of {category_phrase} on {chain}, what would be on it?" },
];

// Lane B — natural representation (8 cells). Interpolates {name}, {ticker} only
// — no chain, no contract. Measures description AND mistaken identity.
const LANE_B: CryptoPromptTemplate[] = [
  { lane: "B", intent: "representation", variantKey: "b1", text: "What is {name} ({ticker})?" },
  { lane: "B", intent: "representation", variantKey: "b2", text: "What do you know about the {name} token?" },
  { lane: "B", intent: "representation", variantKey: "b3", text: "How would you describe {name} ({ticker}) to someone new to crypto?" },
  { lane: "B", intent: "representation", variantKey: "b4", text: "What is the {name} project about?" },
  { lane: "B", intent: "representation", variantKey: "b5", text: "What's the story behind {ticker}?" },
  { lane: "B", intent: "representation", variantKey: "b6", text: "What kind of project is {name}?" },
  { lane: "B", intent: "representation", variantKey: "b7", text: "What is the {ticker} token used for?" },
  { lane: "B", intent: "representation", variantKey: "b8", text: "What are people saying about {name} ({ticker}) lately?" },
];

// Lane C — anchored representation (6 cells). Adds {chain} + {address} so the
// engine cannot mean a different token. Probe lane for clean description.
const LANE_C: CryptoPromptTemplate[] = [
  { lane: "C", intent: "representation", variantKey: "c1", text: "What is {name} ({ticker}), the token at {address} on {chain}?" },
  { lane: "C", intent: "representation", variantKey: "c2", text: "What do you know about the token deployed at {address} on {chain}? I believe it's {name}." },
  { lane: "C", intent: "representation", variantKey: "c3", text: "Describe {name} ({ticker}) on {chain} — contract {address}." },
  { lane: "C", intent: "representation", variantKey: "c4", text: "What is the project behind contract {address} on {chain}? It goes by {name} ({ticker})." },
  { lane: "C", intent: "representation", variantKey: "c5", text: "I'm looking at {ticker} at {address} on {chain}. What can you tell me about this token?" },
  { lane: "C", intent: "representation", variantKey: "c6", text: "What information can you find on {name} ({ticker}), contract {address}, on {chain}?" },
];

export const CRYPTO_GEO_PROMPTS: readonly CryptoPromptTemplate[] = [...LANE_A, ...LANE_B, ...LANE_C];

/** Expected lane/cell counts (AGENT_PRD §4). */
export const LANE_CELL_COUNTS = { A: 6, B: 8, C: 6, total: 20 } as const;

export interface CryptoIdentity {
  chain: AssetChain;
  address: string;
  name: string;
  symbol: string;
}

export interface ResolvedCryptoCell {
  lane: CryptoLane;
  intent: CryptoIntent;
  variantKey: string;
  resolvedText: string;
}

/**
 * Resolve all 20 cells for one token + discovery category. Name/symbol/address
 * are escaped for the prompt sink (they are already sanitized upstream — this
 * is defense in depth). Lane A never receives name/ticker/address; the caller
 * MUST still run scanLaneAForIdentity() per job (P3) because the name is
 * attacker-controlled and could coincide with a category phrase.
 */
export function resolveCryptoMatrix(
  identity: CryptoIdentity,
  discoveryCategory: DiscoveryCategory,
): ResolvedCryptoCell[] {
  const name = escapeForSink(identity.name, "prompt");
  const ticker = escapeForSink(identity.symbol, "prompt");
  const address = escapeForSink(identity.address, "prompt");
  const chain = CHAIN_LABEL[identity.chain];
  const categoryPhrase = CATEGORY_PHRASE[discoveryCategory];

  return CRYPTO_GEO_PROMPTS.map((cell) => ({
    lane: cell.lane,
    intent: cell.intent,
    variantKey: cell.variantKey,
    resolvedText: cell.text
      .replaceAll("{category_phrase}", categoryPhrase)
      .replaceAll("{chain}", chain)
      .replaceAll("{name}", name)
      .replaceAll("{ticker}", ticker)
      .replaceAll("{address}", address),
  }));
}

// ---------------------------------------------------------------------------
// P3 — job-time name/symbol scan over resolved Lane A cells (PM-9 pattern).
// The name is attacker-controlled, so this runs per job, not just at design
// time: a token literally named "meme tokens" could otherwise smuggle its
// identity into an unbranded prompt.
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase, case-insensitive containment on word boundaries. */
function containsPhrase(haystack: string, needle: string): boolean {
  const trimmed = needle.trim();
  if (!trimmed) return false;
  return new RegExp(`(^|\\W)${escapeRegExp(trimmed)}(\\W|$)`, "i").test(haystack);
}

export interface LaneAIdentityViolation {
  variantKey: string;
  terms: string[];
}

/**
 * P3: assert no resolved Lane A prompt contains the token name or symbol.
 * Returns one violation per offending Lane A cell. A non-empty result MUST
 * reject the job before budget (AGENT_PRD §4 P3).
 */
export function scanLaneAForIdentity(
  cells: ResolvedCryptoCell[],
  name: string,
  symbol: string,
): LaneAIdentityViolation[] {
  const needles = [name, symbol].map((s) => s.trim()).filter(Boolean);
  const violations: LaneAIdentityViolation[] = [];
  for (const cell of cells) {
    if (cell.lane !== "A") continue;
    const terms = needles.filter((n) => containsPhrase(cell.resolvedText, n));
    if (terms.length > 0) violations.push({ variantKey: cell.variantKey, terms });
  }
  return violations;
}
