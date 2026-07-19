import { z } from "zod";
import { normalizePhrase } from "./intake";
import { resolveBrandTerms } from "./brand-matching";

// Extraction domain (PRD 8.8, DEVELOPMENT_GUIDELINES E1). Pure module — no
// project-layer imports (C-7). Canonical value-set literal unions mirror
// the DB enums in src/db/schema/enums.ts; core cannot import that layer,
// so they're duplicated locally, same pattern as Intent/GenerationMode.

export const EVIDENCE_QUOTE_MAX_LENGTH = 240;

const recommendationStrengthSchema = z.enum(["strong", "soft", "neutral", "discouraged"]);
const sentimentSchema = z.enum(["positive", "neutral", "mixed", "negative"]);
const claimTypeSchema = z.enum([
  "pricing",
  "feature",
  "company_fact",
  "security",
  "availability",
  "other",
]);
const claimVerdictSchema = z.enum([
  "supported",
  "contradicted",
  "outdated",
  "unsupported",
  "ambiguous",
  "not_checked",
]);
const claimSeveritySchema = z.enum(["none", "low", "medium", "high"]);

const evidenceQuote = z.string().max(EVIDENCE_QUOTE_MAX_LENGTH);

export const extractedBrandSchema = z.object({
  canonical_brand_id: z.string().nullable(),
  observed_name: z.string().min(1),
  aliases_matched: z.array(z.string()),
  mentioned: z.boolean(),
  position: z.number().int().positive().nullable(),
  recommended: z.boolean(),
  recommendation_strength: recommendationStrengthSchema,
  sentiment: sentimentSchema,
  attributes: z.array(z.string()),
  evidence_quote: evidenceQuote,
});

export const extractedCitationSchema = z.object({
  url: z.string(),
  domain: z.string(),
  title: z.string().nullable(),
  cited_for_brand_ids: z.array(z.string()),
});

export const extractedClaimSchema = z.object({
  brand_id: z.string().nullable(),
  claim_text: z.string().min(1),
  claim_type: claimTypeSchema,
  matched_fact_claim_id: z.string().nullable(),
  verdict: claimVerdictSchema,
  severity: claimSeveritySchema,
  evidence_quote: evidenceQuote,
});

export const extractedResponseSchema = z.object({
  schema_version: z.literal(1),
  answer_summary: z.string(),
  brands: z.array(extractedBrandSchema),
  citations: z.array(extractedCitationSchema),
  claims: z.array(extractedClaimSchema),
  refusal: z.boolean(),
  malformed: z.boolean(),
});

export type ExtractedBrand = z.infer<typeof extractedBrandSchema>;
export type ExtractedResponse = z.infer<typeof extractedResponseSchema>;

export function validateExtraction(
  payload: unknown,
): { ok: true; data: ExtractedResponse } | { ok: false; error: string } {
  const result = extractedResponseSchema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

export interface TrackedBrand {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * SM-4: deterministic alias normalization, done by our code rather than
 * trusted from the extraction engine's own canonical_brand_id guess.
 */
export function resolveBrandId(observedName: string, brands: TrackedBrand[]): string | null {
  // M45 / D-115: exact-normalized equality, then compact-key equality, then
  // unique tokenized containment — deterministic and fail-closed throughout
  // (see brand-matching.ts). "Insta360" now resolves to "Insta 360" without
  // an operator-provided alias; "Insta360 vs GoPro" stays unresolved.
  return resolveBrandTerms(observedName, brands);
}

const RECOMMENDATION_RANK: Record<ExtractedBrand["recommendation_strength"], number> = {
  strong: 3,
  soft: 2,
  neutral: 1,
  discouraged: 0,
};

/**
 * SM-4-style resolution for attributes: map each extracted attribute phrase to
 * the CANONICAL desired-attribute name whose normalized form it matches, and
 * drop anything that matches nothing. Metrics exact-match brands[].attributes
 * against the canonical list, so this corrects case/whitespace drift a live
 * extractor may introduce and discards free-form noise (audit finding).
 * Matching is normalized-EXACT (not substring), so short names like "AI" or
 * "POS" can never be captured by an unrelated longer phrase.
 */
export function mapAttributesToCanonical(observed: string[], desired: string[]): string[] {
  const canonicalByNorm = new Map(desired.map((d) => [normalizePhrase(d), d]));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const attr of observed) {
    const canonical = canonicalByNorm.get(normalizePhrase(attr));
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

/**
 * Guidelines E1: duplicate observed mentions of the same canonical brand
 * collapse into one record using the earliest position and strongest
 * recommendation. Brands with no canonical match (canonical_brand_id null)
 * are kept as separate, unresolved records — they aren't the "same" brand.
 */
export function collapseDuplicateBrandMentions(brands: ExtractedBrand[]): ExtractedBrand[] {
  const byBrandId = new Map<string, ExtractedBrand>();
  const unresolved: ExtractedBrand[] = [];

  for (const brand of brands) {
    if (!brand.canonical_brand_id) {
      unresolved.push(brand);
      continue;
    }
    const existing = byBrandId.get(brand.canonical_brand_id);
    if (!existing) {
      byBrandId.set(brand.canonical_brand_id, brand);
      continue;
    }
    const earliestPosition =
      existing.position === null
        ? brand.position
        : brand.position === null
          ? existing.position
          : Math.min(existing.position, brand.position);
    const strongest =
      RECOMMENDATION_RANK[brand.recommendation_strength] >
      RECOMMENDATION_RANK[existing.recommendation_strength]
        ? brand
        : existing;
    byBrandId.set(brand.canonical_brand_id, {
      ...strongest,
      position: earliestPosition,
      recommended: existing.recommended || brand.recommended,
      attributes: [...new Set([...existing.attributes, ...brand.attributes])],
    });
  }

  return [...byBrandId.values(), ...unresolved];
}

/** MT-7: top-5 by position (nulls last, stable order) — the set Jaccard operates on. */
export function topTrackedBrandSet(brands: ExtractedBrand[], limit = 5): Set<string> {
  const resolved = brands.filter((b) => b.canonical_brand_id !== null && b.mentioned);
  const sorted = [...resolved].sort((a, b) => {
    if (a.position === null && b.position === null) return 0;
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  });
  return new Set(sorted.slice(0, limit).map((b) => b.canonical_brand_id as string));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 1 : intersection / union;
}

/** MT-7: mean pairwise Jaccard of top-5 tracked-brand sets across reps in the same cell + engine-mode. */
export function stabilityIndex(brandSets: Set<string>[]): number {
  if (brandSets.length < 2) return 1;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < brandSets.length; i++) {
    for (let j = i + 1; j < brandSets.length; j++) {
      total += jaccardSimilarity(brandSets[i], brandSets[j]);
      pairs++;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}
