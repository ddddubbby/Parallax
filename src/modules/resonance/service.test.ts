import "../../env-bootstrap";
import { eq, inArray, max } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  deleteResonanceStimulus,
  getResonanceStudyResults,
  updateResonanceStimulus,
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
import { deleteStimulusAction } from "@/modules/resonance/actions";
import { computeFindings, generateReport } from "@/modules/report/service";
import { createRun, projectRunCost } from "@/modules/runner/actions";
import { completeRun, getRun, isRunFinished, listRunEvents, recordSuccess } from "@/db/repositories/runner";
import { listMetrics, recomputeMetrics } from "@/db/repositories/metrics";
import { mockProvider } from "@/providers/mock";
import { scoreResponse } from "@/modules/resonance/scoring";
import { CredentialConfigError } from "@/modules/settings/crypto";
import type { EmbeddingProvider } from "@/providers/types";

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

// M22 (D-078): the C-13 approval guard is now unconditional — a study can
// only compile with a real measured_ai stimulus citing a stored response
// from a COMPLETED audit run in the same project; genericUnconditioned no
// longer bypasses this. Tests below that previously used the
// genericUnconditioned escape hatch purely to reach an approved study (for
// unrelated freeze/run/scoring assertions) now attach real evidence via
// this fixture instead. Mirrors the "incomplete audit runs (C-13)" test
// above, but with state: "completed" so assertEvidenceIds accepts it.
async function createCompletedEvidenceResponseId(projectId: string): Promise<string> {
  const [{ latest }] = await db
    .select({ latest: max(matrixVersions.version) })
    .from(matrixVersions)
    .where(eq(matrixVersions.projectId, projectId));
  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId,
      version: (latest ?? 0) + 1,
      state: "approved",
      kind: "audit",
      cellCount: 1,
      approvedAt: new Date(),
    })
    .returning({ id: matrixVersions.id });
  createdVersionIds.push(version.id);
  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version.id,
      intent: "discovery",
      variantKey: "m22-evidence-fixture",
      resolvedText: "What AI tools are recommended for finance operations?",
      competitorOrderJson: [],
    })
    .returning({ id: promptCells.id });
  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 1,
      costCapUsd: "1",
    })
    .returning({ id: auditRuns.id });
  createdRunIds.push(run.id);
  const [job] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      repIndex: 0,
      state: "succeeded",
    })
    .returning({ id: jobs.id });
  const [response] = await db
    .insert(responses)
    .values({
      jobId: job.id,
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      modelVersion: "mock-completed-evidence",
      rawText: "Completed audit evidence for M22 evidence-only fixtures.",
    })
    .returning({ id: responses.id });
  return response.id;
}

describe.skipIf(!dbUp)("Resonance study compiler (M17)", () => {
  it("rejects unresolved template placeholders before compiling a study (VA-2)", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 Placeholder Rejection");
    createdStudyIds.push(study.id);
    await updateResonanceStudy(projectId, study.id, { genericUnconditioned: true });
    await expect(
      addResonanceStimulus({
        projectId: "00000000-0000-4000-8000-000000000000",
        studyId: study.id,
        kind: "custom",
        label: "Wrong project",
        body: "This must not attach across projects.",
        evidenceResponseIds: [],
      }),
    ).rejects.toThrow(/not found/i);
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "custom",
      label: "Variant A",
      body: "First unresolved scaffold: {variant_a}",
      evidenceResponseIds: [],
    });
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "custom",
      label: "Variant B",
      body: "Second resolved scaffold.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/Resolve template placeholders/);
  });

  it("rejects measured_ai evidence ids that are missing or outside the project (C-13)", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 C13 Missing Evidence");
    createdStudyIds.push(study.id);
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described as easy to implement.",
      evidenceResponseIds: ["00000000-0000-4000-8000-000000000000"],
    });
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LedgerFox is described with clearer proof.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/stored audit responses/);
  });

  it("rejects malformed measured_ai evidence ids at the repository boundary (C-13)", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 C13 Malformed Evidence");
    createdStudyIds.push(study.id);

    await expect(
      addResonanceStimulus({
        projectId,
        studyId: study.id,
        kind: "measured_ai",
        label: "Measured AI framing",
        body: "LedgerFox is described as easy to implement.",
        evidenceResponseIds: ["not-a-response-id"],
      }),
    ).rejects.toThrow(/UUID strings/);
  });

  it("rejects corrupted stored evidence id JSON before compiling a study (C-13)", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 C13 Corrupted Evidence JSON");
    createdStudyIds.push(study.id);
    const stimulus = await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described as easy to implement.",
      evidenceResponseIds: [],
    });
    await db
      .update(resonanceStimuli)
      .set({ evidenceResponseIdsJson: { bad: "json-shape" } })
      .where(eq(resonanceStimuli.id, stimulus.id));
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LedgerFox is described with clearer proof.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/stored as an array/);
  });

  it("rejects measured_ai evidence ids from incomplete audit runs (C-13)", async () => {
    const projectId = await demoProjectId();
    const [{ latest }] = await db
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const [version] = await db
      .insert(matrixVersions)
      .values({
        projectId,
        version: (latest ?? 0) + 1,
        state: "approved",
        kind: "audit",
        cellCount: 1,
        approvedAt: new Date(),
      })
      .returning({ id: matrixVersions.id });
    createdVersionIds.push(version.id);
    const [cell] = await db
      .insert(promptCells)
      .values({
        matrixVersionId: version.id,
        intent: "discovery",
        variantKey: "c13-incomplete",
        resolvedText: "What AI tools are recommended for finance operations?",
        competitorOrderJson: [],
      })
      .returning({ id: promptCells.id });

    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId,
        matrixVersionId: version.id,
        runMode: "mock",
        state: "running",
        repetitions: 1,
        selectedProvidersJson: ["mock"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 1,
        costCapUsd: "1",
      })
      .returning({ id: auditRuns.id });
    createdRunIds.push(run.id);

    const [job] = await db
      .insert(jobs)
      .values({
        runId: run.id,
        cellId: cell.id,
        providerId: "mock",
        generationMode: "ungrounded",
        repIndex: 0,
        state: "succeeded",
      })
      .returning({ id: jobs.id });
    const [response] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: run.id,
        cellId: cell.id,
        providerId: "mock",
        generationMode: "ungrounded",
        modelVersion: "mock-incomplete-audit",
        rawText: "Draft evidence from an audit run that has not completed.",
      })
      .returning({ id: responses.id });

    const study = await createResonanceStudy(projectId, "M20 C13 Incomplete Evidence");
    createdStudyIds.push(study.id);
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described before the run is complete.",
      evidenceResponseIds: [response.id],
    });
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LedgerFox is described with completed evidence only.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/stored audit responses/);
  });

  it("freezes stimuli once a study is approved (C-4)", async () => {
    const projectId = await demoProjectId();
    const evidenceResponseId = await createCompletedEvidenceResponseId(projectId);
    const study = await createResonanceStudy(projectId, "M20 C4 Freeze");
    createdStudyIds.push(study.id);
    const { id: stimulusId } = await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "A",
      body: "First variant.",
      evidenceResponseIds: [evidenceResponseId],
    });
    await addResonanceStimulus({ projectId, studyId: study.id, kind: "custom", label: "B", body: "Second variant.", evidenceResponseIds: [] });

    const version = await approveAndCompileResonanceStudy(projectId, study.id);
    createdVersionIds.push(version.id);

    // Server actions are RPC endpoints; the UI 'disabled' is not the guard.
    await expect(
      updateResonanceStimulus({ projectId, studyId: study.id, stimulusId, kind: "custom", label: "Edited", body: "Rewritten after freeze.", evidenceResponseIds: [] }),
    ).rejects.toThrow(/frozen/i);
    await expect(deleteResonanceStimulus(projectId, study.id, stimulusId)).rejects.toThrow(/frozen/i);
    await expect(
      addResonanceStimulus({ projectId, studyId: study.id, kind: "custom", label: "C", body: "Sneaked in after freeze.", evidenceResponseIds: [] }),
    ).rejects.toThrow(/frozen/i);
  });

  it("rejects duplicate panel persona keys before compile because persona metric scopes use the key", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 Duplicate Persona Keys");
    createdStudyIds.push(study.id);

    await expect(
      updateResonanceStudy(projectId, study.id, {
        genericUnconditioned: true,
        panelPersonas: [
          {
            key: "p1",
            label: "Primary buyer",
            ageBand: "35-44",
            incomeBand: "$100k-$150k",
            locationContext: "United States",
            behavioralProfile: "researches carefully",
          },
          {
            key: "p1",
            label: "Duplicate buyer",
            ageBand: "45-54",
            incomeBand: "$150k-$200k",
            locationContext: "United States",
            behavioralProfile: "compares vendors",
          },
        ],
      }),
    ).rejects.toThrow(/unique/i);
  });

  it("reports a missing stimulus delete as an action error", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M20 Delete Missing Stimulus");
    createdStudyIds.push(study.id);

    const result = await deleteStimulusAction(projectId, study.id, "00000000-0000-4000-8000-000000000000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not found");
  });

  it("blocks unconditioned measured_ai unconditionally (M22: no genericUnconditioned escape), then compiles once real evidence is attached", async () => {
    const projectId = await demoProjectId();
    const study = await createResonanceStudy(projectId, "M17 Compiler E2E");
    createdStudyIds.push(study.id);
    const measuredStimulus = await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described as easy to implement.",
      evidenceResponseIds: [],
    });
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LedgerFox is described with clearer proof and buyer-relevant differentiation.",
      evidenceResponseIds: [],
    });

    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/C-13/);

    // M22 (D-078): genericUnconditioned is dormant for approval — setting it
    // (e.g. a stray/legacy row, or a direct repository call bypassing the
    // now-toggle-less wizard) must NOT let an unevidenced study through.
    await updateResonanceStudy(projectId, study.id, { genericUnconditioned: true });
    await expect(approveAndCompileResonanceStudy(projectId, study.id)).rejects.toThrow(/C-13/);

    // The only way past the gate now: attach a real evidence id from a
    // completed audit run in the same project.
    const evidenceResponseId = await createCompletedEvidenceResponseId(projectId);
    await updateResonanceStimulus({
      projectId,
      studyId: study.id,
      stimulusId: measuredStimulus.id,
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "LedgerFox is described as easy to implement.",
      evidenceResponseIds: [evidenceResponseId],
    });

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

    // D-080 (supersedes D-067): a Resonance run may now select multiple
    // providers — each is scored as its own synthetic population — but
    // exactly one generation mode (no mode dimension in resonance scopes).
    const multiProvider = await projectRunCost(projectId, {
      matrixVersionId: version.id,
      runMode: "live_validation",
      providers: ["deepseek", "openai"],
      modes: ["ungrounded"],
      repetitions: 1,
      costCapUsd: 1,
    });
    expect(multiProvider.ok).toBe(true);

    const multiMode = await projectRunCost(projectId, {
      matrixVersionId: version.id,
      runMode: "live_validation",
      providers: ["deepseek"],
      modes: ["ungrounded", "grounded"],
      repetitions: 1,
      costCapUsd: 1,
    });
    expect(multiMode.ok).toBe(false);
    if (!multiMode.ok) expect(multiMode.error).toContain("D-080");

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

    const refreshedResults = await getResonanceStudyResults(projectId, study.id, run.runId, { refreshMetrics: true });
    expect(refreshedResults?.providers).toEqual(["mock"]);
    const refreshedVariants = refreshedResults?.providerGroups.flatMap((g) => g.variants) ?? [];
    expect(refreshedVariants.length).toBeGreaterThan(0);
    expect(refreshedVariants.every((variant) => variant.pmf.reduce((sum, value) => sum + value, 0) > 0.999)).toBe(true);
    expect(refreshedVariants.every((variant) => variant.providerId === "mock")).toBe(true);

    // Single-provider run: rowCount and scopeKey suffix are the pre-M24
    // shape plus a `|mock` provider suffix (D-080) — 2 variant + 2 persona +
    // 1 delta rows, unchanged in count from before M24.
    const rowCount = await recomputeMetrics(run.runId);
    expect(rowCount).toBe(5);
    const first = await listMetrics(run.runId);
    expect(first.every((row) => row.scopeType.startsWith("resonance_"))).toBe(true);
    expect(first.every((row) => row.scopeKey.endsWith("|mock"))).toBe(true);
    expect(first.some((row) => row.scopeType === "resonance_delta" && row.metricKey === "delta_pi_mean")).toBe(true);
    const deltaMetric = first.find((row) => row.scopeType === "resonance_delta" && row.metricKey === "delta_pi_mean");
    if (!deltaMetric) throw new Error("expected resonance delta metric");
    expect(deltaMetric.metadataJson).toMatchObject({ baselineStimulusId: expect.any(String), providerId: "mock", directionalOnly: true });
    const results = await getResonanceStudyResults(projectId, study.id, run.runId);
    expect(results?.providerGroups[0]?.deltas[0]?.directionalOnly).toBe(true);
    await db
      .update(metrics)
      .set({ metadataJson: { ...(deltaMetric.metadataJson as Record<string, unknown>), directionalOnly: false } })
      .where(eq(metrics.id, deltaMetric.id));
    const overriddenResults = await getResonanceStudyResults(projectId, study.id, run.runId);
    expect(overriddenResults?.providerGroups[0]?.deltas[0]?.directionalOnly).toBe(false);
    const personaMetric = first.find(
      (row) => row.scopeType === "resonance_variant_persona" && row.metricKey === "pi_mean",
    );
    if (!personaMetric) throw new Error("expected resonance persona metric");
    await db
      .update(metrics)
      .set({ metadataJson: { ...(personaMetric.metadataJson as Record<string, unknown>), directionalOnly: false } })
      .where(eq(metrics.id, personaMetric.id));
    const personaResults = await getResonanceStudyResults(projectId, study.id, run.runId);
    expect(personaResults?.providerGroups[0]?.personaRows.every((row) => row.directionalOnly)).toBe(true);
    const variantMetric = first.find(
      (row) => row.scopeType === "resonance_variant" && row.metricKey === "pi_mean" && row.scopeKey === deltaMetric.scopeKey,
    );
    if (!variantMetric) throw new Error("expected resonance variant metric");
    await db
      .update(metrics)
      .set({ metadataJson: { ...(variantMetric.metadataJson as Record<string, unknown>), pmf: [1, 1, 1, 1, 1] } })
      .where(eq(metrics.id, variantMetric.id));
    const invalidPmfResults = await getResonanceStudyResults(projectId, study.id, run.runId);
    const invalidPmfVariants = invalidPmfResults?.providerGroups.flatMap((g) => g.variants) ?? [];
    const invalidPmfDeltas = invalidPmfResults?.providerGroups.flatMap((g) => g.deltas) ?? [];
    expect(invalidPmfVariants.some((variant) => `${variant.stimulusId}|${variant.providerId}` === variantMetric.scopeKey)).toBe(false);
    expect(invalidPmfDeltas.some((delta) => `${delta.stimulusId}|${delta.providerId}` === variantMetric.scopeKey)).toBe(false);

    const [variantResponse] = responseRows.filter((response) => response.cellId === jobRows.find((job) => job.cellId)?.cellId);
    const [variantExtraction] = await db
      .select()
      .from(extractions)
      .where(eq(extractions.responseId, variantResponse.id))
      .limit(1);
    const originalExtractedJson = variantExtraction.extractedJson;
    await db
      .update(extractions)
      .set({ extractedJson: { ...(variantExtraction.extractedJson as Record<string, unknown>), meanScore: 99 } })
      .where(eq(extractions.id, variantExtraction.id));
    await recomputeMetrics(run.runId);
    const inconsistentMeanMetrics = await listMetrics(run.runId);
    expect(inconsistentMeanMetrics.every((row) => row.n < responseRows.length)).toBe(true);

    const inconsistentMeanResults = await getResonanceStudyResults(projectId, study.id, run.runId);
    const responseIdsInResults =
      inconsistentMeanResults?.providerGroups.flatMap((g) =>
        g.variants.flatMap((variant) => variant.responses.map((response) => response.responseId)),
      ) ?? [];
    expect(responseIdsInResults).not.toContain(variantResponse.id);
    await db
      .update(extractions)
      .set({ extractedJson: originalExtractedJson })
      .where(eq(extractions.id, variantExtraction.id));
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
    await expect(computeFindings(run.runId)).rejects.toThrow(/resonance run/i);
    await expect(generateReport(run.runId)).resolves.toMatchObject({ ok: false });
  });

  it("pauses live SSR scoring on credential encryption config errors instead of dead-lettering", async () => {
    const projectId = await demoProjectId();
    const evidenceResponseId = await createCompletedEvidenceResponseId(projectId);
    const study = await createResonanceStudy(projectId, "M20 SSR Config Pause");
    createdStudyIds.push(study.id);
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "measured_ai",
      label: "Baseline",
      body: "Baseline framing.",
      evidenceResponseIds: [evidenceResponseId],
    });
    await addResonanceStimulus({
      projectId,
      studyId: study.id,
      kind: "corrected",
      label: "Variant",
      body: "Improved framing.",
      evidenceResponseIds: [],
    });
    const version = await approveAndCompileResonanceStudy(projectId, study.id);
    createdVersionIds.push(version.id);
    const [cell] = await db.select({ id: promptCells.id }).from(promptCells).where(eq(promptCells.matrixVersionId, version.id)).limit(1);

    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId,
        matrixVersionId: version.id,
        runMode: "live_validation",
        state: "running",
        repetitions: 1,
        selectedProvidersJson: ["openai"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 1,
        costCapUsd: "1",
      })
      .returning({ id: auditRuns.id });
    createdRunIds.push(run.id);
    const [job] = await db
      .insert(jobs)
      .values({
        runId: run.id,
        cellId: cell.id,
        providerId: "openai",
        generationMode: "ungrounded",
        repIndex: 0,
        state: "running",
      })
      .returning({
        id: jobs.id,
        runId: jobs.runId,
        cellId: jobs.cellId,
        providerId: jobs.providerId,
        generationMode: jobs.generationMode,
      });
    const responseId = await recordSuccess(job, {
      modelVersion: "openai-test",
      rawText: "Synthetic panel reaction text.",
      citations: [],
      tokensIn: 10,
      tokensOut: 5,
      costUsd: 0.001,
      latencyMs: 5,
    });

    const brokenProvider: EmbeddingProvider = {
      providerId: "openai",
      displayName: "OpenAI",
      defaultModel: "text-embedding-3-small",
      embed: async () => {
        throw new CredentialConfigError("CREDENTIALS_ENCRYPTION_KEY is not set");
      },
      estimateCostUsd: () => 0,
    };

    const result = await scoreResponse(responseId, brokenProvider);
    expect(result).toMatchObject({ outcome: "skipped", attempts: 1 });
    const [extraction] = await db.select().from(extractions).where(eq(extractions.responseId, responseId)).limit(1);
    expect(extraction.state).toBe("retrying");
    expect(extraction.validationError).toContain("CREDENTIALS_ENCRYPTION_KEY");
    const paused = await getRun(run.id);
    expect(paused?.state).toBe("paused");
    const events = await listRunEvents(run.id, 50);
    expect(events.some((event) => event.eventType === "worker_config_error")).toBe(true);
  });
});

function sortMetric(a: { scopeType: string; scopeKey: string; metricKey: string }, b: { scopeType: string; scopeKey: string; metricKey: string }) {
  return `${a.scopeType}|${a.scopeKey}|${a.metricKey}`.localeCompare(`${b.scopeType}|${b.scopeKey}|${b.metricKey}`);
}
