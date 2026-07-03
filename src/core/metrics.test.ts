import { describe, expect, it } from "vitest";
import {
  accuracyRate,
  attributeAssociationRate,
  avgFirstPosition,
  citationShare,
  type EligibleSample,
  mentionRate,
  meanStabilityIndex,
  recommendationRate,
  sentimentDistribution,
  shareOfVoice,
} from "./metrics";

function sample(overrides: Partial<EligibleSample> = {}): EligibleSample {
  return {
    clientMentioned: false,
    clientRecommended: false,
    clientPosition: null,
    trackedMentionCount: 0,
    clientMentionCount: 0,
    ...overrides,
  };
}

describe("mentionRate (MT-1)", () => {
  it("computes the proportion with a Wilson interval", () => {
    const samples = [
      sample({ clientMentioned: true }),
      sample({ clientMentioned: true }),
      sample({ clientMentioned: false }),
      sample({ clientMentioned: false }),
    ];
    const result = mentionRate(samples);
    expect(result.n).toBe(4);
    expect(result.value).toBeCloseTo(0.5, 6);
    expect(result.ciLow).not.toBeNull();
    expect(result.ciHigh).not.toBeNull();
  });

  it("is 0 with no eligible samples", () => {
    expect(mentionRate([])).toEqual({ n: 0, value: 0, ciLow: 0, ciHigh: 0 });
  });
});

describe("recommendationRate (MT-2)", () => {
  it("computes the proportion recommended", () => {
    const samples = [
      sample({ clientRecommended: true }),
      sample({ clientRecommended: false }),
      sample({ clientRecommended: false }),
    ];
    expect(recommendationRate(samples).value).toBeCloseTo(1 / 3, 6);
  });
});

describe("shareOfVoice (MT-3)", () => {
  it("is client mentions over all tracked mentions, no interval (D-023)", () => {
    const samples = [
      sample({ clientMentionCount: 1, trackedMentionCount: 3 }),
      sample({ clientMentionCount: 0, trackedMentionCount: 2 }),
    ];
    const result = shareOfVoice(samples);
    expect(result.value).toBeCloseTo(1 / 5, 6);
    expect(result.ciLow).toBeNull();
    expect(result.ciHigh).toBeNull();
  });

  it("is 0 when there are no tracked mentions at all", () => {
    expect(shareOfVoice([sample()]).value).toBe(0);
  });
});

describe("avgFirstPosition (MT-4)", () => {
  it("excludes samples where the brand is absent from both mean and n", () => {
    const samples = [
      sample({ clientPosition: 1 }),
      sample({ clientPosition: 3 }),
      sample({ clientPosition: null }), // absent — excluded
    ];
    const result = avgFirstPosition(samples);
    expect(result.n).toBe(2);
    expect(result.value).toBeCloseTo(2, 6);
  });

  it("is 0/n=0 when the brand never appears", () => {
    expect(avgFirstPosition([sample({ clientPosition: null })])).toEqual({
      n: 0,
      value: 0,
      ciLow: null,
      ciHigh: null,
    });
  });
});

describe("citationShare (MT-5)", () => {
  it("is client citations over all tracked citations", () => {
    const result = citationShare([
      { clientCitationCount: 2, trackedCitationCount: 5 },
      { clientCitationCount: 1, trackedCitationCount: 3 },
    ]);
    expect(result.value).toBeCloseTo(3 / 8, 6);
    expect(result.ciLow).toBeNull();
  });
});

describe("accuracyRate (MT-6)", () => {
  it("is supported over checked claims (excludes not_checked/ambiguous by construction)", () => {
    const result = accuracyRate(["supported", "supported", "contradicted", "unsupported"]);
    expect(result.value).toBeCloseTo(0.5, 6);
    expect(result.ciLow).not.toBeNull(); // Wilson applies (MT-11)
  });
});

describe("meanStabilityIndex (MT-7 rollup)", () => {
  it("averages per-cell stability values with no interval", () => {
    const result = meanStabilityIndex([1, 0.5, 0.75]);
    expect(result.value).toBeCloseTo(0.75, 6);
    expect(result.ciLow).toBeNull();
  });
});

describe("sentimentDistribution (MT-9)", () => {
  it("sums to 1 across all four labels and is never averaged to a score", () => {
    const dist = sentimentDistribution(["positive", "positive", "neutral", "negative"]);
    const total = Object.values(dist).reduce((sum, m) => sum + m.value, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(dist.positive.value).toBeCloseTo(0.5, 6);
    expect(dist.mixed.value).toBe(0);
  });
});

describe("attributeAssociationRate (MT-10)", () => {
  it("is the share of mentions carrying the given attribute", () => {
    const result = attributeAssociationRate(
      [["easy implementation"], ["mid-market fit"], ["easy implementation", "mid-market fit"]],
      "easy implementation",
    );
    expect(result.value).toBeCloseTo(2 / 3, 6);
  });
});
