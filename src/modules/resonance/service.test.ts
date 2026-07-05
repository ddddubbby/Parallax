import "../../env-bootstrap";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  updateResonanceStudy,
} from "@/db/repositories/resonance";
import {
  auditRuns,
  extractions,
  jobs,
  matrixVersions,
  metrics,
  projects,
  promptCells,
  resonanceStimuli,
  resonanceStudies,
  responses,
  runEvents,
} from "@/db/schema";
import { extractResponse } from "@/modules/extraction/service";
import { createRun, projectRunCost } from "@/modules/runner/actions";
import { completeRun, getRun, isRunFinished, recordSuccess } from "@/db/repositories/runner";
import { listMetrics, recomputeMetrics } from "@/db/repositories/metrics";
import { mockProvider } from "@/providers/mock";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdRunIds: string[] = [];
const createdVersionIds: string[] = [];
const createdStudyIds: string[] = [];

afterAll(async () => {
  for (const runId of createdRunIds) {
    const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId)).catch(() => []);
    if (responseRows.length > 0) {
      await db.delete(extractions).where(inArray(extractions.responseId, responseRows.map((r) => r.id))).catch(() => {});
      await db.delete(responses).where(eq(responses.runId, runId)).catch(() => {});
    }
    await db.delete(metrics).where(eq(metrics.runId, runId)).catch(() => {});
    await db.delete(jobs).where(eq(jobs.runId, runId)).catch(() => {});
    await db.delete(runEvents).where(eq(runEvents.runId, runId)).catch(() => {});
    await db.delete(auditRuns).where(eq(auditRuns.id, runId)).catch(() => {});
  }
  for (const versionId of createdVersionIds) {
    await db.delete(promptCells).where(eq(promptCells.matrixVersionId, versionId)).catch(() => {});
    await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId)).catch(() => {});
  }
  for (const studyId of createdStudyIds) {
    await db.delete(resonanceStimuli).where(eq(resonanceStimuli.studyId, studyId)).catch(() => {});
    await db.delete(resonanceStudies).where(eq(resonanceStudies.id, studyId)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

async function demoProjectId() {
  const [project] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!project) throw new Error("ledgerfox-demo not found — run pnpm db:seed first");
  return project.id;
}

describe.skipIf(!dbUp)("Resonance study compiler (M17)", () => {
  it("blocks unconditioned measured_ai by default, then compiles GENERIC studies into simulation cells", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M17 Compiler E2E");
    createdStudyIds.push(study.id);
    await addResonanceStimulus({
      studyId: study.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described as easy to implement.",
      evidenceResponseIds: [],
    });
    await addResonanceStimulus({
      studyId: study.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LedgerFox is described with clearer proof and buyer-relevant differentiation.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/C-13/);

    await updateResonanceStudy(projectId, study.id, { genericUnconditioned: true });
    const version = await approveAndCompileResonanceStudy(projectId, study.id);
    createdVersionIds.push(version.id);

    const [matrix] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, version.id));
    expect(matrix.kind).toBe("resonance");
    expect(matrix.state).toBe("approved");
    expect(matrix.resonanceStudyId).toBe(study.id);

    const cells = await db.select().from(promptCells).where(eq(promptCells.matrixVersionId, version.id));
    expect(cells).toHaveLength(2);
    expect(cells.every((cell) => cell.intent === "simulation")).toBe(true);
    expect(cells.every((cell) => cell.personaId === null && cell.marketId === null)).toBe(true);

    const multi = await projectRunCost(projectId, {
      matrixVersionId: version.id,
      runMode: "mock",
      providers: ["mock", "deepseek"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 1,
    });
    expect(multi.ok).toBe(false);
    if (!multi.ok) expect(multi.error).toContain("D-067");

    const run = await createRun(projectId, {
      matrixVersionId: version.id,
      runMode: "mock",
      providers: ["mock"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 1,
    });
    expect(run.ok).toBe(true);
    if (run.ok && run.runId) createdRunIds.push(run.runId);
    if (!run.ok || !run.runId) throw new Error("expected run id");

    const jobRows = await db
      .select({
        id: jobs.id,
        runId: jobs.runId,
        cellId: jobs.cellId,
        providerId: jobs.providerId,
        generationMode: jobs.generationMode,
        repIndex: jobs.repIndex,
        attemptCount: jobs.attemptCount,
        resolvedText: promptCells.resolvedText,
      })
      .from(jobs)
      .innerJoin(promptCells, eq(promptCells.id, jobs.cellId))
      .where(eq(jobs.runId, run.runId));
    expect(jobRows).toHaveLength(2);
    await db.update(auditRuns).set({ state: "running" }).where(eq(auditRuns.id, run.runId));
    for (const job of jobRows) {
      await db.update(jobs).set({ state: "running" }).where(eq(jobs.id, job.id));
      const result = await mockProvider.generate({
        promptText: job.resolvedText,
        mode: job.generationMode,
        repIndex: job.repIndex,
      });
      const responseId = await recordSuccess(job, {
        modelVersion: result.modelVersion,
        rawText: result.text,
        citations: result.citations,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
      });
      await expect(extractResponse(responseId)).resolves.toMatchObject({ outcome: "valid", attempts: 1 });
    }
    expect(await isRunFinished(run.runId)).toBe(true);
    await completeRun(run.runId);

    const completed = await getRun(run.runId);
    expect(completed?.state).toBe("completed");
    const responseRows = await db.select().from(responses).where(eq(responses.runId, run.runId));
    expect(responseRows).toHaveLength(2);
    const extractionRows = await db
      .select()
      .from(extractions)
      .where(inArray(extractions.responseId, responseRows.map((response) => response.id)));
    expect(extractionRows).toHaveLength(2);
    for (const row of extractionRows) {
      const payload = row.extractedJson as { kind?: string; pmf?: number[]; meanScore?: number };
      expect(row.state).toBe("valid");
      expect(row.schemaVersion).toBe(1);
      expect(payload.kind).toBe("ssr");
      expect(payload.pmf).toHaveLength(5);
      expect(payload.pmf?.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
      expect(payload.meanScore).toBeGreaterThanOrEqual(1);
      expect(payload.meanScore).toBeLessThanOrEqual(5);
    }

    const rowCount = await recomputeMetrics(run.runId);
    expect(rowCount).toBe(5);
    const first = await listMetrics(run.runId);
    expect(first.every((row) => row.scopeType.startsWith("resonance_"))).toBe(true);
    expect(first.some((row) => row.scopeType === "resonance_delta" && row.metricKey === "delta_pi_mean")).toBe(true);
    await recomputeMetrics(run.runId);
    const second = await listMetrics(run.runId);
    const stableShape = (row: (typeof first)[number]) => ({
      scopeType: row.scopeType,
      scopeKey: row.scopeKey,
      metricKey: row.metricKey,
      n: row.n,
      value: row.value,
      ciLow: row.ciLow,
      ciHigh: row.ciHigh,
      metadataJson: row.metadataJson,
    });
    expect(second.map(stableShape).sort(sortMetric)).toEqual(first.map(stableShape).sort(sortMetric));
  });
});

function sortMetric(a: { scopeType: string; scopeKey: string; metricKey: string }, b: { scopeType: string; scopeKey: string; metricKey: string }) {
  return `${a.scopeType}|${a.scopeKey}|${a.metricKey}`.localeCompare(`${b.scopeType}|${b.scopeKey}|${b.metricKey}`);
}
