import { describe, expect, it } from "vitest";
import {
  collapseDuplicateBrandMentions,
  type ExtractedBrand,
  jaccardSimilarity,
  resolveBrandId,
  stabilityIndex,
  topTrackedBrandSet,
  validateExtraction,
} from "./extraction";

function brand(overrides: Partial<ExtractedBrand> = {}): ExtractedBrand {
  return {
    canonical_brand_id: null,
    observed_name: "LedgerFox",
    aliases_matched: [],
    mentioned: true,
    position: null,
    recommended: false,
    recommendation_strength: "neutral",
    sentiment: "neutral",
    attributes: [],
    evidence_quote: "quote",
    ...overrides,
  };
}

const VALID_PAYLOAD = {
  schema_version: 1,
  answer_summary: "summary",
  brands: [],
  citations: [],
  claims: [],
  refusal: false,
  malformed: false,
};

describe("validateExtraction (SM-1)", () => {
  it("accepts a well-formed payload", () => {
    const result = validateExtraction(VALID_PAYLOAD);
    expect(result.ok).toBe(true);
  });

  it("accepts empty arrays for brands/citations/claims (E1)", () => {
    expect(validateExtraction(VALID_PAYLOAD).ok).toBe(true);
  });

  it("rejects an evidence quote over 240 characters", () => {
    const payload = {
      ...VALID_PAYLOAD,
      brands: [brand({ evidence_quote: "x".repeat(241) })],
    };
    expect(validateExtraction(payload).ok).toBe(false);
  });

  it("rejects a missing schema_version", () => {
    const rest: Record<string, unknown> = { ...VALID_PAYLOAD };
    delete rest.schema_version;
    expect(validateExtraction(rest).ok).toBe(false);
  });

  it("rejects unranked position of 0 or negative (must be null or positive)", () => {
    const payload = { ...VALID_PAYLOAD, brands: [brand({ position: 0 })] };
    expect(validateExtraction(payload).ok).toBe(false);
  });
});

describe("resolveBrandId (SM-4)", () => {
  const brands = [
    { id: "client-1", name: "LedgerFox", aliases: ["Ledger Fox", "ledgerfox.io"] },
    { id: "comp-1", name: "SpendPilot", aliases: ["Spend Pilot"] },
  ];

  it("matches by exact name", () => {
    expect(resolveBrandId("LedgerFox", brands)).toBe("client-1");
  });

  it("matches by alias, case/space-insensitive", () => {
    expect(resolveBrandId("ledger  fox", brands)).toBe("client-1");
    expect(resolveBrandId("Spend Pilot", brands)).toBe("comp-1");
  });

  it("returns null for an unrecognized brand", () => {
    expect(resolveBrandId("Some Other Vendor", brands)).toBeNull();
  });
});

describe("collapseDuplicateBrandMentions (guidelines E1)", () => {
  it("merges duplicates of the same canonical brand using earliest position and strongest recommendation", () => {
    const brands: ExtractedBrand[] = [
      brand({ canonical_brand_id: "b1", position: 3, recommendation_strength: "neutral", attributes: ["a"] }),
      brand({ canonical_brand_id: "b1", position: 1, recommendation_strength: "strong", recommended: true, attributes: ["b"] }),
    ];
    const collapsed = collapseDuplicateBrandMentions(brands);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      position: 1,
      recommendation_strength: "strong",
      recommended: true,
    });
    expect(collapsed[0].attributes.sort()).toEqual(["a", "b"]);
  });

  it("keeps unresolved (null canonical_brand_id) brands as separate records", () => {
    const brands: ExtractedBrand[] = [
      brand({ canonical_brand_id: null, observed_name: "Unknown Co" }),
      brand({ canonical_brand_id: null, observed_name: "Another Co" }),
    ];
    expect(collapseDuplicateBrandMentions(brands)).toHaveLength(2);
  });

  it("does not merge different canonical brands", () => {
    const brands: ExtractedBrand[] = [
      brand({ canonical_brand_id: "b1" }),
      brand({ canonical_brand_id: "b2" }),
    ];
    expect(collapseDuplicateBrandMentions(brands)).toHaveLength(2);
  });
});

describe("topTrackedBrandSet / jaccardSimilarity / stabilityIndex (MT-7)", () => {
  it("orders by position, nulls last, capped at 5", () => {
    const brands: ExtractedBrand[] = [
      brand({ canonical_brand_id: "b6", position: null }),
      brand({ canonical_brand_id: "b1", position: 1 }),
      brand({ canonical_brand_id: "b3", position: 3 }),
      brand({ canonical_brand_id: "b2", position: 2 }),
      brand({ canonical_brand_id: "b4", position: 4 }),
      brand({ canonical_brand_id: "b5", position: 5 }),
    ];
    const set = topTrackedBrandSet(brands);
    expect(set.size).toBe(5);
    expect(set.has("b6")).toBe(false); // null position, pushed out by the cap
  });

  it("excludes unresolved and unmentioned brands", () => {
    const brands: ExtractedBrand[] = [
      brand({ canonical_brand_id: null, position: 1 }),
      brand({ canonical_brand_id: "b1", position: 2, mentioned: false }),
      brand({ canonical_brand_id: "b2", position: 3 }),
    ];
    expect(topTrackedBrandSet(brands)).toEqual(new Set(["b2"]));
  });

  it("jaccard of identical sets is 1, disjoint sets is 0", () => {
    expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccardSimilarity(new Set(["a"]), new Set(["b"]))).toBe(0);
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("stability index is the mean pairwise jaccard across reps", () => {
    const reps = [new Set(["a", "b"]), new Set(["a", "b"]), new Set(["a", "c"])];
    // pairs: (1,2)=1, (1,3)=1/3, (2,3)=1/3 -> mean = (1 + 1/3 + 1/3)/3
    expect(stabilityIndex(reps)).toBeCloseTo((1 + 1 / 3 + 1 / 3) / 3, 6);
  });

  it("is 1 with fewer than 2 reps (nothing to compare)", () => {
    expect(stabilityIndex([new Set(["a"])])).toBe(1);
    expect(stabilityIndex([])).toBe(1);
  });
});
