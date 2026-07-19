import { describe, expect, it } from "vitest";
import {
  buildEtaIntervalSeries,
  completionTimestampsFromJobs,
  computeStageProgress,
  estimateRunEta,
  ewmaIntervalMs,
  filterOutlierIntervals,
  formatApproxRemaining,
  intervalsFromTimestamps,
  isOverallPipelineComplete,
  isTerminalExtractionState,
  medianOf,
  stageLabels,
  type JobPipelineRow,
} from "./run-progress";

function job(partial: Partial<JobPipelineRow> & { jobId: string; jobState: string }): JobPipelineRow {
  return {
    jobUpdatedAt: new Date("2026-07-19T10:00:00.000Z"),
    hasResponse: false,
    latestExtractionState: null,
    latestExtractionUpdatedAt: null,
    ...partial,
  };
}

describe("run-progress stage counting (M46/D-117)", () => {
  it("uses audit vs Simulation stage labels", () => {
    expect(stageLabels("audit")).toEqual({
      generation: "Generating AI responses",
      secondary: "Extracting evidence",
    });
    expect(stageLabels("resonance")).toEqual({
      generation: "Generating simulated reactions",
      secondary: "Scoring reactions",
    });
  });

  it("counts overall-complete only when latest extraction is terminal", () => {
    const succeededPending = job({
      jobId: "a",
      jobState: "succeeded",
      hasResponse: true,
      latestExtractionState: "pending",
    });
    const succeededValid = job({
      jobId: "b",
      jobState: "succeeded",
      hasResponse: true,
      latestExtractionState: "valid",
      latestExtractionUpdatedAt: new Date("2026-07-19T10:01:00.000Z"),
    });
    expect(isOverallPipelineComplete(succeededPending, { skipsExtraction: false })).toBe(false);
    expect(isOverallPipelineComplete(succeededValid, { skipsExtraction: false })).toBe(true);
    expect(isOverallPipelineComplete(succeededPending, { skipsExtraction: true })).toBe(true);
    expect(isTerminalExtractionState("qa_reviewed")).toBe(true);
  });

  it("counts dead-lettered / cancelled / skipped jobs as overall-complete directly", () => {
    for (const state of ["dead_lettered", "cancelled", "skipped"] as const) {
      expect(
        isOverallPipelineComplete(job({ jobId: state, jobState: state }), {
          skipsExtraction: false,
        }),
      ).toBe(true);
    }
  });

  it("builds generation / secondary / overall lanes and extraction-gap flag", () => {
    const jobs: JobPipelineRow[] = [
      job({
        jobId: "1",
        jobState: "succeeded",
        hasResponse: true,
        latestExtractionState: "valid",
        latestExtractionUpdatedAt: new Date("2026-07-19T10:01:00.000Z"),
      }),
      job({
        jobId: "2",
        jobState: "succeeded",
        hasResponse: true,
        latestExtractionState: "pending",
      }),
      job({ jobId: "3", jobState: "queued" }),
      job({ jobId: "4", jobState: "dead_lettered" }),
    ];
    const mid = computeStageProgress({
      jobs,
      plannedCalls: 4,
      matrixKind: "audit",
      skipsExtraction: false,
      runState: "running",
    });
    expect(mid.generation).toMatchObject({ completed: 3, total: 4, label: "Generating AI responses" });
    expect(mid.secondary).toMatchObject({
      completed: 1,
      total: 2,
      label: "Extracting evidence",
      applicable: true,
    });
    expect(mid.overall).toEqual({ completed: 2, total: 4 }); // valid + dead_lettered
    expect(mid.extractionGap).toBe(false);

    const gap = computeStageProgress({
      jobs,
      plannedCalls: 4,
      matrixKind: "audit",
      skipsExtraction: false,
      runState: "completed",
    });
    expect(gap.extractionGap).toBe(true);
  });

  it("hides secondary lane for crypto no-extraction path", () => {
    const jobs = [
      job({ jobId: "1", jobState: "succeeded", hasResponse: true }),
      job({ jobId: "2", jobState: "queued" }),
    ];
    const progress = computeStageProgress({
      jobs,
      plannedCalls: 2,
      matrixKind: "audit",
      skipsExtraction: true,
      runState: "running",
    });
    expect(progress.secondary.applicable).toBe(false);
    expect(progress.overall.completed).toBe(1);
    expect(progress.extractionGap).toBe(false);
  });
});

describe("run-progress EWMA ETA (M46/D-117)", () => {
  it("formats approximate remaining without second-by-second copy", () => {
    expect(formatApproxRemaining(null)).toBeNull();
    expect(formatApproxRemaining(480)).toBe("About 8 min remaining");
  });

  it("builds intervals from completion timestamps", () => {
    const stamps = [
      new Date("2026-07-19T10:00:00.000Z"),
      new Date("2026-07-19T10:00:10.000Z"),
      new Date("2026-07-19T10:00:25.000Z"),
    ];
    expect(intervalsFromTimestamps(stamps)).toEqual([10_000, 15_000]);
  });

  it("filters outliers above 3× rolling median", () => {
    // median of [1000] = 1000 → 5000 > 3000 → drop; then median still 1000
    expect(filterOutlierIntervals([1000, 5000, 1100])).toEqual([1000, 1100]);
    expect(medianOf([1, 2, 3])).toBe(2);
  });

  it("computes EWMA with α=0.35", () => {
    // v0=1000; v1=0.35*2000+0.65*1000 = 1350
    expect(ewmaIntervalMs([1000, 2000])).toBe(1350);
  });

  it("seeds sparse current intervals from historical series", () => {
    const series = buildEtaIntervalSeries([1000], [2000, 2100, 1900]);
    expect(series.length).toBeGreaterThanOrEqual(2);
    expect(series.at(-1)).toBe(1000);
  });

  it("suppresses ETA when paused, offline, terminal, or insufficient evidence", () => {
    expect(
      estimateRunEta({
        remainingCount: 5,
        currentIntervalsMs: [1000, 1100],
        seedIntervalsMs: [],
        runState: "paused",
        workerOffline: false,
      }).state,
    ).toBe("suppressed_paused");
    expect(
      estimateRunEta({
        remainingCount: 5,
        currentIntervalsMs: [1000, 1100],
        seedIntervalsMs: [],
        runState: "running",
        workerOffline: true,
      }).state,
    ).toBe("suppressed_offline");
    expect(
      estimateRunEta({
        remainingCount: 3,
        currentIntervalsMs: [10_000, 10_000],
        seedIntervalsMs: [],
        runState: "completed",
        workerOffline: false,
      }),
    ).toEqual({ approxRemainingSeconds: null, state: "suppressed_terminal" });
    expect(
      estimateRunEta({
        remainingCount: 5,
        currentIntervalsMs: [1000],
        seedIntervalsMs: [],
        runState: "running",
        workerOffline: false,
      }).state,
    ).toBe("insufficient_evidence");
  });

  it("estimates remaining from EWMA × remaining count", () => {
    const eta = estimateRunEta({
      remainingCount: 4,
      currentIntervalsMs: [10_000, 10_000],
      seedIntervalsMs: [],
      runState: "running",
      workerOffline: false,
    });
    expect(eta.state).toBe("ready");
    expect(eta.approxRemainingSeconds).toBe(40);
  });

  it("uses historical seed when the current run is sparse", () => {
    const eta = estimateRunEta({
      remainingCount: 2,
      currentIntervalsMs: [8_000],
      seedIntervalsMs: [10_000, 10_000],
      runState: "running",
      workerOffline: false,
    });
    expect(eta.state).toBe("ready");
    expect(eta.approxRemainingSeconds).toBeGreaterThan(0);
  });

  it("derives completion timestamps from pipeline rows", () => {
    const stamps = completionTimestampsFromJobs(
      [
        job({
          jobId: "1",
          jobState: "succeeded",
          hasResponse: true,
          latestExtractionState: "valid",
          latestExtractionUpdatedAt: new Date("2026-07-19T10:02:00.000Z"),
          jobUpdatedAt: new Date("2026-07-19T10:01:00.000Z"),
        }),
        job({
          jobId: "2",
          jobState: "cancelled",
          jobUpdatedAt: new Date("2026-07-19T10:03:00.000Z"),
        }),
      ],
      { skipsExtraction: false },
    );
    expect(stamps).toHaveLength(2);
    expect(stamps[0]!.toISOString()).toBe("2026-07-19T10:02:00.000Z");
  });
});
