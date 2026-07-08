import { describe, expect, it } from "vitest";
import exampleFixture from "../../fixtures/calibration/example-paired.json";
import { computeCalibrationSummary, type PairedStimulusPmf } from "./calibration";

describe("calibration comparison harness (M26, D-082)", () => {
  it("scores a perfect match as zero error/distance and r=1", () => {
    // Stimulus A: mean = 1*0.6 + 2*0.2 + 3*0.1 + 4*0.1 + 5*0 = 1.7
    // Stimulus B: mean = 3*0.1 + 4*0.3 + 5*0.6            = 4.5
    // Human and SSR PMFs are IDENTICAL for both stimuli, so every
    // per-stimulus error/distance is exactly 0, and two points with
    // matching (x, y) pairs always yield a Pearson r of exactly 1
    // (nonzero variance on both sides, since 1.7 != 4.5).
    const pairs: PairedStimulusPmf[] = [
      { stimulusId: "a", humanPmf: [0.6, 0.2, 0.1, 0.1, 0], ssrPmf: [0.6, 0.2, 0.1, 0.1, 0] },
      { stimulusId: "b", humanPmf: [0, 0, 0.1, 0.3, 0.6], ssrPmf: [0, 0, 0.1, 0.3, 0.6] },
    ];

    const result = computeCalibrationSummary(pairs);

    expect(result.n).toBe(2);
    expect(result.perStimulus[0].humanMean).toBeCloseTo(1.7, 10);
    expect(result.perStimulus[0].ssrMean).toBeCloseTo(1.7, 10);
    expect(result.perStimulus[1].humanMean).toBeCloseTo(4.5, 10);
    expect(result.perStimulus[1].ssrMean).toBeCloseTo(4.5, 10);
    for (const s of result.perStimulus) {
      expect(s.absoluteError).toBeCloseTo(0, 10);
      expect(s.wasserstein1).toBeCloseTo(0, 10);
    }
    expect(result.meanAbsoluteError).toBeCloseTo(0, 10);
    expect(result.meanWasserstein1).toBeCloseTo(0, 10);
    expect(result.pearsonR).not.toBeNull();
    expect(result.pearsonR as number).toBeCloseTo(1, 10);
  });

  it("scores a deliberately shifted case against hand-verified numbers", () => {
    // Stimulus A: human all-mass-at-1 (mean=1), SSR all-mass-at-2 (mean=2).
    //   CDF(human) at k=1..4: [1,1,1,1]; CDF(ssr) at k=1..4: [0,1,1,1].
    //   Wasserstein-1 = |1-0| + |1-1| + |1-1| + |1-1| = 1. |error| = 1.
    // Stimulus B: human all-mass-at-3 (mean=3), SSR all-mass-at-5 (mean=5).
    //   CDF(human): [0,0,1,1]; CDF(ssr): [0,0,0,0].
    //   Wasserstein-1 = 0+0+1+1 = 2. |error| = 2.
    // Stimulus C: human and SSR both all-mass-at-4 (mean=4, exact match).
    //   Wasserstein-1 = 0. |error| = 0.
    const pairs: PairedStimulusPmf[] = [
      { stimulusId: "a", humanPmf: [1, 0, 0, 0, 0], ssrPmf: [0, 1, 0, 0, 0] },
      { stimulusId: "b", humanPmf: [0, 0, 1, 0, 0], ssrPmf: [0, 0, 0, 0, 1] },
      { stimulusId: "c", humanPmf: [0, 0, 0, 1, 0], ssrPmf: [0, 0, 0, 1, 0] },
    ];

    const result = computeCalibrationSummary(pairs);

    expect(result.n).toBe(3);
    expect(result.perStimulus.map((s) => s.absoluteError)).toEqual([1, 2, 0]);
    expect(result.perStimulus.map((s) => s.wasserstein1)).toEqual([1, 2, 0]);
    // meanAbsoluteError = (1+2+0)/3, meanWasserstein1 = (1+2+0)/3
    expect(result.meanAbsoluteError).toBeCloseTo(1, 10);
    expect(result.meanWasserstein1).toBeCloseTo(1, 10);

    // Pearson r over human means x=[1,3,4] vs SSR means y=[2,5,4]:
    //   xbar=8/3, ybar=11/3
    //   dx=[-5/3, 1/3, 4/3], dy=[-5/3, 4/3, 1/3]
    //   sum(dx*dy) = 25/9 + 4/9 + 4/9 = 33/9 = 11/3
    //   sum(dx^2)  = 25/9 + 1/9 + 16/9 = 42/9 = 14/3
    //   sum(dy^2)  = 25/9 + 16/9 + 1/9 = 42/9 = 14/3
    //   r = (11/3) / sqrt((14/3)*(14/3)) = (11/3)/(14/3) = 11/14
    expect(result.pearsonR).not.toBeNull();
    expect(result.pearsonR as number).toBeCloseTo(11 / 14, 10);
  });

  it("returns null correlation (never 0) when one side has zero variance", () => {
    const pairs: PairedStimulusPmf[] = [
      { stimulusId: "a", humanPmf: [0, 1, 0, 0, 0], ssrPmf: [0, 0, 1, 0, 0] },
      { stimulusId: "b", humanPmf: [0, 0, 0, 1, 0], ssrPmf: [0, 0, 1, 0, 0] },
    ];
    // SSR mean is 3 for both stimuli -> zero SSR-side variance.
    const result = computeCalibrationSummary(pairs);
    expect(result.pearsonR).toBeNull();
  });

  it("rejects fewer than 2 paired stimuli", () => {
    expect(() =>
      computeCalibrationSummary([{ stimulusId: "only", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] }]),
    ).toThrow(/at least 2/i);
    expect(() => computeCalibrationSummary([])).toThrow(/at least 2/i);
  });

  it("rejects a PMF with the wrong length", () => {
    expect(() =>
      computeCalibrationSummary([
        { stimulusId: "a", humanPmf: [0.5, 0.5], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
        { stimulusId: "b", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
      ]),
    ).toThrow(/exactly 5 entries/i);
  });

  it("rejects a PMF that does not sum to ~1", () => {
    expect(() =>
      computeCalibrationSummary([
        { stimulusId: "a", humanPmf: [0.5, 0.5, 0.5, 0, 0], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
        { stimulusId: "b", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
      ]),
    ).toThrow(/must sum to ~1/i);
  });

  it("rejects negative or non-finite PMF entries", () => {
    expect(() =>
      computeCalibrationSummary([
        { stimulusId: "a", humanPmf: [1.2, -0.2, 0, 0, 0], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
        { stimulusId: "b", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
      ]),
    ).toThrow(/non-negative finite/i);
  });

  it("rejects a duplicate stimulusId", () => {
    expect(() =>
      computeCalibrationSummary([
        { stimulusId: "dup", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
        { stimulusId: "dup", humanPmf: [0.2, 0.2, 0.2, 0.2, 0.2], ssrPmf: [0.2, 0.2, 0.2, 0.2, 0.2] },
      ]),
    ).toThrow(/duplicate stimulusid/i);
  });
});

describe("fixtures/calibration/example-paired.json (living format spec)", () => {
  // This fixture is the paired-data format CALIBRATION_PROTOCOL.md documents
  // — the test both proves the harness accepts the documented shape and
  // guards against the file ever being swapped for something that reads as
  // real human data (D-082: no real data ships in this sprint).
  it("is clearly marked synthetic and never flips calibrated on its own", () => {
    expect(exampleFixture.note.toLowerCase()).toContain("synthetic");
    expect(exampleFixture.note.toLowerCase()).toContain("not real");
    expect(exampleFixture).not.toHaveProperty("calibrated");
  });

  it("matches the paired-data format the harness expects", () => {
    const pairs: PairedStimulusPmf[] = exampleFixture.pairs.map((pair) => ({
      stimulusId: pair.stimulusId,
      humanPmf: pair.humanPmf,
      ssrPmf: pair.ssrPmf,
    }));

    const result = computeCalibrationSummary(pairs);

    expect(result.n).toBe(exampleFixture.pairs.length);
    expect(result.n).toBeGreaterThanOrEqual(2);
    for (const s of result.perStimulus) {
      expect(s.humanMean).toBeGreaterThan(0);
      expect(s.ssrMean).toBeGreaterThan(0);
      expect(s.absoluteError).toBeGreaterThanOrEqual(0);
      expect(s.wasserstein1).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isFinite(result.meanAbsoluteError)).toBe(true);
    expect(Number.isFinite(result.meanWasserstein1)).toBe(true);
  });
});
