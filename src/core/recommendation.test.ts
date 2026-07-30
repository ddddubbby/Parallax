import { describe, expect, it } from "vitest";
import { parseRecommendationExtraction } from "./recommendation";

const brands = [
  { id: "client", name: "LedgerFox", aliases: ["Ledger Fox"] },
  { id: "rival", name: "SpendPilot", aliases: ["Spend Pilot"] },
];

function payload(rows: Array<{ rank: number; brand: string }>) {
  return JSON.stringify({
    recommendations: rows.map((row) => ({
      ...row,
      product: null,
      reason: "Relevant to the shopping request.",
    })),
  });
}

describe("deterministic recommendation extraction", () => {
  it("resolves exact aliases and records target rank", () => {
    const result = parseRecommendationExtraction({
      rawText: payload([
        { rank: 1, brand: "Spend Pilot" },
        { rank: 2, brand: "Ledger Fox" },
        { rank: 3, brand: "Northstar" },
        { rank: 4, brand: "Clearbooks" },
        { rank: 5, brand: "Opal" },
      ]),
      trackedBrands: brands,
      clientBrandId: "client",
    });
    expect(result).toMatchObject({
      schemaVersion: "recommendation-v1",
      targetIncluded: true,
      targetRank: 2,
      targetTopPick: false,
    });
  });

  it.each([
    ["malformed JSON", "not json"],
    [
      "duplicate rank",
      payload([
        { rank: 1, brand: "A" },
        { rank: 1, brand: "B" },
        { rank: 3, brand: "C" },
        { rank: 4, brand: "D" },
        { rank: 5, brand: "E" },
      ]),
    ],
    [
      "duplicate brand",
      payload([
        { rank: 1, brand: "A" },
        { rank: 2, brand: "A" },
        { rank: 3, brand: "C" },
        { rank: 4, brand: "D" },
        { rank: 5, brand: "E" },
      ]),
    ],
    [
      "missing rank",
      payload([
        { rank: 1, brand: "A" },
        { rank: 2, brand: "B" },
        { rank: 3, brand: "C" },
        { rank: 4, brand: "D" },
      ]),
    ],
  ])("rejects %s deterministically", (_label, rawText) => {
    expect(() =>
      parseRecommendationExtraction({
        rawText,
        trackedBrands: brands,
        clientBrandId: "client",
      }),
    ).toThrow();
  });

  it("keeps an untracked hallucinated brand without fuzzy-matching it to the target", () => {
    const result = parseRecommendationExtraction({
      rawText: payload([
        { rank: 1, brand: "LedgerFaux" },
        { rank: 2, brand: "A" },
        { rank: 3, brand: "B" },
        { rank: 4, brand: "C" },
        { rank: 5, brand: "D" },
      ]),
      trackedBrands: brands,
      clientBrandId: "client",
    });
    expect(result.targetIncluded).toBe(false);
    expect(result.targetRank).toBeNull();
  });
});
