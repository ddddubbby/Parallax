import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  REPRESENTATION_PROMPTS,
  REPRESENTATION_PROMPT_PROTOCOL_VERSION,
} from "@/core/prompt-templates";
import { renderRepresentationTemplate } from "@/core/matrix";
import { db, pool } from "../client";
import {
  auditRuns,
  brands,
  factClaims,
  framingAnnotations,
  framingGapClassifications,
  framingResponseReviews,
  framingStudies,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
} from "../schema";
import { forceDeletePromptCellsByIds } from "./matrix.test-helpers";
import {
  completeFramingReview,
  computeFramingRecurrence,
  createFramingStudy,
  getBlindDiscoveryPacket,
  getFramingStudy,
  getFramingReviewRows,
  listFramingStudies,
  lockFramingCodebook,
  revealFramingPositioning,
  saveFramingCodebookDraft,
  saveFramingGapClassifications,
  saveFramingResponseReview,
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
};

afterAll(async () => {
  for (const studyId of made.studyIds) {
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
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
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
        providerId: "mock",
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
        providerId: "mock",
        generationMode: "ungrounded",
        modelVersion: "mock-framing-v1",
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
      providerId: "mock",
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
        positioningText: "Direct-to-share action video without mandatory reframing.",
        revealedBy: "analyst-1",
        reviewerIdentity: "analyst-1",
        reviewMethod: "single_analyst",
      }),
    ).rejects.toThrow(/after the codebook is locked/i);
    const locked = await lockFramingCodebook(project.id, study.id);
    expect(locked.state).toBe("codebook_locked");
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
      positioningText: "Direct-to-share action video without mandatory reframing.",
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
          proposalSource: "ai_span_assist",
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
        expect.objectContaining({ modelVersion: "mock-framing-v1", denominator: 5 }),
      ]),
    );

    await expect(
      saveFramingGapClassifications({
        projectId: project.id,
        studyId: study.id,
        classifiedBy: "analyst-1",
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
