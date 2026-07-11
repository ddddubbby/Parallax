import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  REPRESENTATION_PROMPTS,
  REPRESENTATION_PROMPT_PROTOCOL_VERSION,
} from "@/core/prompt-templates";
import { renderRepresentationTemplate } from "@/core/matrix";
import { renderFramingReportMarkdown } from "@/core/framing-report";
import { buildFramingReport } from "@/modules/framing/report";
import { db, pool } from "../client";
import {
  auditRuns,
  brands,
  factClaims,
  framingAnnotations,
  framingEvidenceSnapshots,
  framingGapClassifications,
  framingResponseReviews,
  framingStudies,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
  resonanceStimuli,
  resonanceStudies,
} from "../schema";
import { forceDeleteMatrixVersions, forceDeletePromptCellsByIds } from "./matrix.test-helpers";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  getResonanceStudy,
  updateResonanceStimulus,
} from "./resonance";
import {
  completeFramingReview,
  computeFramingRecurrence,
  createFramingStudy,
  createFramingEvidenceSnapshot,
  getBlindDiscoveryPacket,
  getFramingStudy,
  getFramingReviewRows,
  listFramingStudies,
  listFramingEvidenceSnapshots,
  lockFramingCodebook,
  revealFramingPositioning,
  saveFramingCodebookDraft,
  saveFramingGapClassifications,
  saveFramingResponseReview,
  verifyFramingEvidenceSnapshotRecord,
} from "./framing";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const made = {
  projectIds: [] as string[],
  brandIds: [] as string[],
  factIds: [] as string[],
  versionIds: [] as string[],
  cellIds: [] as string[],
  runIds: [] as string[],
  jobIds: [] as string[],
  responseIds: [] as string[],
  studyIds: [] as string[],
  resonanceStudyIds: [] as string[],
  resonanceVersionIds: [] as string[],
};

async function forceDeleteSnapshotsForStudy(studyId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.bypass_framing_snapshot_freeze = 'on'`);
    await tx
      .delete(framingEvidenceSnapshots)
      .where(eq(framingEvidenceSnapshots.framingStudyId, studyId));
  });
}

async function forceDeleteStimuliForStudy(studyId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.bypass_resonance_stimulus_freeze = 'on'`);
    await tx.delete(resonanceStimuli).where(eq(resonanceStimuli.studyId, studyId));
  });
}

afterAll(async () => {
  if (made.resonanceVersionIds.length > 0) {
    await forceDeleteMatrixVersions(made.resonanceVersionIds).catch(() => {});
  }
  for (const studyId of made.resonanceStudyIds) {
    await forceDeleteStimuliForStudy(studyId).catch(() => {});
    await db.delete(resonanceStudies).where(eq(resonanceStudies.id, studyId)).catch(() => {});
  }
  for (const studyId of made.studyIds) {
    await forceDeleteSnapshotsForStudy(studyId).catch(() => {});
    const reviewIds = (
      await db
        .select({ id: framingResponseReviews.id })
        .from(framingResponseReviews)
        .where(eq(framingResponseReviews.framingStudyId, studyId))
    ).map((row) => row.id);
    for (const reviewId of reviewIds) {
      await db
        .delete(framingAnnotations)
        .where(eq(framingAnnotations.responseReviewId, reviewId))
        .catch(() => {});
    }
    await db
      .delete(framingGapClassifications)
      .where(eq(framingGapClassifications.framingStudyId, studyId))
      .catch(() => {});
    await db
      .delete(framingResponseReviews)
      .where(eq(framingResponseReviews.framingStudyId, studyId))
      .catch(() => {});
    await db.delete(framingStudies).where(eq(framingStudies.id, studyId)).catch(() => {});
  }
  for (const responseId of made.responseIds) {
    await db.delete(responses).where(eq(responses.id, responseId)).catch(() => {});
  }
  for (const jobId of made.jobIds) {
    await db.delete(jobs).where(eq(jobs.id, jobId)).catch(() => {});
  }
  for (const runId of made.runIds) {
    await db.delete(auditRuns).where(eq(auditRuns.id, runId)).catch(() => {});
  }
  if (made.cellIds.length > 0) await forceDeletePromptCellsByIds(made.cellIds).catch(() => {});
  for (const versionId of made.versionIds) {
    await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId)).catch(() => {});
  }
  for (const factId of made.factIds) {
    await db.delete(factClaims).where(eq(factClaims.id, factId)).catch(() => {});
  }
  for (const brandId of made.brandIds) {
    await db.delete(brands).where(eq(brands.id, brandId)).catch(() => {});
  }
  for (const projectId of made.projectIds) {
    await db.delete(projects).where(eq(projects.id, projectId)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

async function createSourceAudit() {
  const suffix = randomUUID().slice(0, 8);
  const [project] = await db
    .insert(projects)
    .values({
      name: `M34A framing repository ${suffix}`,
      slug: `m34a-framing-repository-${suffix}`,
      category: "action cameras",
      categoryArchetype: "consumer_product",
      jobToBeDone: "understand the AI brand narrative",
      status: "active",
    })
    .returning();
  made.projectIds.push(project.id);
  const [brand] = await db
    .insert(brands)
    .values({ projectId: project.id, role: "client", name: "LensLoop" })
    .returning();
  made.brandIds.push(brand.id);
  const [fact] = await db
    .insert(factClaims)
    .values({
      projectId: project.id,
      type: "feature",
      statement: "LensLoop exports direct-to-share flat video.",
      sourceNote: "Product fact sheet",
    })
    .returning();
  made.factIds.push(fact.id);
  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId: project.id,
      version: 1,
      state: "draft",
      kind: "audit",
      cellCount: 5,
    })
    .returning();
  made.versionIds.push(version.id);
  const cells = await db
    .insert(promptCells)
    .values(
      REPRESENTATION_PROMPTS.map((prompt) => ({
        matrixVersionId: version.id,
        intent: "representation" as const,
        personaId: null,
        marketId: null,
        variantKey: prompt.variantKey,
        resolvedText: renderRepresentationTemplate(prompt.text, brand.name),
        competitorOrderJson: [],
      })),
    )
    .returning();
  made.cellIds.push(...cells.map((cell) => cell.id));
  await db
    .update(matrixVersions)
    .set({ state: "approved", approvedAt: new Date() })
    .where(eq(matrixVersions.id, version.id));
  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "live_audit",
      state: "completed",
      repetitions: 5,
      selectedProvidersJson: ["deepseek"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 6,
      costCapUsd: "0",
      completedAt: new Date(),
    })
    .returning();
  made.runIds.push(run.id);

  const rawTexts = [
    "LensLoop is known for durable action cameras.",
    "It is durable durable.",
    "LensLoop makes compact cameras for outdoor recording.",
    "LensLoop offers stabilized video tools.",
    "LensLoop is an action-camera company.",
  ];
  for (const [index, cell] of cells.entries()) {
    const [job] = await db
      .insert(jobs)
      .values({
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        repIndex: 0,
        state: "succeeded",
      })
      .returning();
    made.jobIds.push(job.id);
    const [response] = await db
      .insert(responses)
      .values({
        jobId: job.id,
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        modelVersion: "deepseek-framing-v1",
        rawText: rawTexts[index]!,
      })
      .returning();
    made.responseIds.push(response.id);
  }
  const [unavailableJob] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cells[0]!.id,
      providerId: "deepseek",
      generationMode: "ungrounded",
      repIndex: 1,
      state: "dead_lettered",
      lastErrorType: "timeout",
    })
    .returning();
  made.jobIds.push(unavailableJob.id);
  return { project, run, fact };
}

describe.skipIf(!dbUp)("M34A framing production repository", () => {
  it("enforces blind lock/reveal ordering, complete denominators, exact spans, and manual gaps", async () => {
    const { project, run, fact } = await createSourceAudit();
    const study = await createFramingStudy(project.id, run.id);
    made.studyIds.push(study.id);
    expect(study.promptProtocolVersion).toBe(REPRESENTATION_PROMPT_PROTOCOL_VERSION);

    const listed = await listFramingStudies(project.id);
    expect(listed.find((row) => row.id === study.id)).toMatchObject({
      denominator: 6,
      reviewed: 1,
      state: "draft",
    });
    expect(await getFramingStudy(randomUUID(), study.id)).toBeNull();

    const packet = await getBlindDiscoveryPacket(project.id, study.id);
    expect(packet?.items).toHaveLength(5);
    expect(JSON.stringify(packet)).not.toMatch(/providerId|variantKey|responseId|promptText/);

    const associations = [
      {
        associationId: "durability",
        label: "Durability",
        definition: "The answer associates LensLoop with durable equipment.",
      },
      {
        associationId: "action-camera-category",
        label: "Action-camera category",
        definition: "The answer identifies LensLoop as an action-camera company.",
      },
    ];
    await saveFramingCodebookDraft({
      projectId: project.id,
      studyId: study.id,
      createdBy: "analyst-1",
      associations,
    });
    await expect(
      revealFramingPositioning({
        projectId: project.id,
        studyId: study.id,
        positioningText: "CLIENT-SUPPLIED POSITIONING — Direct-to-share action video without mandatory reframing.",
        revealedBy: "analyst-1",
        reviewerIdentity: "analyst-1",
        reviewMethod: "single_analyst",
      }),
    ).rejects.toThrow(/after the codebook is locked/i);
    await expect(lockFramingCodebook(project.id, study.id, false)).rejects.toThrow(/attestation/i);
    const locked = await lockFramingCodebook(project.id, study.id, true);
    expect(locked.state).toBe("codebook_locked");
    await expect(
      revealFramingPositioning({
        projectId: project.id,
        studyId: study.id,
        positioningText: "CLIENT-SUPPLIED POSITIONING — Direct-to-share action video.",
        revealedBy: "analyst-1",
        reviewerIdentity: "analyst-1",
        reviewMethod: "inter_rater_reliability",
      }),
    ).rejects.toThrow(/structured verification record/i);
    await expect(
      saveFramingCodebookDraft({
        projectId: project.id,
        studyId: study.id,
        createdBy: "analyst-1",
        associations,
      }),
    ).rejects.toThrow(/only a draft/i);
    const revealed = await revealFramingPositioning({
      projectId: project.id,
      studyId: study.id,
      positioningText: "CLIENT-SUPPLIED POSITIONING — Direct-to-share action video without mandatory reframing.",
      revealedBy: "analyst-1",
      reviewerIdentity: "analyst-1",
      reviewMethod: "single_analyst",
    });
    expect(revealed.revealedAt!.getTime()).toBeGreaterThanOrEqual(
      revealed.codebookLockedAt!.getTime(),
    );

    const reviews = await getFramingReviewRows(project.id, study.id);
    const available = reviews.filter((review) => review.responseId !== null);
    const unavailable = reviews.find((review) => review.responseId === null)!;
    expect(unavailable.outcome).toBe("generation_unavailable");
    await saveFramingResponseReview({
      projectId: project.id,
      studyId: study.id,
      reviewId: available[0]!.id,
      outcome: "coded",
      reviewedBy: "analyst-1",
      annotations: [
        {
          associationId: "durability",
          decision: "accepted",
          proposalSource: "human_raw_read",
          quote: "durable action cameras",
        },
      ],
    });
    await expect(
      saveFramingResponseReview({
        projectId: project.id,
        studyId: study.id,
        reviewId: available[1]!.id,
        outcome: "coded",
        reviewedBy: "analyst-1",
        annotations: [
          {
            associationId: "durability",
            decision: "accepted",
            proposalSource: "ai_span_assist",
            quote: "It is durable durable.",
          },
        ],
      }),
    ).rejects.toThrow(/structured proposal record/i);
    await expect(
      saveFramingResponseReview({
        projectId: project.id,
        studyId: study.id,
        reviewId: available[1]!.id,
        outcome: "coded",
        reviewedBy: "analyst-1",
        annotations: [
          {
            associationId: "durability",
            decision: "accepted",
            proposalSource: "human_raw_read",
            quote: "durable",
          },
        ],
      }),
    ).rejects.toThrow(/more than once/i);
    await saveFramingResponseReview({
      projectId: project.id,
      studyId: study.id,
      reviewId: available[1]!.id,
      outcome: "coded",
      reviewedBy: "analyst-1",
      annotations: [
        {
          associationId: "durability",
          decision: "accepted",
          proposalSource: "human_raw_read",
          quote: "It is durable durable.",
        },
      ],
    });
    await expect(completeFramingReview(project.id, study.id)).rejects.toThrow(/pending/i);
    for (const review of available.slice(2)) {
      await saveFramingResponseReview({
        projectId: project.id,
        studyId: study.id,
        reviewId: review.id,
        outcome: "none",
        reviewedBy: "analyst-1",
        annotations: [],
      });
    }
    const completed = await completeFramingReview(project.id, study.id);
    expect(completed.state).toBe("completed");

    const recurrence = await computeFramingRecurrence(project.id, study.id);
    expect(recurrence.find((row) => row.associationId === "durability")).toMatchObject({
      responsesContainingAssociation: 2,
      denominator: 6,
      promptVariantsContainingAssociation: ["a1", "a2"],
      promptVariantDenominator: 5,
      reviewStatus: "human-reviewed",
    });
    expect(recurrence[0]!.scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ modelVersion: "generation_unavailable", denominator: 1 }),
        expect.objectContaining({ modelVersion: "deepseek-framing-v1", denominator: 5 }),
      ]),
    );

    await expect(
      saveFramingGapClassifications({
        projectId: project.id,
        studyId: study.id,
        classifiedBy: "analyst-1",
        gapOutcome: "actionable_gap_identified",
        gaps: [
          {
            classification: "missing",
            associationId: "durability",
            missingTarget: "Direct-to-share flat video",
            rationale: "The intended story did not appear.",
            factReferences: [fact.id],
          },
        ],
      }),
    ).rejects.toThrow(/never invent/i);
    await expect(
      saveFramingGapClassifications({
        projectId: project.id,
        studyId: study.id,
        classifiedBy: "analyst-1",
        gapOutcome: "actionable_gap_identified",
        gaps: [
          {
            classification: "missing",
            associationId: null,
            missingTarget: "Direct-to-share flat video",
            rationale: "The intended story did not appear.",
            factReferences: [randomUUID()],
          },
        ],
      }),
    ).rejects.toThrow(/fact-sheet snapshot/i);
    await expect(
      saveFramingGapClassifications({
        projectId: project.id,
        studyId: study.id,
        classifiedBy: "analyst-1",
        gapOutcome: "actionable_gap_identified",
        gaps: [
          {
            classification: "missing",
            associationId: null,
            missingTarget: "Direct-to-share flat video",
            rationale: "The intended story did not appear.",
            factReferences: [fact.id],
          },
          {
            classification: "reinforced",
            associationId: "durability",
            missingTarget: null,
            rationale: "Durability appeared in two reviewed answers.",
            factReferences: [],
          },
        ],
      }),
    ).resolves.toBe(2);
    expect((await getFramingStudy(project.id, study.id))?.gaps).toHaveLength(2);
    const report = await buildFramingReport(project.id, study.id);
    expect(report).toMatchObject({
      denominator: 6,
      availableResponses: 5,
      unavailableJobs: 1,
      positioningSource: "client-supplied",
      promptProtocolVersion: REPRESENTATION_PROMPT_PROTOCOL_VERSION,
    });
    const markdown = renderFramingReportMarkdown(report!);
    expect(markdown).toContain("What is LensLoop?");
    expect(markdown).toContain("2/6");
    expect(markdown).toContain("single analyst");
    const completedDetail = await getFramingStudy(project.id, study.id);
    const acceptedAnnotationId = completedDetail!.reviews
      .flatMap((review) => review.annotations)
      .find((annotation) => annotation.decision === "accepted")!.id;
    const actionableGapId = completedDetail!.gaps
      .find((gap) => gap.classification === "missing")!.id;
    for (const nonClientMode of ["mock", "live_validation"] as const) {
      await db.update(auditRuns).set({ runMode: nonClientMode }).where(eq(auditRuns.id, run.id));
      await expect(createFramingEvidenceSnapshot({
        projectId: project.id,
        studyId: study.id,
        annotationId: acceptedAnnotationId,
        gapClassificationId: actionableGapId,
      })).rejects.toThrow(/live audit/i);
    }
    await db.update(auditRuns).set({ runMode: "live_audit" }).where(eq(auditRuns.id, run.id));
    const handoff = await createFramingEvidenceSnapshot({
      projectId: project.id,
      studyId: study.id,
      annotationId: acceptedAnnotationId,
      gapClassificationId: actionableGapId,
    });
    expect(handoff.payload).toMatchObject({
      projectId: project.id,
      studyId: study.id,
      verbatimResponse: "LensLoop is known for durable action cameras.",
      evidence: { text: "durable action cameras" },
      recurrence: { numerator: 2, denominator: 6, label: "OBSERVED IN 2/6 SOURCE JOBS" },
    });
    expect(await listFramingEvidenceSnapshots(project.id)).toHaveLength(1);
    const [sameHandoffA, sameHandoffB] = await Promise.all([
      createFramingEvidenceSnapshot({
        projectId: project.id,
        studyId: study.id,
        annotationId: acceptedAnnotationId,
        gapClassificationId: actionableGapId,
      }),
      createFramingEvidenceSnapshot({
        projectId: project.id,
        studyId: study.id,
        annotationId: acceptedAnnotationId,
        gapClassificationId: actionableGapId,
      }),
    ]);
    expect(sameHandoffA.snapshot.id).toBe(handoff.snapshot.id);
    expect(sameHandoffB.snapshot.id).toBe(handoff.snapshot.id);
    expect(await listFramingEvidenceSnapshots(project.id)).toHaveLength(1);
    await expect(
      db.update(framingEvidenceSnapshots)
        .set({ sha256: "tampered" })
        .where(eq(framingEvidenceSnapshots.id, handoff.snapshot.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/i) } });
    await expect(
      db.delete(framingEvidenceSnapshots)
        .where(eq(framingEvidenceSnapshots.id, handoff.snapshot.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/i) } });
    expect(() => verifyFramingEvidenceSnapshotRecord({
      ...handoff.snapshot,
      evidenceJson: { ...handoff.payload, verbatimResponse: "tampered" },
    })).toThrow(/hash|offsets/i);

    const simulation = await createResonanceStudy(project.id, "M34A snapshot handoff");
    made.resonanceStudyIds.push(simulation.id);
    await expect(addResonanceStimulus({
      projectId: project.id,
      studyId: simulation.id,
      kind: "measured_ai",
      label: "Measured baseline",
      body: "operator-authored text must not survive",
      evidenceResponseIds: [],
    })).rejects.toThrow(/reviewed framing snapshot/i);
    const baseline = await addResonanceStimulus({
      projectId: project.id,
      studyId: simulation.id,
      kind: "measured_ai",
      label: "Measured baseline",
      body: "operator-authored text must not survive",
      evidenceResponseIds: [],
      framingEvidenceSnapshotId: handoff.snapshot.id,
    });
    await addResonanceStimulus({
      projectId: project.id,
      studyId: simulation.id,
      kind: "corrected",
      label: "Corrected framing",
      body: "LensLoop exports direct-to-share flat video.",
      evidenceResponseIds: [],
    });
    const [storedBaseline] = await db
      .select()
      .from(resonanceStimuli)
      .where(eq(resonanceStimuli.id, baseline.id));
    expect(storedBaseline).toMatchObject({
      body: handoff.payload.verbatimResponse,
      evidenceResponseIdsJson: [handoff.payload.responseId],
      framingEvidenceSnapshotId: handoff.snapshot.id,
    });
    await db
      .update(resonanceStimuli)
      .set({ body: "tampered after handoff" })
      .where(eq(resonanceStimuli.id, baseline.id));
    await expect(approveAndCompileResonanceStudy(project.id, simulation.id)).rejects.toThrow(/byte-equal/i);
    await updateResonanceStimulus({
      projectId: project.id,
      studyId: simulation.id,
      stimulusId: baseline.id,
      kind: "measured_ai",
      label: "Measured baseline",
      body: "still ignored",
      evidenceResponseIds: [],
      framingEvidenceSnapshotId: handoff.snapshot.id,
    });
    const compiled = await approveAndCompileResonanceStudy(project.id, simulation.id);
    made.resonanceVersionIds.push(compiled.id);
    expect((await getResonanceStudy(project.id, simulation.id))?.baselineProvenance).toMatchObject({
      status: "snapshot",
      snapshotId: handoff.snapshot.id,
      numerator: 2,
      denominator: 6,
      promptSpread: 2,
      promptDenominator: 5,
    });
    await expect(
      db.update(resonanceStimuli)
        .set({ body: "post-approval mutation" })
        .where(eq(resonanceStimuli.id, baseline.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/frozen/i) } });
    await expect(
      db.delete(resonanceStimuli).where(eq(resonanceStimuli.id, baseline.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/frozen/i) } });
  }, 30_000);

  it("rejects B2B framing studies even when a source run otherwise has representation cells", async () => {
    const { project, run } = await createSourceAudit();
    await db
      .update(projects)
      .set({ categoryArchetype: "b2b" })
      .where(eq(projects.id, project.id));
    await expect(createFramingStudy(project.id, run.id)).rejects.toThrow(/consumer projects only/i);
  });
});
