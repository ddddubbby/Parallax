import { describe, expect, it } from "vitest";
import { wilsonInterval } from "./wilson";

describe("wilsonInterval", () => {
  it("returns 0 with no samples", () => {
    expect(wilsonInterval(0, 0)).toEqual({ value: 0, ciLow: 0, ciHigh: 0 });
  });

  it("matches known reference values (n=100, p=0.5, 95%)", () => {
    const result = wilsonInterval(50, 100);
    expect(result.value).toBeCloseTo(0.5, 6);
    // Reference Wilson 95% CI for 50/100 is approximately [0.404, 0.596].
    expect(result.ciLow).toBeCloseTo(0.404, 2);
    expect(result.ciHigh).toBeCloseTo(0.596, 2);
  });

  it("narrows as n grows for the same proportion", () => {
    const small = wilsonInterval(5, 10);
    const large = wilsonInterval(500, 1000);
    expect(large.ciHigh - large.ciLow).toBeLessThan(small.ciHigh - small.ciLow);
  });

  it("stays within [0, 1] at the extremes", () => {
    const allSuccess = wilsonInterval(30, 30);
    expect(allSuccess.ciHigh).toBeLessThanOrEqual(1);
    expect(allSuccess.ciLow).toBeGreaterThan(0); // Wilson never collapses to exactly the point at p=1

    const allFailure = wilsonInterval(0, 30);
    expect(allFailure.ciLow).toBeGreaterThanOrEqual(0);
    expect(allFailure.ciHigh).toBeLessThan(1);
  });

  it("is asymmetric (Wilson's defining property vs. a naive normal interval)", () => {
    const result = wilsonInterval(29, 30); // p=0.967, near the boundary
    const distanceBelow = result.value - result.ciLow;
    const distanceAbove = result.ciHigh - result.value;
    expect(distanceBelow).not.toBeCloseTo(distanceAbove, 2);
  });
});
