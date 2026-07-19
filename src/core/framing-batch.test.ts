import { describe, expect, it } from "vitest";
import {
  estimateFramingBatchRemainingSeconds,
  formatApproxRemaining,
  isFramingBatchActive,
  isFramingBatchTerminal,
} from "./framing-batch";

describe("framing-batch helpers (M46/D-117)", () => {
  it("classifies active vs terminal states", () => {
    expect(isFramingBatchActive("queued")).toBe(true);
    expect(isFramingBatchActive("paused")).toBe(true);
    expect(isFramingBatchTerminal("completed")).toBe(true);
    expect(isFramingBatchTerminal("partial")).toBe(true);
    expect(isFramingBatchTerminal("running")).toBe(false);
  });

  it("formats approximate remaining without second-by-second copy", () => {
    expect(formatApproxRemaining(null)).toBeNull();
    expect(formatApproxRemaining(30)).toBe("About a minute remaining");
    expect(formatApproxRemaining(90)).toBe("About 2 min remaining");
    expect(formatApproxRemaining(60)).toBe("About 1 min remaining");
  });

  it("suppresses ETA when paused, offline, or sparse", () => {
    const startedAt = new Date(Date.now() - 20_000);
    expect(
      estimateFramingBatchRemainingSeconds({
        state: "paused",
        workerOffline: false,
        processedCount: 5,
        totalCount: 10,
        startedAt,
      }),
    ).toBeNull();
    expect(
      estimateFramingBatchRemainingSeconds({
        state: "running",
        workerOffline: true,
        processedCount: 5,
        totalCount: 10,
        startedAt,
      }),
    ).toBeNull();
    expect(
      estimateFramingBatchRemainingSeconds({
        state: "running",
        workerOffline: false,
        processedCount: 1,
        totalCount: 10,
        startedAt,
      }),
    ).toBeNull();
  });

  it("estimates remaining from elapsed / processed", () => {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 10_000);
    const seconds = estimateFramingBatchRemainingSeconds({
      state: "running",
      workerOffline: false,
      processedCount: 2,
      totalCount: 4,
      startedAt,
      now,
    });
    expect(seconds).toBe(10); // 2 remaining * (10s / 2 processed)
  });
});
