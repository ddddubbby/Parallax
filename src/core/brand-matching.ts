import { normalizePhrase } from "./intake";

// M45 / D-115: deterministic brand-term matching, shared by SM-4 resolution
// (resolveBrandId) and the PM-9 unbranded-prompt scanner (findBrandTerms).
// Born from a recorded failure: the operator registered "Insta 360", every
// AI engine writes "Insta360", and exact normalized equality silently lost
// 97.7% of client mentions. Two deterministic layers close the class:
//
//   1. compact-key equality — strip all non-alphanumerics after the standard
//      normalization, so spacing/punctuation variants of the SAME name are
//      equal ("Insta 360" ≡ "Insta360" ≡ "insta-360").
//   2. tokenized containment — a longer observed string (usually a product
//      name, "Insta360 X4") contains a brand term iff some contiguous token
//      window compacts to the term's compact key. Comparing whole windows
//      keeps word-boundary safety in compact space: brand "X" never matches
//      inside token "x4".
//
// No fuzzy scores, no edit distance, no LLM canonicalization — SM-4's
// auditability stance is preserved: every match is reproducible by hand.

/** Lowercased, whitespace-collapsed, all non-alphanumerics removed. */
export function compactKey(value: string): string {
  return normalizePhrase(value).replace(/[^a-z0-9]/g, "");
}

/** Layer-1 equality: exact normalized match OR compact-key match. */
export function brandTermEquals(observed: string, term: string): boolean {
  const normObserved = normalizePhrase(observed);
  const normTerm = normalizePhrase(term);
  if (!normTerm || !normObserved) return false;
  if (normObserved === normTerm) return true;
  const compact = compactKey(term);
  return compact !== "" && compactKey(observed) === compact;
}

/** Alphanumeric token runs of a string, in order ("Insta360 X4 (new)" → [insta360, x4, new]). */
function tokens(value: string): string[] {
  return normalizePhrase(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
}

/**
 * Layer-2 containment: does `text` contain `term` as a contiguous token
 * window under compact comparison? Strict superset of the old word-boundary
 * regex scan (which this replaces in PM-9): "insta 360" is found in both
 * "the Insta 360 X4" and "the Insta360 X4".
 */
export function containsBrandTerm(text: string, term: string): boolean {
  const target = compactKey(term);
  if (target === "") return false;
  const parts = tokens(text);
  for (let i = 0; i < parts.length; i++) {
    let window = "";
    for (let j = i; j < parts.length; j++) {
      window += parts[j];
      if (window === target) return true;
      if (window.length >= target.length) break; // windows only grow
    }
  }
  return false;
}

export interface BrandTermSet {
  id: string;
  name: string;
  aliases: string[];
}

function termsOf(brand: BrandTermSet): string[] {
  return [brand.name, ...brand.aliases];
}

/**
 * D-115 resolution order: equality (exact or compact) against any brand's
 * terms wins first, across ALL brands, before any containment is considered.
 * Then containment resolves only when exactly ONE brand is contained — an
 * observed name like "Insta360 vs GoPro" hits two brands and stays
 * unresolved (fail closed, never a guess).
 */
export function resolveBrandTerms(observedName: string, brands: BrandTermSet[]): string | null {
  for (const brand of brands) {
    if (termsOf(brand).some((t) => brandTermEquals(observedName, t))) return brand.id;
  }
  const contained = brands.filter((brand) =>
    termsOf(brand).some((t) => containsBrandTerm(observedName, t)),
  );
  return contained.length === 1 ? contained[0].id : null;
}

export interface CompactCollision {
  key: string;
  names: string[];
}

/**
 * The one configuration compact matching cannot disambiguate: two tracked
 * brands whose term sets share a compact key ("Go Pro" as one brand and
 * "GoPro" as another). Brand save paths reject these (D-115).
 */
export function findCompactKeyCollisions(brands: BrandTermSet[]): CompactCollision[] {
  const byKey = new Map<string, Set<string>>();
  for (const brand of brands) {
    for (const term of termsOf(brand)) {
      const key = compactKey(term);
      if (key === "") continue;
      const owners = byKey.get(key) ?? new Set();
      owners.add(brand.name);
      byKey.set(key, owners);
    }
  }
  return [...byKey.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([key, owners]) => ({ key, names: [...owners].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
