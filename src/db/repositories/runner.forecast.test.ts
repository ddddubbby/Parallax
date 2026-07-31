// M50/D-120 P2: getRunDetail forecast wiring — live-run-only terminal
// pipeline inputs, calibration floor, stale-pace recalibration, worker-offline.

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { formatRunForecastRange } from "@/core/run-forecast";
import { db, pool } from "../client";
import {
  auditRuns,
  extractions,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
  runEvents,
} from "../schema";
import { getRunDetail } from "./runner";
import { forceDeleteMatrixVersions } from "./matrix.test-helpers";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const made = {
  projectIds: [] as string[],
  versionIds: [] as string[],
  cellIds: [] as string[],
  runIds: [] as string[],
  jobIds: [] as string[],
  responseIds: [] as string[],
  extractionIds: [] as string[],
  eventIds: [] as string[],
};

const MIN = 60_000;

async function makeProject(slug: string) {
  const [project] = await db
    .insert(projects)
    .values({ name: `Forecast ${slug}`, slug })
    .returning();
  const [version] = await db
    .insert(matrixVersions)
    .values({ projectId: project!.id, version: 1, state: "approved" })
    .returning();
  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version!.id,
      intent: "discovery",
      variantKey: "v1",
      resolvedText: "forecast fixture prompt",
    })
    .returning();
  made.projectIds.push(project!.id);
  made.versionIds.push(version!.id);
  made.cellIds.push(cell!.id);
  return { projectId: project!.id, versionId: version!.id, cellId: cell!.id };
}

async function makeRun(input: {
  projectId: string;
  versionId: string;
  state: "queued" | "running" | "completed";
  plannedCalls: number;
}) {
  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: input.projectId,
      matrixVersionId: input.versionId,
      runMode: "mock",
      state: input.state,
      repetitions: 5,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["grounded"],
      plannedCalls: input.plannedCalls,
      costCapUsd: "0",
    })
    .returning();
  made.runIds.push(run!.id);
  return run!.id;
}

/** One terminal pipeline completion: succeeded job + response + valid extraction. */
async function makeTerminalJob(input: {
  runId: string;
  cellId: string;
  repIndex: number;
  generationAt: Date;
  extractionAt: Date;
}) {
  const [job] = await db
    .insert(jobs)
    .values({
      runId: input.runId,
      cellId: input.cellId,
      providerId: "mock",
      generationMode: "grounded",
      repIndex: input.repIndex,
      state: "succeeded",
      updatedAt: input.generationAt,
    })
    .returning();
  const [response] = await db
    .insert(responses)
    .values({
      jobId: job!.id,
      runId: input.runId,
      cellId: input.cellId,
      providerId: "mock",
      generationMode: "grounded",
      modelVersion: "m50-forecast-fixture-v1",
      rawText: "forecast fixture response",
    })
    .returning();
  const [extraction] = await db
    .insert(extractions)
    .values({
      responseId: response!.id,
      extractionVersion: 1,
      state: "valid",
      extractionModel: "m50-forecast-fixture-v1",
      updatedAt: input.extractionAt,
    })
    .returning();
  made.jobIds.push(job!.id);
  made.responseIds.push(response!.id);
  made.extractionIds.push(extraction!.id);
}

async function makeQueuedJob(runId: string, cellId: string, repIndex: number) {
  const [job] = await db
    .insert(jobs)
    .values({
      runId,
      cellId,
      providerId: "mock",
      generationMode: "grounded",
      repIndex,
      state: "queued",
    })
    .returning();
  made.jobIds.push(job!.id);
}

async function freshHeartbeat(runId: string) {
  const [event] = await db
    .insert(runEvents)
    .values({
      runId,
      level: "info",
      eventType: "worker_heartbeat",
      message: "M50 forecast fixture heartbeat.",
    })
    .returning();
  made.eventIds.push(event!.id);
}

/**
 * The M50 e2e/unit fixture pattern: 15 completions whose extraction intervals
 * run 7×4 min then 7×6 min, last completion ~30s old. Hand-computed window
 * cadences [4,4,4,4,4.5,5,5.5,6,6,6,6] min → p10/p90 = 4/6 min → 40–60 min
 * for 10 remaining.
 */
const READY_INTERVALS_MIN = [4, 4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6, 6];

function readyCompletionTimes(nowMs: number): Date[] {
  const times = [new Date(nowMs - 30_000)];
  let cursor = nowMs - 30_000;
  for (let i = READY_INTERVALS_MIN.length - 1; i >= 0; i--) {
    cursor -= READY_INTERVALS_MIN[i]! * MIN;
    times.unshift(new Date(cursor));
  }
  return times;
}

afterAll(async () => {
  if (!dbUp) return;
  await db.delete(runEvents).where(inArray(runEvents.id, made.eventIds));
  await db.delete(extractions).where(inArray(extractions.id, made.extractionIds));
  await db.delete(responses).where(inArray(responses.id, made.responseIds));
  await db.delete(jobs).where(inArray(jobs.id, made.jobIds));
  await db.delete(auditRuns).where(inArray(auditRuns.id, made.runIds));
  await forceDeleteMatrixVersions(made.versionIds);
  await db.delete(projects).where(inArray(projects.id, made.projectIds));
});

describe("getRunDetail forecast (M50/D-120)", () => {
  it.skipIf(!dbUp)("flags worker-offline when the only heartbeat is stale", async () => {
    const { projectId, versionId, cellId } = await makeProject("m50-offline");
    const runId = await makeRun({ projectId, versionId, state: "running", plannedCalls: 25 });
    const times = readyCompletionTimes(Date.now());
    for (const [i, at] of times.entries()) {
      await makeTerminalJob({
        runId,
        cellId,
        repIndex: i,
        generationAt: new Date(at.getTime() - 60_000),
        extractionAt: at,
      });
    }
    for (let i = 0; i < 10; i++) await makeQueuedJob(runId, cellId, 100 + i);

    const detail = await getRunDetail(runId);
    // Seeded heartbeat is 120s old (> 90s stale) and this file has not
    // written a fresh one yet — offline beats the otherwise-ready range.
    expect(detail?.workerOffline).toBe(true);
    expect(detail?.forecast).toEqual({ state: "offline", range: null });
  });

  it.skipIf(!dbUp)(
    "calibrates below 10 terminal completions and never queries historical runs",
    async () => {
      const { projectId, versionId, cellId } = await makeProject("m50-calibrating");
      const anchorRunId = await makeRun({ projectId, versionId, state: "running", plannedCalls: 1 });
      await freshHeartbeat(anchorRunId);

      // A compatible prior run (same project/kind/mode/providers/modes) with
      // plenty of fast completions — the removed M46 seed path would have
      // used exactly this data to fabricate a ready ETA.
      const priorRunId = await makeRun({ projectId, versionId, state: "completed", plannedCalls: 20 });
      const priorBase = Date.now() - 3_600_000;
      for (let i = 0; i < 20; i++) {
        const at = new Date(priorBase + i * 5_000);
        await makeTerminalJob({
          runId: priorRunId,
          cellId,
          repIndex: i,
          generationAt: new Date(at.getTime() - 2_000),
          extractionAt: at,
        });
      }

      const runId = await makeRun({ projectId, versionId, state: "running", plannedCalls: 25 });
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const at = new Date(now - (5 - i) * 30_000);
        await makeTerminalJob({
          runId,
          cellId,
          repIndex: i,
          generationAt: new Date(at.getTime() - 5_000),
          extractionAt: at,
        });
      }
      for (let i = 0; i < 20; i++) await makeQueuedJob(runId, cellId, 100 + i);

      const detail = await getRunDetail(runId);
      expect(detail?.workerOffline).toBe(false);
      expect(detail?.forecast).toEqual({ state: "calibrating", range: null });
    },
  );

  it.skipIf(!dbUp)(
    "builds the ready range from terminal extraction timestamps, not generation success",
    async () => {
      const { projectId, versionId, cellId } = await makeProject("m50-ready");
      const runId = await makeRun({ projectId, versionId, state: "running", plannedCalls: 25 });
      await freshHeartbeat(runId);

      const times = readyCompletionTimes(Date.now());
      for (const [i, at] of times.entries()) {
        await makeTerminalJob({
          runId,
          cellId,
          repIndex: i,
          // Generation finished an hour before extraction — if the forecast
          // read job.updated_at instead of the terminal extraction stamp,
          // the range would collapse or go stale.
          generationAt: new Date(at.getTime() - 3_600_000),
          extractionAt: at,
        });
      }
      // Generation success WITHOUT terminal extraction is not a completion.
      const [pendingJob] = await db
        .insert(jobs)
        .values({
          runId,
          cellId,
          providerId: "mock",
          generationMode: "grounded",
          repIndex: 50,
          state: "succeeded",
        })
        .returning();
      made.jobIds.push(pendingJob!.id);
      const [pendingResponse] = await db
        .insert(responses)
        .values({
          jobId: pendingJob!.id,
          runId,
          cellId,
          providerId: "mock",
          generationMode: "grounded",
          modelVersion: "m50-forecast-fixture-v1",
          rawText: "extraction still pending",
        })
        .returning();
      made.responseIds.push(pendingResponse!.id);
      const [pendingExtraction] = await db
        .insert(extractions)
        .values({
          responseId: pendingResponse!.id,
          extractionVersion: 1,
          state: "pending",
          extractionModel: "m50-forecast-fixture-v1",
        })
        .returning();
      made.extractionIds.push(pendingExtraction!.id);
      for (let i = 0; i < 9; i++) await makeQueuedJob(runId, cellId, 100 + i);

      const detail = await getRunDetail(runId);
      expect(detail?.stageProgress.overall).toEqual({ completed: 15, total: 25 });
      expect(detail?.forecast.state).toBe("ready");
      expect(detail?.forecast.range).toEqual({ lowSeconds: 2400, highSeconds: 3600 });
      expect(formatRunForecastRange(detail?.forecast.range ?? null)).toBe(
        "Estimated 40–60 min remaining",
      );
    },
  );

  it.skipIf(!dbUp)("recalibrates when terminal pace goes stale", async () => {
    const { projectId, versionId, cellId } = await makeProject("m50-stale");
    const runId = await makeRun({ projectId, versionId, state: "running", plannedCalls: 25 });
    await freshHeartbeat(runId);

    // 12 completions at a 2-min cadence, the last one 20 min ago — far beyond
    // 3× the 2-min slow-end cadence.
    const last = Date.now() - 20 * MIN;
    for (let i = 0; i < 12; i++) {
      const at = new Date(last - (11 - i) * 2 * MIN);
      await makeTerminalJob({
        runId,
        cellId,
        repIndex: i,
        generationAt: new Date(at.getTime() - 60_000),
        extractionAt: at,
      });
    }
    for (let i = 0; i < 13; i++) await makeQueuedJob(runId, cellId, 100 + i);

    const detail = await getRunDetail(runId);
    expect(detail?.stageProgress.overall.completed).toBe(12);
    expect(detail?.forecast).toEqual({ state: "recalibrating", range: null });
  });
});
