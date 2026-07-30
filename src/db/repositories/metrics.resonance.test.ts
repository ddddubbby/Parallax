import "../../env-bootstrap";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
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
} from "@/db/schema";
import { listMetrics, recomputeMetrics } from "./metrics";
import { forceDeleteMatrixVersions } from "./matrix.test-helpers";
import { forceDeleteResonanceStimuliByStudy } from "./resonance.test-helpers";

// D-080 (supersedes D-067): multi-provider resonance recompute. Each selected
// engine must be scored as its own synthetic population — variant means,
// persona slices, and ΔPI baselines all computed WITHIN one provider's own
// samples, never pooled across engines. These tests build fixtures directly
// (bulk DB inserts, bypassing approveAndCompileResonanceStudy/createRun,
// same pattern as wall.test.ts's createCompletedResonanceResponse and
// service.test.ts's createCompletedEvidenceResponseId) because a true
// end-to-end multi-provider MOCK run is impossible under C-9 — a mock run
// may only ever select the single registered "mock" provider
// (isProviderAllowedForRunMode), and no second mock provider id exists in
// the registry. Fabricating extraction rows under two distinct providerId
// values is the honest, already-established way this codebase tests
// recompute-layer logic without inventing new provider plumbing.

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const created = {
  projectIds: [] as string[],
  studyIds: [] as string[],
  versionIds: [] as string[],
  runIds: [] as string[],
};

afterAll(async () => {
  for (const runId of created.runIds) {
    const responseRows = await db.select({ id: responses.id }).from(responses).where(eq(responses.runId, runId)).catch(() => []);
    if (responseRows.length > 0) {
      await db.delete(extractions).where(inArray(extractions.responseId, responseRows.map((r) => r.id))).catch(() => {});
      await db.delete(responses).where(eq(responses.runId, runId)).catch(() => {});
    }
    await db.delete(metrics).where(eq(metrics.runId, runId)).catch(() => {});
    await db.delete(jobs).where(eq(jobs.runId, runId)).catch(() => {});
    await db.delete(auditRuns).where(eq(auditRuns.id, runId)).catch(() => {});
  }
  if (created.versionIds.length > 0) {
    // Bypasses the C-4 freeze trigger (D-081); resonance matrix versions are
    // born "approved" (D-064), so this always needs the test-only escape
    // hatch — see budget.test.ts's comment.
    await forceDeleteMatrixVersions(created.versionIds).catch(() => {});
  }
  for (const studyId of created.studyIds) {
    await forceDeleteResonanceStimuliByStudy(studyId).catch(() => {});
    await db.delete(resonanceStudies).where(eq(resonanceStudies.id, studyId)).catch(() => {});
  }
  for (const projectId of created.projectIds) {
    await db.delete(projects).where(eq(projects.id, projectId)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

/** One-hot PMF at Likert bucket `score` (1-5) — pmfMean(pmf) === score exactly. */
function oneHotPmf(score: 1 | 2 | 3 | 4 | 5): number[] {
  const pmf = [0, 0, 0, 0, 0];
  pmf[score - 1] = 1;
  return pmf;
}

async function insertSsrSamples(input: {
  runId: string;
  cellId: string;
  providerId: "mock" | "deepseek";
  pmf: number[];
  meanScore: number;
  count: number;
  repOffset: number;
}) {
  const jobRows = await db
    .insert(jobs)
    .values(
      Array.from({ length: input.count }, (_, i) => ({
        runId: input.runId,
        cellId: input.cellId,
        providerId: input.providerId,
        generationMode: "ungrounded" as const,
        repIndex: input.repOffset + i,
        state: "succeeded" as const,
      })),
    )
    .returning({ id: jobs.id });
  for (const job of jobRows) {
    const [response] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: input.runId,
        cellId: input.cellId,
        providerId: input.providerId,
        generationMode: "ungrounded",
        modelVersion: `${input.providerId}-fixture`,
        rawText: "Simulated buyer reaction fixture for M24 multi-provider recompute test.",
      })
      .returning({ id: responses.id });
    await db.insert(extractions).values({
      responseId: response.id,
      state: "valid",
      extractedJson: { kind: "ssr", pmf: input.pmf, meanScore: input.meanScore },
    });
  }
}

async function insertRecommendationSamples(input: {
  runId: string;
  cellId: string;
  providerId: "mock" | "deepseek";
  targetRank: number | null;
  count?: number;
}) {
  const jobRows = await db
    .insert(jobs)
    .values(
      Array.from({ length: input.count ?? 5 }, (_, repIndex) => ({
        runId: input.runId,
        cellId: input.cellId,
        providerId: input.providerId,
        generationMode: "ungrounded" as const,
        repIndex,
        state: "succeeded" as const,
      })),
    )
    .returning({ id: jobs.id });
  for (const job of jobRows) {
    const [response] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: input.runId,
        cellId: input.cellId,
        providerId: input.providerId,
        generationMode: "ungrounded",
        modelVersion: `${input.providerId}-recommendation-fixture`,
        rawText: "{\"recommendations\":[]}",
      })
      .returning({ id: responses.id });
    await db.insert(extractions).values({
      responseId: response.id,
      state: "valid",
      extractedJson: {
        kind: "recommendation",
        schemaVersion: "recommendation-v1",
        recommendations: [],
        targetIncluded: input.targetRank !== null,
        targetRank: input.targetRank,
        targetTopPick: input.targetRank === 1,
      },
    });
  }
}

describe.skipIf(!dbUp)("recomputeResonanceMetrics multi-provider populations (D-080)", () => {
  it("scores each provider as its own population: per-provider variant/persona/delta keys, within-provider ΔPI baselines, independent sufficiency gates", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [project] = await db
      .insert(projects)
      .values({
        name: `M24 Multi-Provider ${suffix}`,
        slug: `m24-multi-provider-${suffix}`,
        category: "synthetic research",
        jobToBeDone: "test multi-provider resonance recompute",
        status: "active",
      })
      .returning();
    created.projectIds.push(project.id);

    const [study] = await db
      .insert(resonanceStudies)
      .values({
        projectId: project.id,
        name: `M24 Multi-Provider Study ${suffix}`,
        state: "draft",
        anchorSetVersion: "purchase_intent.v1",
        genericUnconditioned: true,
      })
      .returning();
    created.studyIds.push(study.id);

    const [stimulusA] = await db
      .insert(resonanceStimuli)
      .values({
        studyId: study.id,
        kind: "measured_ai",
        label: "Baseline framing",
        body: "Baseline stimulus body.",
        position: 1,
      })
      .returning();
    const [stimulusB] = await db
      .insert(resonanceStimuli)
      .values({
        studyId: study.id,
        kind: "corrected",
        label: "Corrected framing",
        body: "Corrected stimulus body.",
        position: 2,
      })
      .returning();

    // Baseline is the study's pinned baseline stimulus — same physical
    // stimulus for both providers, but D-080 requires each provider's delta
    // to use ITS OWN mean for that stimulus, never the other provider's.
    await db.update(resonanceStudies).set({
      baselineStimulusId: stimulusA.id,
      state: "approved",
      approvedAt: new Date(),
    }).where(eq(resonanceStudies.id, study.id));

    const [version] = await db
      .insert(matrixVersions)
      .values({
        projectId: project.id,
        version: 1,
        state: "approved",
        kind: "resonance",
        resonanceStudyId: study.id,
        cellCount: 2,
        approvedAt: new Date(),
      })
      .returning();
    created.versionIds.push(version.id);

    const [cellA] = await db
      .insert(promptCells)
      .values({
        matrixVersionId: version.id,
        intent: "simulation",
        stimulusId: stimulusA.id,
        panelPersonaKey: "p1",
        variantKey: "1-measured_ai",
        resolvedText: "Simulated buyer reaction prompt A",
        competitorOrderJson: [],
      })
      .returning();
    const [cellB] = await db
      .insert(promptCells)
      .values({
        matrixVersionId: version.id,
        intent: "simulation",
        stimulusId: stimulusB.id,
        panelPersonaKey: "p1",
        variantKey: "2-corrected",
        resolvedText: "Simulated buyer reaction prompt B",
        competitorOrderJson: [],
      })
      .returning();

    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId: project.id,
        matrixVersionId: version.id,
        runMode: "live_validation",
        state: "completed",
        repetitions: 1,
        selectedProvidersJson: ["mock", "deepseek"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 70,
        costCapUsd: "5",
      })
      .returning();
    created.runIds.push(run.id);

    // mock population: baseline (stim A) mean=2, variant (stim B) mean=4 —
    // both n=30 (sufficient), so mock's delta is AGGREGATE (+2.0).
    await insertSsrSamples({ runId: run.id, cellId: cellA.id, providerId: "mock", pmf: oneHotPmf(2), meanScore: 2, count: 30, repOffset: 0 });
    await insertSsrSamples({ runId: run.id, cellId: cellB.id, providerId: "mock", pmf: oneHotPmf(4), meanScore: 4, count: 30, repOffset: 0 });

    // deepseek population: baseline (stim A) mean=4.5, variant (stim B)
    // mean=4.6 — both n=5 (insufficient), so deepseek's delta is DIRECTIONAL
    // (+0.1). If deltas were pooled across providers instead of computed
    // within each provider's own population, mock's delta would come out
    // wrong (e.g. 4 - 4.5 = -0.5 instead of +2.0) — the D-067 failure mode
    // this test exists to catch.
    const halfSplit = [0, 0, 0, 0.5, 0.5];
    const skewedSplit = [0, 0, 0, 0.4, 0.6];
    await insertSsrSamples({ runId: run.id, cellId: cellA.id, providerId: "deepseek", pmf: halfSplit, meanScore: 4.5, count: 5, repOffset: 0 });
    await insertSsrSamples({ runId: run.id, cellId: cellB.id, providerId: "deepseek", pmf: skewedSplit, meanScore: 4.6, count: 5, repOffset: 0 });

    // Dev-DB sweep proof (in miniature): a stray pre-M24 metrics row keyed
    // on the bare stimulus id (no provider suffix) must not survive a
    // recompute — C-5's delete-then-rebuild wipes ALL of this run's metrics
    // rows unconditionally before inserting the fresh composite-keyed set,
    // so an old-format row can never become an orphan.
    await db.insert(metrics).values({
      runId: run.id,
      scopeType: "resonance_variant",
      scopeKey: stimulusB.id,
      metricKey: "pi_mean",
      n: 1,
      value: 1,
      metadataJson: { pmf: oneHotPmf(1), stimulusKind: "corrected", label: "stale pre-M24 row" },
    });

    const rowCount = await recomputeMetrics(run.id);
    // 2 stimuli x 2 providers = 4 variant rows; 2 stimuli x 1 persona x 2
    // providers = 4 persona rows; 1 non-baseline stimulus x 2 providers = 2
    // delta rows. Total 10 — the multi-provider shape (double the
    // single-provider 5-row shape from the pre-M24 E2E test) — the stray
    // pre-M24 row above is gone, not counted as an 11th row.
    expect(rowCount).toBe(10);

    const rows = await listMetrics(run.id);
    expect(rows.some((r) => r.scopeKey === stimulusB.id)).toBe(false);
    expect(rows.every((r) => r.scopeKey.includes("|"))).toBe(true);

    const variantRows = rows.filter((r) => r.scopeType === "resonance_variant");
    expect(variantRows).toHaveLength(4);
    expect(variantRows.map((r) => r.scopeKey).sort()).toEqual(
      [`${stimulusA.id}|deepseek`, `${stimulusA.id}|mock`, `${stimulusB.id}|deepseek`, `${stimulusB.id}|mock`].sort(),
    );

    const mockBaselineVariant = variantRows.find((r) => r.scopeKey === `${stimulusA.id}|mock`);
    const mockVariantVariant = variantRows.find((r) => r.scopeKey === `${stimulusB.id}|mock`);
    const deepseekBaselineVariant = variantRows.find((r) => r.scopeKey === `${stimulusA.id}|deepseek`);
    const deepseekVariantVariant = variantRows.find((r) => r.scopeKey === `${stimulusB.id}|deepseek`);
    if (!mockBaselineVariant || !mockVariantVariant || !deepseekBaselineVariant || !deepseekVariantVariant) {
      throw new Error("expected all four per-provider variant rows");
    }
    expect(mockBaselineVariant.value).toBeCloseTo(2, 8);
    expect(mockBaselineVariant.n).toBe(30);
    expect((mockBaselineVariant.metadataJson as { sufficientN?: boolean }).sufficientN).toBe(true);
    expect((mockBaselineVariant.metadataJson as { providerId?: string }).providerId).toBe("mock");
    expect(mockVariantVariant.value).toBeCloseTo(4, 8);
    expect((mockVariantVariant.metadataJson as { sufficientN?: boolean }).sufficientN).toBe(true);

    expect(deepseekBaselineVariant.value).toBeCloseTo(4.5, 8);
    expect(deepseekBaselineVariant.n).toBe(5);
    expect((deepseekBaselineVariant.metadataJson as { sufficientN?: boolean }).sufficientN).toBe(false);
    expect((deepseekBaselineVariant.metadataJson as { providerId?: string }).providerId).toBe("deepseek");
    expect(deepseekVariantVariant.value).toBeCloseTo(4.6, 8);

    const personaRows = rows.filter((r) => r.scopeType === "resonance_variant_persona");
    expect(personaRows).toHaveLength(4);
    expect(personaRows.map((r) => r.scopeKey).sort()).toEqual(
      [
        `${stimulusA.id}|p1|deepseek`,
        `${stimulusA.id}|p1|mock`,
        `${stimulusB.id}|p1|deepseek`,
        `${stimulusB.id}|p1|mock`,
      ].sort(),
    );

    const deltaRows = rows.filter((r) => r.scopeType === "resonance_delta");
    expect(deltaRows).toHaveLength(2);
    const mockDelta = deltaRows.find((r) => r.scopeKey === `${stimulusB.id}|mock`);
    const deepseekDelta = deltaRows.find((r) => r.scopeKey === `${stimulusB.id}|deepseek`);
    if (!mockDelta || !deepseekDelta) throw new Error("expected both per-provider delta rows");

    // The load-bearing assertion (D-080/D-067): each delta is the SAME
    // provider's own variant minus its OWN baseline mean — never another
    // provider's baseline. A pooled/cross-provider implementation would
    // produce a materially different (and wrong) number here.
    expect(mockDelta.value).toBeCloseTo(2, 8);
    expect(mockDelta.n).toBe(30);
    expect((mockDelta.metadataJson as { directionalOnly?: boolean }).directionalOnly).toBe(false);
    expect((mockDelta.metadataJson as { baselineStimulusId?: string }).baselineStimulusId).toBe(stimulusA.id);
    expect((mockDelta.metadataJson as { providerId?: string }).providerId).toBe("mock");

    expect(deepseekDelta.value).toBeCloseTo(0.1, 8);
    expect(deepseekDelta.n).toBe(5);
    expect((deepseekDelta.metadataJson as { directionalOnly?: boolean }).directionalOnly).toBe(true);
    expect((deepseekDelta.metadataJson as { providerId?: string }).providerId).toBe("deepseek");

    // C-5 idempotency: recompute twice more, byte-identical both times.
    const second = await recomputeMetrics(run.id);
    expect(second).toBe(10);
    const secondRows = await listMetrics(run.id);
    const stableShape = (r: (typeof rows)[number]) => ({
      scopeType: r.scopeType,
      scopeKey: r.scopeKey,
      metricKey: r.metricKey,
      n: r.n,
      value: r.value,
      ciLow: r.ciLow,
      ciHigh: r.ciHigh,
      metadataJson: r.metadataJson,
    });
    const sortRows = (a: { scopeType: string; scopeKey: string }, b: { scopeType: string; scopeKey: string }) =>
      `${a.scopeType}|${a.scopeKey}`.localeCompare(`${b.scopeType}|${b.scopeKey}`);
    expect(secondRows.map(stableShape).sort(sortRows)).toEqual(rows.map(stableShape).sort(sortRows));
  });
});

describe.skipIf(!dbUp)("AI recommendation metrics (D-119)", () => {
  it("keeps models separate, weights scenarios equally, and recomputes seeded bootstrap intervals byte-identically", async () => {
    const suffix = randomUUID().slice(0, 8);
    const [project] = await db
      .insert(projects)
      .values({
        name: `M49 Recommendation ${suffix}`,
        slug: `m49-recommendation-${suffix}`,
        category: "synthetic research",
        jobToBeDone: "test recommendation lift recompute",
        status: "active",
      })
      .returning();
    created.projectIds.push(project.id);
    const [study] = await db
      .insert(resonanceStudies)
      .values({
        projectId: project.id,
        name: `M49 Recommendation Study ${suffix}`,
        state: "draft",
        testType: "ai_recommendation",
        promptProtocolVersion: "resonance-ai-recommendation.v1",
      })
      .returning();
    created.studyIds.push(study.id);
    const [currentMessage] = await db
      .insert(resonanceStimuli)
      .values({
        studyId: study.id,
        kind: "measured_ai",
        label: "Current message",
        body: "Current message body.",
        position: 1,
      })
      .returning();
    const [newMessage] = await db
      .insert(resonanceStimuli)
      .values({
        studyId: study.id,
        kind: "custom",
        label: "New message",
        body: "New message body.",
        position: 2,
      })
      .returning();
    await db
      .update(resonanceStudies)
      .set({
        baselineStimulusId: currentMessage.id,
        state: "approved",
        approvedAt: new Date(),
      })
      .where(eq(resonanceStudies.id, study.id));
    const [version] = await db
      .insert(matrixVersions)
      .values({
        projectId: project.id,
        version: 1,
        state: "approved",
        kind: "resonance",
        resonanceStudyId: study.id,
        cellCount: 12,
        approvedAt: new Date(),
      })
      .returning();
    created.versionIds.push(version.id);

    const currentCells: string[] = [];
    const newCells: string[] = [];
    for (let scenario = 1; scenario <= 6; scenario++) {
      const inserted = await db
        .insert(promptCells)
        .values([
          {
            matrixVersionId: version.id,
            intent: "simulation",
            stimulusId: currentMessage.id,
            panelPersonaKey: `scenario-${scenario}`,
            variantKey: `scenario-${scenario}-current`,
            resolvedText: `Recommendation current ${scenario}`,
            competitorOrderJson: [],
          },
          {
            matrixVersionId: version.id,
            intent: "simulation",
            stimulusId: newMessage.id,
            panelPersonaKey: `scenario-${scenario}`,
            variantKey: `scenario-${scenario}-new`,
            resolvedText: `Recommendation new ${scenario}`,
            competitorOrderJson: [],
          },
        ])
        .returning({ id: promptCells.id });
      currentCells.push(inserted[0]!.id);
      newCells.push(inserted[1]!.id);
    }

    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId: project.id,
        matrixVersionId: version.id,
        runMode: "live_validation",
        state: "completed",
        repetitions: 5,
        selectedProvidersJson: ["mock", "deepseek"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 120,
        costCapUsd: "5",
      })
      .returning();
    created.runIds.push(run.id);

    for (let scenario = 0; scenario < 6; scenario++) {
      await insertRecommendationSamples({
        runId: run.id,
        cellId: currentCells[scenario]!,
        providerId: "mock",
        targetRank: scenario < 3 ? 1 : null,
      });
      await insertRecommendationSamples({
        runId: run.id,
        cellId: newCells[scenario]!,
        providerId: "mock",
        targetRank: 2,
      });
      await insertRecommendationSamples({
        runId: run.id,
        cellId: currentCells[scenario]!,
        providerId: "deepseek",
        targetRank: 1,
      });
      await insertRecommendationSamples({
        runId: run.id,
        cellId: newCells[scenario]!,
        providerId: "deepseek",
        targetRank: null,
      });
    }

    expect(await recomputeMetrics(run.id)).toBe(18);
    const first = await listMetrics(run.id);
    const lift = (providerId: string, metricKey: string) =>
      first.find(
        (row) =>
          row.scopeType === "recommendation_delta" &&
          row.scopeKey === `${newMessage.id}|${providerId}` &&
          row.metricKey === metricKey,
      );
    expect(lift("mock", "top_k_lift_pp")?.value).toBeCloseTo(50, 8);
    expect(lift("mock", "top_pick_lift_pp")?.value).toBeCloseTo(-50, 8);
    expect(lift("deepseek", "top_k_lift_pp")?.value).toBeCloseTo(-100, 8);
    expect(lift("deepseek", "top_pick_lift_pp")?.value).toBeCloseTo(-100, 8);
    expect(lift("mock", "top_k_lift_pp")?.metadataJson).toMatchObject({
      providerId: "mock",
      scenarioCount: 6,
      directionalOnly: false,
    });

    expect(await recomputeMetrics(run.id)).toBe(18);
    const second = await listMetrics(run.id);
    const stable = (row: (typeof first)[number]) => ({
      scopeType: row.scopeType,
      scopeKey: row.scopeKey,
      metricKey: row.metricKey,
      n: row.n,
      value: row.value,
      ciLow: row.ciLow,
      ciHigh: row.ciHigh,
      metadataJson: row.metadataJson,
    });
    const sort = (a: ReturnType<typeof stable>, b: ReturnType<typeof stable>) =>
      `${a.scopeType}|${a.scopeKey}|${a.metricKey}`.localeCompare(
        `${b.scopeType}|${b.scopeKey}|${b.metricKey}`,
      );
    expect(second.map(stable).sort(sort)).toEqual(first.map(stable).sort(sort));
  });
});
