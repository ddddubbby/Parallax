import { describe, expect, it } from "vitest";
import { formatCI, formatGatedMetricDisplay, formatMetricValue } from "./format";

const base = {
  id: "m1",
  scopeType: "overall",
  scopeKey: "overall",
  metricKey: "mention_rate",
  n: 30,
  value: 0.42,
  ciLow: 0.31,
  ciHigh: 0.54,
};

describe("formatGatedMetricDisplay", () => {
  it("hides point estimate and CI below n=30", () => {
    const display = formatGatedMetricDisplay({ ...base, n: 29 });
    expect(display).toEqual({ kind: "insufficient", n: 29 });
  });

  it("shows value and CI at the n=30 gate", () => {
    const display = formatGatedMetricDisplay(base);
    expect(display).toEqual({
      kind: "value",
      n: 30,
      value: "42.0%",
      ci: "[31–54%]",
    });
  });

  it("omits CI text when bounds are null (D-023 point estimates)", () => {
    const display = formatGatedMetricDisplay({
      ...base,
      metricKey: "share_of_voice",
      ciLow: null,
      ciHigh: null,
    });
    expect(display).toEqual({
      kind: "value",
      n: 30,
      value: "42.0%",
      ci: null,
    });
  });
});

describe("formatMetricValue / formatCI", () => {
  it("formats rates as percents and stability as a fixed point", () => {
    expect(formatMetricValue(base)).toBe("42.0%");
    expect(formatMetricValue({ ...base, metricKey: "stability_index", value: 0.75 })).toBe("0.75");
    expect(formatCI(base)).toBe("[31–54%]");
    expect(formatCI({ ...base, ciLow: null, ciHigh: null })).toBeNull();
  });
});
