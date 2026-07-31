import { describe, expect, it } from "vitest";
import {
  completionTimestampsFromJobs,
  computeStageProgress,
  isOverallPipelineComplete,
  isTerminalExtractionState,
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

// The terminal pipeline completion definition is the M50/D-120 forecast basis:
// generation success alone never counts — the latest extraction/scoring row
// must be terminal, and its timestamp (not the job's) is the completion time.
describe("terminal pipeline completion timestamps (M46/D-117, M50/D-120)", () => {
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
        job({
          jobId: "3",
          jobState: "succeeded",
          hasResponse: true,
          latestExtractionState: "pending",
          latestExtractionUpdatedAt: new Date("2026-07-19T10:04:00.000Z"),
          jobUpdatedAt: new Date("2026-07-19T10:03:30.000Z"),
        }),
      ],
      { skipsExtraction: false },
    );
    // Job 3 is generation-success without terminal extraction — excluded.
    expect(stamps).toHaveLength(2);
    expect(stamps[0]!.toISOString()).toBe("2026-07-19T10:02:00.000Z");
  });
});
