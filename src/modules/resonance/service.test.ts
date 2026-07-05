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
      await expect(extractResponse(responseId)).resolves.toMatchObject({ outcome: "skipped" });
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
    expect(extractionRows).toHaveLength(0);
  });
});
