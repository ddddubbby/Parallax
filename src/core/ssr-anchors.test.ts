import { describe, expect, it } from "vitest";
import { getSsrAnchorSet, listSsrAnchorSets } from "./ssr-anchors";

describe("SSR anchor sets (M17)", () => {
  it("ships purchase_intent.v1 as an explicitly uncalibrated fixture", () => {
    const set = getSsrAnchorSet("purchase_intent.v1");
    expect(set.construct).toBe("purchase_intent");
    expect(set.calibrated).toBe(false);
  });

  it("keeps at least four sets with exactly five sentences per set", () => {
    for (const set of listSsrAnchorSets()) {
      expect(set.sets.length).toBeGreaterThanOrEqual(4);
      for (const sentenceSet of set.sets) {
        expect(sentenceSet.sentences).toHaveLength(5);
      }
    }
  });

  it("rejects unknown anchor versions", () => {
    expect(() => getSsrAnchorSet("purchase_intent.v9")).toThrow(/Unknown SSR anchor set/);
  });
});
