import { describe, expect, it } from "vitest";
import {
  computeRunForecast,
  formatRunForecastRange,
  remainingRangeSeconds,
  RUN_FORECAST_MIN_COMPLETIONS,
  RUN_FORECAST_RECENT_LIMIT,
  RUN_FORECAST_STALE_MULTIPLIER,
  windowCadencesMs,
} from "./run-forecast";

const T0 = Date.parse("2026-07-31T00:00:00.000Z");

/** Completion timestamps spaced by the given intervals (seconds). */
function stamps(intervalsSec: number[], startMs = T0): Date[] {
  const out = [new Date(startMs)];
  for (const interval of intervalsSec) {
    out.push(new Date(out[out.length - 1]!.getTime() + interval * 1000));
  }
  return out;
}

function lastPlus(stampsList: Date[], seconds: number): Date {
  return new Date(stampsList[stampsList.length - 1]!.getTime() + seconds * 1000);
}

describe("run-forecast window cadences (M50/D-120)", () => {
  it("reproduces a steady serial pace exactly (span ÷ 4 gaps)", () => {
    const cadences = windowCadencesMs(stamps([30, 30, 30, 30, 30, 30]));
    expect(cadences).toEqual([30_000, 30_000, 30_000]);
  });

  it("handles unsorted input and only reads the latest 20 completions", () => {
    const fast = stamps(Array(19).fill(30) as number[]); // 20 completions, 30s steady
    const slowPrefix = stamps([600, 600, 600, 600, 600], T0 - 10_000_000);
    const combined = [...fast.reverse(), ...slowPrefix]; // deliberately unsorted
    const cadences = windowCadencesMs(combined);
    expect(combined.length).toBeGreaterThan(RUN_FORECAST_RECENT_LIMIT);
    expect(cadences.length).toBe(RUN_FORECAST_RECENT_LIMIT - 4);
    expect(cadences.every((c) => c === 30_000)).toBe(true);
  });

  it("treats concurrent bursts as genuinely instant, never NaN", () => {
    const burst = new Date(T0);
    const cadences = windowCadencesMs([burst, burst, burst, burst, burst]);
    expect(cadences).toEqual([0]);
  });
});

describe("run-forecast p10–p90 range", () => {
  it("is null with no windows or nothing remaining", () => {
    expect(remainingRangeSeconds([], 5)).toBeNull();
    expect(remainingRangeSeconds([30_000], 0)).toBeNull();
  });

  it("uses nearest-conservative-rank indices (W=16 → 2nd smallest / 2nd largest)", () => {
    const cadences = Array.from({ length: 16 }, (_, i) => (i + 1) * 10_000);
    expect(remainingRangeSeconds(cadences, 6)).toEqual({
      lowSeconds: 120,
      highSeconds: 900,
    });
  });

  it("collapses to min/max on the smallest sample (exactly 10 completions → 6 windows)", () => {
    const cadences = [48_000, 57_000, 66_000, 75_000, 79_500, 84_000];
    expect(remainingRangeSeconds(cadences, 10)).toEqual({
      lowSeconds: 480,
      highSeconds: 840,
    });
  });
});

describe("run-forecast states (M50/D-120)", () => {
  const twentySteady = stamps(Array(19).fill(60) as number[]);

  it("suppresses paused, offline, terminal, and zero-remaining runs", () => {
    const base = { remainingCount: 10, completionTimestamps: twentySteady, now: lastPlus(twentySteady, 5) };
    expect(computeRunForecast({ ...base, runState: "paused", workerOffline: false }))
      .toEqual({ state: "paused", range: null });
    expect(computeRunForecast({ ...base, runState: "running", workerOffline: true }))
      .toEqual({ state: "offline", range: null });
    expect(computeRunForecast({ ...base, runState: "completed", workerOffline: false }))
      .toEqual({ state: "terminal", range: null });
    expect(computeRunForecast({ ...base, remainingCount: 0, runState: "running", workerOffline: false }))
      .toEqual({ state: "complete", range: null });
  });

  it("calibrates below 10 terminal completions — never forecasts", () => {
    const nine = stamps(Array(8).fill(30) as number[]);
    const forecast = computeRunForecast({
      remainingCount: 31,
      completionTimestamps: nine,
      runState: "running",
      workerOffline: false,
      now: lastPlus(nine, 1),
    });
    expect(forecast).toEqual({ state: "calibrating", range: null });
    expect(nine.length).toBe(RUN_FORECAST_MIN_COMPLETIONS - 1);

    const empty = computeRunForecast({
      remainingCount: 40,
      completionTimestamps: [],
      runState: "queued",
      workerOffline: false,
      now: new Date(T0),
    });
    expect(empty.state).toBe("calibrating");
  });

  it("turns ready exactly at 10 terminal completions, range ordered", () => {
    // Hand-computed: cadences [48,57,66,75,79.5,84]s → p10/p90 = 48s/84s.
    const ten = stamps([48, 48, 48, 48, 84, 84, 84, 84, 66]);
    expect(ten.length).toBe(RUN_FORECAST_MIN_COMPLETIONS);
    const forecast = computeRunForecast({
      remainingCount: 10,
      completionTimestamps: ten,
      runState: "running",
      workerOffline: false,
      now: lastPlus(ten, 1),
    });
    expect(forecast.state).toBe("ready");
    expect(forecast.range).toEqual({ lowSeconds: 480, highSeconds: 840 });
    expect(forecast.range!.lowSeconds).toBeLessThanOrEqual(forecast.range!.highSeconds);
  });

  it("handles concurrent completion bursts without NaN or inverted ranges", () => {
    const at = (s: number) => new Date(T0 + s * 1000);
    const bursted = [0, 0, 0, 0, 0, 300, 300, 300, 300, 300, 600, 600, 600, 600, 600, 900, 900, 900, 900, 900].map(at);
    const forecast = computeRunForecast({
      remainingCount: 4,
      completionTimestamps: bursted,
      runState: "running",
      workerOffline: false,
      now: at(901),
    });
    expect(forecast.state).toBe("ready");
    expect(Number.isFinite(forecast.range!.lowSeconds)).toBe(true);
    expect(Number.isFinite(forecast.range!.highSeconds)).toBe(true);
    expect(forecast.range!.lowSeconds).toBeLessThanOrEqual(forecast.range!.highSeconds);
    // Hand-computed: first and last windows sit inside a burst (cadence 0),
    // the other 14 span exactly one 300s hop (cadence 75s) → p10=0, p90=75s.
    expect(forecast.range).toEqual({ lowSeconds: 0, highSeconds: 300 });
  });

  it("widens the range when slow calls land mid-run", () => {
    const steady = stamps(Array(19).fill(30) as number[]);
    const withSlow = stamps([
      ...Array(9).fill(30),
      600, // one ten-minute call
      ...Array(9).fill(30),
    ] as number[]);
    const base = {
      remainingCount: 10,
      runState: "running",
      workerOffline: false,
    };
    const a = computeRunForecast({ ...base, completionTimestamps: steady, now: lastPlus(steady, 1) });
    const b = computeRunForecast({ ...base, completionTimestamps: withSlow, now: lastPlus(withSlow, 1) });
    expect(a.range).toEqual({ lowSeconds: 300, highSeconds: 300 });
    // Hand-computed: four windows span the 600s call → cadence 172.5s;
    // W=16 → high idx 14 → 172.5s → 1725s for 10 remaining.
    expect(b.range).toEqual({ lowSeconds: 300, highSeconds: 1725 });
    expect(b.range!.highSeconds).toBeGreaterThan(a.range!.highSeconds);
  });

  it("recalibrates when no completion arrives for more than 3× the slow-end cadence", () => {
    const ten = stamps(Array(9).fill(60) as number[]); // slowest cadence 60s
    const threshold = RUN_FORECAST_STALE_MULTIPLIER * 60;
    const atBoundary = computeRunForecast({
      remainingCount: 30,
      completionTimestamps: ten,
      runState: "running",
      workerOffline: false,
      now: lastPlus(ten, threshold),
    });
    expect(atBoundary.state).toBe("ready"); // strictly greater-than, not ≥

    const stale = computeRunForecast({
      remainingCount: 30,
      completionTimestamps: ten,
      runState: "running",
      workerOffline: false,
      now: lastPlus(ten, threshold + 1),
    });
    expect(stale).toEqual({ state: "recalibrating", range: null });
  });

  it("stays calibrating (not recalibrating) when pace goes quiet below 10 completions", () => {
    const five = stamps([30, 30, 30, 30]);
    const forecast = computeRunForecast({
      remainingCount: 35,
      completionTimestamps: five,
      runState: "running",
      workerOffline: false,
      now: lastPlus(five, 3600),
    });
    expect(forecast.state).toBe("calibrating");
  });

  it("returns to ready when completions resume after a stale stretch", () => {
    const resumed = stamps([...Array(9).fill(60), 3600, 60, 60, 60, 60] as number[]);
    const forecast = computeRunForecast({
      remainingCount: 26,
      completionTimestamps: resumed,
      runState: "running",
      workerOffline: false,
      now: lastPlus(resumed, 5),
    });
    expect(forecast.state).toBe("ready");
    // The 1h gap sits inside recent windows and honestly widens the range.
    expect(forecast.range!.highSeconds).toBeGreaterThan(forecast.range!.lowSeconds);
  });
});

describe("run-forecast ready copy (M50/D-120)", () => {
  it("renders exactly `Estimated 8–14 min remaining` — no basis or sample copy", () => {
    expect(formatRunForecastRange({ lowSeconds: 480, highSeconds: 840 })).toBe(
      "Estimated 8–14 min remaining",
    );
  });

  it("collapses equal ends and clamps sub-minute to one minute", () => {
    expect(formatRunForecastRange({ lowSeconds: 300, highSeconds: 300 })).toBe(
      "Estimated 5 min remaining",
    );
    expect(formatRunForecastRange({ lowSeconds: 0, highSeconds: 0 })).toBe(
      "Estimated 1 min remaining",
    );
    expect(formatRunForecastRange({ lowSeconds: 61, highSeconds: 119 })).toBe(
      "Estimated 1–2 min remaining",
    );
  });

  it("rounds the low end down and the high end up (conservative display)", () => {
    expect(formatRunForecastRange({ lowSeconds: 3599, highSeconds: 3601 })).toBe(
      "Estimated 59–61 min remaining",
    );
  });

  it("renders nothing for null or invalid ranges", () => {
    expect(formatRunForecastRange(null)).toBeNull();
    expect(formatRunForecastRange({ lowSeconds: Number.NaN, highSeconds: 60 })).toBeNull();
    expect(formatRunForecastRange({ lowSeconds: -5, highSeconds: 60 })).toBeNull();
  });
});
