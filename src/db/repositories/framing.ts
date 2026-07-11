import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  codebookAssociationSchema,
  GAP_CLASSIFICATIONS,
  resolveUniqueExactQuote,
  REVIEW_METHODS,
  simulationEvidenceSnapshotSchema,
  type CodebookAssociation,
  type GapClassificationKind,
  type RecurrenceRow,
  type ReviewMethod,
  type SimulationEvidenceSnapshot,
} from "@/core/framing-evidence";
import { stableHash } from "@/core/hash";
import {
  REPRESENTATION_PROMPTS,
  REPRESENTATION_PROMPT_PROTOCOL_VERSION,
} from "@/core/prompt-templates";
import { renderRepresentationTemplate } from "@/core/matrix";
import { db } from "../client";
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
} from "../schema";

export const FRAMING_REVIEW_OUTCOMES = [
  "pending",
  "coded",
  "none",
  "other",
  "ambiguous",
  "entity_ambiguous",
  "insufficient_evidence",
  "generation_unavailable",
] as const;
export type FramingReviewOutcome = (typeof FRAMING_REVIEW_OUTCOMES)[number];

export interface FramingReviewAnnotationInput {
  associationId: string;
  decision: "accepted" | "rejected";
  proposalSource: "human_raw_read" | "ai_span_assist";
  quote: string | null;
  note?: string | null;
}

export interface FramingGapInput {
  classification: GapClassificationKind;
  associationId: string | null;
  missingTarget: string | null;
  rationale: string;
  factReferences: string[];
}

export type FramingGapOutcome =
  | "actionable_gap_identified"
  | "no_actionable_gap_identified";

type DiscoveryManifest = {
  version: "m34a-discovery-manifest.v2";
  createdAt: string;
  selected: Array<{
    jobId: string;
    responseId: string;
    variantKey: string;
    rawTextSha256: string;
  }>;
  promptVariantCoverage: string[];
};

export interface FramingReviewRow {
  id: string;
  jobId: string;
  responseId: string | null;
  outcome: FramingReviewOutcome;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  note: string | null;
  variantKey: string;
  promptText: string;
  providerId: string;
  generationMode: "grounded" | "ungrounded";
  repIndex: number;
  jobState: string;
  rawText: string | null;
  modelVersion: string | null;
  observedAt: Date;
  annotations: Array<{
    id: string;
    associationId: string;
    decision: "accepted" | "rejected";
    proposalSource: "human_raw_read" | "ai_span_assist";
    startOffset: number | null;
    endOffset: number | null;
    reviewedBy: string;
    reviewedAt: Date;
    note: string | null;
  }>;
}

function legacySha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function canonicalJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJsonValue(item)]),
    );
  }
  return value;
}

function canonicalSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJsonValue(value)))
    .digest("hex");
}

function digestMatches(value: unknown, digest: string): boolean {
  return canonicalSha256(value) === digest || legacySha256(value) === digest;
}

function parseDiscoveryManifest(value: unknown): DiscoveryManifest {
  if (!value || typeof value !== "object") throw new Error("Discovery manifest is missing");
  const candidate = value as Partial<DiscoveryManifest>;
  if (
    candidate.version !== "m34a-discovery-manifest.v2" ||
    typeof candidate.createdAt !== "string" ||
    !Array.isArray(candidate.selected) ||
    !Array.isArray(candidate.promptVariantCoverage)
  ) {
    throw new Error("Discovery manifest is invalid");
  }
  for (const item of candidate.selected) {
    if (
      !item ||
      typeof item.jobId !== "string" ||
      typeof item.responseId !== "string" ||
      typeof item.variantKey !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.rawTextSha256)
    ) {
      throw new Error("Discovery manifest item is invalid");
    }
  }
  return {
    version: "m34a-discovery-manifest.v2",
    createdAt: candidate.createdAt,
    selected: candidate.selected.map((item) => ({
      jobId: item.jobId,
      responseId: item.responseId,
      variantKey: item.variantKey,
      rawTextSha256: item.rawTextSha256,
    })),
    promptVariantCoverage: [...candidate.promptVariantCoverage],
  };
}

function buildDiscoveryManifest(input: {
  studyId: string;
  rows: Array<{
    jobId: string;
    responseId: string | null;
    variantKey: string;
    rawText: string | null;
  }>;
  createdAt: Date;
}): DiscoveryManifest {
  const available = input.rows.filter(
    (row): row is typeof row & { responseId: string; rawText: string } =>
      row.responseId !== null && row.rawText !== null,
  );
  if (available.length === 0) throw new Error("No stored representation responses are available");
  const rank = (jobId: string) => stableHash(`${input.studyId}|${jobId}`);
  const byVariant = new Map<string, typeof available>();
  for (const row of available) {
    const group = byVariant.get(row.variantKey) ?? [];
    group.push(row);
    byVariant.set(row.variantKey, group);
  }
  const selected: typeof available = [];
  for (const variantKey of [...byVariant.keys()].sort()) {
    const rows = [...(byVariant.get(variantKey) ?? [])].sort(
      (a, b) => rank(a.jobId) - rank(b.jobId) || a.jobId.localeCompare(b.jobId),
    );
    selected.push(...rows.slice(0, 2));
  }
  if (selected.length < 10) {
    const chosen = new Set(selected.map((row) => row.jobId));
    const remaining = available
      .filter((row) => !chosen.has(row.jobId))
      .sort((a, b) => rank(a.jobId) - rank(b.jobId) || a.jobId.localeCompare(b.jobId));
    selected.push(...remaining.slice(0, 10 - selected.length));
  }
  return {
    version: "m34a-discovery-manifest.v2",
    createdAt: input.createdAt.toISOString(),
    selected: selected.slice(0, 10).map((row) => ({
      jobId: row.jobId,
      responseId: row.responseId,
      variantKey: row.variantKey,
      rawTextSha256: createHash("sha256").update(row.rawText).digest("hex"),
    })),
    promptVariantCoverage: [...new Set(selected.slice(0, 10).map((row) => row.variantKey))].sort(),
  };
}

function parseCodebook(value: unknown): CodebookAssociation[] {
  return codebookAssociationSchema.array().min(1).max(20).parse(value);
}

function assertReviewMethod(value: string): asserts value is ReviewMethod {
  if (!(REVIEW_METHODS as readonly string[]).includes(value)) {
    throw new Error("Unknown review method");
  }
}

function assertReviewOutcome(value: string): asserts value is FramingReviewOutcome {
  if (!(FRAMING_REVIEW_OUTCOMES as readonly string[]).includes(value)) {
    throw new Error("Unknown framing review outcome");
  }
}

async function getStudyRow(projectId: string, studyId: string) {
  const [study] = await db
    .select()
    .from(framingStudies)
    .where(and(eq(framingStudies.id, studyId), eq(framingStudies.projectId, projectId)));
  return study ?? null;
}

/** A framing study starts only from a completed consumer audit's five fixed cells. */
export async function createFramingStudy(projectId: string, sourceRunId: string) {
  const [source] = await db
    .select({
      runId: auditRuns.id,
      runState: auditRuns.state,
      matrixVersionId: auditRuns.matrixVersionId,
      matrixKind: matrixVersions.kind,
      projectId: projects.id,
      categoryArchetype: projects.categoryArchetype,
      clientBrand: brands.name,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .innerJoin(projects, eq(projects.id, auditRuns.projectId))
    .innerJoin(
      brands,
      and(eq(brands.projectId, projects.id), eq(brands.role, "client")),
    )
    .where(and(eq(auditRuns.id, sourceRunId), eq(auditRuns.projectId, projectId)));
  if (!source) throw new Error("Completed source audit run not found");
  if (source.runState !== "completed" || source.matrixKind !== "audit") {
    throw new Error("Framing evidence requires a completed audit run");
  }
  if (source.categoryArchetype === "b2b") {
    throw new Error("M34A framing evidence is available for consumer projects only");
  }

  const cells = await db
    .select({
      id: promptCells.id,
      variantKey: promptCells.variantKey,
      resolvedText: promptCells.resolvedText,
      personaId: promptCells.personaId,
      marketId: promptCells.marketId,
      stimulusId: promptCells.stimulusId,
      panelPersonaKey: promptCells.panelPersonaKey,
    })
    .from(promptCells)
    .where(
      and(
        eq(promptCells.matrixVersionId, source.matrixVersionId),
        eq(promptCells.intent, "representation"),
      ),
    )
    .orderBy(asc(promptCells.variantKey));

  const expected = new Map<string, string>(
    REPRESENTATION_PROMPTS.map((prompt) => [
      prompt.variantKey,
      renderRepresentationTemplate(prompt.text, source.clientBrand),
    ]),
  );
  if (cells.length !== REPRESENTATION_PROMPTS.length) {
    throw new Error("Source run must contain all five adopted representation prompts");
  }
  if (new Set(cells.map((cell) => cell.variantKey)).size !== expected.size) {
    throw new Error("Source run must contain each adopted representation prompt exactly once");
  }
  for (const cell of cells) {
    if (
      expected.get(cell.variantKey) !== cell.resolvedText ||
      cell.personaId !== null ||
      cell.marketId !== null ||
      cell.stimulusId !== null ||
      cell.panelPersonaKey !== null
    ) {
      throw new Error("Source run representation cells do not match the pinned prompt protocol");
    }
  }

  const cellIds = cells.map((cell) => cell.id);
  const denominatorRows = await db
    .select({
      jobId: jobs.id,
      cellId: jobs.cellId,
      responseId: responses.id,
      variantKey: promptCells.variantKey,
      rawText: responses.rawText,
    })
    .from(jobs)
    .innerJoin(promptCells, eq(promptCells.id, jobs.cellId))
    .leftJoin(responses, eq(responses.jobId, jobs.id))
    .where(and(eq(jobs.runId, sourceRunId), inArray(jobs.cellId, cellIds)))
    .orderBy(asc(jobs.id));
  if (denominatorRows.length === 0) {
    throw new Error("Source run has no representation jobs to review");
  }
  if (new Set(denominatorRows.map((row) => row.cellId)).size !== cells.length) {
    throw new Error("Source run has no complete job coverage for the five representation prompts");
  }

  return db.transaction(async (tx) => {
    const createdAt = new Date();
    const [study] = await tx
      .insert(framingStudies)
      .values({
        projectId,
        sourceRunId,
        promptProtocolVersion: REPRESENTATION_PROMPT_PROTOCOL_VERSION,
        createdAt,
      })
      .returning();
    const manifest = buildDiscoveryManifest({ studyId: study.id, rows: denominatorRows, createdAt });
    const manifestDigest = canonicalSha256(manifest);
    await tx
      .update(framingStudies)
      .set({ discoveryManifestJson: manifest, discoveryManifestDigest: manifestDigest })
      .where(eq(framingStudies.id, study.id));
    await tx.insert(framingResponseReviews).values(
      denominatorRows.map((row) => ({
        framingStudyId: study.id,
        jobId: row.jobId,
        responseId: row.responseId,
        outcome: row.responseId ? "pending" : "generation_unavailable",
        reviewedBy: row.responseId ? null : "system",
        reviewedAt: row.responseId ? null : new Date(),
        note: row.responseId ? null : "No immutable response was stored for this source job.",
      })),
    );
    return {
      ...study,
      discoveryManifestJson: manifest,
      discoveryManifestDigest: manifestDigest,
    };
  });
}

export async function listFramingStudies(projectId: string) {
  return db
    .select({
      id: framingStudies.id,
      sourceRunId: framingStudies.sourceRunId,
      state: framingStudies.state,
      promptProtocolVersion: framingStudies.promptProtocolVersion,
      reviewerIdentity: framingStudies.reviewerIdentity,
      reviewMethod: framingStudies.reviewMethod,
      createdAt: framingStudies.createdAt,
      completedAt: framingStudies.completedAt,
      denominator: sql<number>`count(${framingResponseReviews.id})::int`,
      reviewed: sql<number>`count(${framingResponseReviews.id}) filter (where ${framingResponseReviews.outcome} <> 'pending')::int`,
    })
    .from(framingStudies)
    .leftJoin(
      framingResponseReviews,
      eq(framingResponseReviews.framingStudyId, framingStudies.id),
    )
    .where(eq(framingStudies.projectId, projectId))
    .groupBy(framingStudies.id)
    .orderBy(sql`${framingStudies.createdAt} desc`);
}

export async function listFramingSourceRuns(projectId: string) {
  const runs = await db
    .select({
      id: auditRuns.id,
      runMode: auditRuns.runMode,
      completedAt: auditRuns.completedAt,
      createdAt: auditRuns.createdAt,
      selectedProvidersJson: auditRuns.selectedProvidersJson,
      selectedModesJson: auditRuns.selectedModesJson,
      repetitions: auditRuns.repetitions,
      matrixVersionId: auditRuns.matrixVersionId,
    })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(auditRuns.state, "completed"),
        eq(matrixVersions.kind, "audit"),
      ),
    )
    .orderBy(sql`${auditRuns.completedAt} desc nulls last`, sql`${auditRuns.createdAt} desc`);
  return Promise.all(
    runs.map(async (run) => {
      const [counts] = await db
        .select({
          representationCells: sql<number>`count(distinct ${promptCells.id})::int`,
          representationJobs: sql<number>`count(distinct ${jobs.id})::int`,
        })
        .from(promptCells)
        .leftJoin(
          jobs,
          and(eq(jobs.cellId, promptCells.id), eq(jobs.runId, run.id)),
        )
        .where(
          and(
            eq(promptCells.matrixVersionId, run.matrixVersionId),
            eq(promptCells.intent, "representation"),
          ),
        );
      return {
        ...run,
        representationCells: counts?.representationCells ?? 0,
        representationJobs: counts?.representationJobs ?? 0,
        ready: counts?.representationCells === 5 && (counts?.representationJobs ?? 0) > 0,
      };
    }),
  );
}

export async function getFramingReviewRows(
  projectId: string,
  studyId: string,
): Promise<FramingReviewRow[]> {
  const study = await getStudyRow(projectId, studyId);
  if (!study) return [];
  const [reviewRows, annotationRows] = await Promise.all([
    db
      .select({
        id: framingResponseReviews.id,
        jobId: framingResponseReviews.jobId,
        responseId: framingResponseReviews.responseId,
        outcome: framingResponseReviews.outcome,
        reviewedBy: framingResponseReviews.reviewedBy,
        reviewedAt: framingResponseReviews.reviewedAt,
        note: framingResponseReviews.note,
        variantKey: promptCells.variantKey,
        promptText: promptCells.resolvedText,
        providerId: jobs.providerId,
        generationMode: jobs.generationMode,
        repIndex: jobs.repIndex,
        jobState: jobs.state,
        rawText: responses.rawText,
        modelVersion: responses.modelVersion,
        observedAt: sql<Date>`coalesce(${responses.createdAt}, ${jobs.updatedAt})`,
      })
      .from(framingResponseReviews)
      .innerJoin(jobs, eq(jobs.id, framingResponseReviews.jobId))
      .innerJoin(promptCells, eq(promptCells.id, jobs.cellId))
      .leftJoin(responses, eq(responses.id, framingResponseReviews.responseId))
      .where(eq(framingResponseReviews.framingStudyId, studyId))
      .orderBy(
        asc(promptCells.variantKey),
        asc(jobs.providerId),
        asc(jobs.generationMode),
        asc(jobs.repIndex),
      ),
    db
      .select()
      .from(framingAnnotations)
      .innerJoin(
        framingResponseReviews,
        eq(framingResponseReviews.id, framingAnnotations.responseReviewId),
      )
      .where(eq(framingResponseReviews.framingStudyId, studyId))
      .orderBy(asc(framingAnnotations.createdAt)),
  ]);
  const annotationsByReview = new Map<string, FramingReviewRow["annotations"]>();
  for (const row of annotationRows) {
    const annotation = row.framing_annotations;
    const items = annotationsByReview.get(annotation.responseReviewId) ?? [];
    items.push({
      id: annotation.id,
      associationId: annotation.associationId,
      decision: annotation.decision as "accepted" | "rejected",
      proposalSource: annotation.proposalSource as "human_raw_read" | "ai_span_assist",
      startOffset: annotation.startOffset,
      endOffset: annotation.endOffset,
      reviewedBy: annotation.reviewedBy,
      reviewedAt: annotation.reviewedAt,
      note: annotation.note,
    });
    annotationsByReview.set(annotation.responseReviewId, items);
  }
  return reviewRows.map((row) => ({
    ...row,
    observedAt: row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt),
    outcome: row.outcome as FramingReviewOutcome,
    providerId: row.providerId,
    generationMode: row.generationMode,
    annotations: annotationsByReview.get(row.id) ?? [],
  }));
}

export async function getFramingStudy(projectId: string, studyId: string) {
  const study = await getStudyRow(projectId, studyId);
  if (!study) return null;
  const [reviews, gaps] = await Promise.all([
    getFramingReviewRows(projectId, studyId),
    db
      .select()
      .from(framingGapClassifications)
      .where(eq(framingGapClassifications.framingStudyId, studyId))
      .orderBy(asc(framingGapClassifications.classifiedAt)),
  ]);
  return {
    study,
    codebook: study.codebookJson as CodebookAssociation[],
    reviews,
    gaps,
  };
}

/** Content-independent deterministic discovery selection; packet contains raw text only. */
export async function getBlindDiscoveryPacket(projectId: string, studyId: string) {
  const detail = await getFramingStudy(projectId, studyId);
  if (!detail) return null;
  if (detail.study.state !== "draft") {
    throw new Error("Blind discovery is available only before the codebook is locked");
  }
  const manifest = parseDiscoveryManifest(detail.study.discoveryManifestJson);
  if (!detail.study.discoveryManifestDigest || !digestMatches(manifest, detail.study.discoveryManifestDigest)) {
    throw new Error("Discovery manifest digest does not match its stored payload");
  }
  const byJobId = new Map(detail.reviews.map((review) => [review.jobId, review]));
  const selected = manifest.selected.map((item) => {
    const review = byJobId.get(item.jobId);
    if (
      !review ||
      review.responseId !== item.responseId ||
      review.rawText === null ||
      createHash("sha256").update(review.rawText).digest("hex") !== item.rawTextSha256
    ) {
      throw new Error("Discovery manifest no longer matches immutable source evidence");
    }
    return review;
  });
  return {
    packetVersion: "m34a-metadata-masked-discovery-packet.v2" as const,
    studyId,
    manifestDigest: detail.study.discoveryManifestDigest,
    instructions: [
      "Code only the response text supplied here.",
      "Do not use client positioning, desired attributes, fact sheet, response frequency, or simulation candidates.",
      "Develop a small association codebook; other, ambiguous, insufficient evidence, and no relevant association are valid outcomes.",
    ],
    items: selected.map((review, index) => ({
      blindId: `blind-${String(index + 1).padStart(3, "0")}`,
      rawText: review.rawText!,
    })),
  };
}

export async function saveFramingCodebookDraft(input: {
  projectId: string;
  studyId: string;
  createdBy: string;
  associations: CodebookAssociation[];
}) {
  const createdBy = input.createdBy.trim();
  if (!createdBy) throw new Error("Codebook creator is required");
  const associations = parseCodebook(input.associations);
  const ids = associations.map((association) => association.associationId);
  if (new Set(ids).size !== ids.length) throw new Error("Codebook association ids must be unique");
  const updated = await db
    .update(framingStudies)
    .set({
      codebookJson: associations,
      codebookCreatedBy: createdBy,
      codebookCreatedAt: sql`coalesce(${framingStudies.codebookCreatedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(framingStudies.id, input.studyId),
        eq(framingStudies.projectId, input.projectId),
        eq(framingStudies.state, "draft"),
      ),
    )
    .returning({ id: framingStudies.id });
  if (updated.length === 0) throw new Error("Only a draft framing study can edit its codebook");
  return updated[0];
}

export async function lockFramingCodebook(
  projectId: string,
  studyId: string,
  discoveryAttested: boolean,
) {
  if (!discoveryAttested) {
    throw new Error("Codebook lock requires the metadata-masked discovery attestation");
  }
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      state: string;
      codebookJson: unknown;
      codebookCreatedBy: string | null;
      codebookCreatedAt: Date | null;
      discoveryManifestJson: unknown;
      discoveryManifestDigest: string | null;
    }>(sql`
      select
        state,
        codebook_json as "codebookJson",
        codebook_created_by as "codebookCreatedBy",
        codebook_created_at as "codebookCreatedAt",
        discovery_manifest_json as "discoveryManifestJson",
        discovery_manifest_digest as "discoveryManifestDigest"
      from ${framingStudies}
      where id = ${studyId} and project_id = ${projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Framing study not found");
    if (study.state !== "draft") throw new Error("Only a draft codebook can be locked");
    parseCodebook(study.codebookJson);
    if (!study.codebookCreatedBy || !study.codebookCreatedAt) {
      throw new Error("Save the codebook creator and associations before locking");
    }
    const manifest = parseDiscoveryManifest(study.discoveryManifestJson);
    if (!study.discoveryManifestDigest || !digestMatches(manifest, study.discoveryManifestDigest)) {
      throw new Error("Discovery manifest is missing or invalid");
    }
    const now = new Date();
    const [updated] = await tx
      .update(framingStudies)
      .set({
        state: "codebook_locked",
        codebookLockedAt: now,
        discoveryAttestedBy: study.codebookCreatedBy,
        discoveryAttestedAt: now,
        updatedAt: now,
      })
      .where(and(eq(framingStudies.id, studyId), eq(framingStudies.state, "draft")))
      .returning();
    return updated;
  });
}

export async function revealFramingPositioning(input: {
  projectId: string;
  studyId: string;
  positioningText: string;
  revealedBy: string;
  reviewerIdentity: string;
  reviewMethod: string;
}) {
  const positioningText = input.positioningText.trim();
  const revealedBy = input.revealedBy.trim();
  const reviewerIdentity = input.reviewerIdentity.trim();
  if (!positioningText || !revealedBy || !reviewerIdentity) {
    throw new Error("Positioning, revealer, and reviewer identity are required");
  }
  if (!/^(CLIENT-SUPPLIED|OFFICIAL-PUBLIC) POSITIONING\b/i.test(positioningText)) {
    throw new Error("Positioning must begin with CLIENT-SUPPLIED POSITIONING or OFFICIAL-PUBLIC POSITIONING");
  }
  assertReviewMethod(input.reviewMethod);
  if (input.reviewMethod !== "single_analyst") {
    throw new Error(
      "Production v1 supports single-analyst review only; consistency or reliability claims require a structured verification record",
    );
  }
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ state: string; codebookLockedAt: Date | null }>(sql`
      select state, codebook_locked_at as "codebookLockedAt"
      from ${framingStudies}
      where id = ${input.studyId} and project_id = ${input.projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Framing study not found");
    if (study.state !== "codebook_locked" || !study.codebookLockedAt) {
      throw new Error("Positioning can be revealed only after the codebook is locked");
    }
    const facts = await tx
      .select({
        id: factClaims.id,
        type: factClaims.type,
        statement: factClaims.statement,
        sourceNote: factClaims.sourceNote,
        sourceUrl: factClaims.sourceUrl,
      })
      .from(factClaims)
      .where(and(eq(factClaims.projectId, input.projectId), eq(factClaims.status, "active")))
      .orderBy(asc(factClaims.id));
    const now = new Date();
    const [updated] = await tx
      .update(framingStudies)
      .set({
        state: "revealed",
        positioningText,
        positioningDigest: canonicalSha256(positioningText),
        factSheetSnapshotJson: facts,
        factSheetDigest: canonicalSha256(facts),
        revealedBy,
        revealedAt: now,
        reviewerIdentity,
        reviewMethod: input.reviewMethod,
        reviewStartedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(framingStudies.id, input.studyId),
          eq(framingStudies.state, "codebook_locked"),
        ),
      )
      .returning();
    return updated;
  });
}

export async function saveFramingResponseReview(input: {
  projectId: string;
  studyId: string;
  reviewId: string;
  outcome: string;
  reviewedBy: string;
  note?: string | null;
  annotations: FramingReviewAnnotationInput[];
}) {
  assertReviewOutcome(input.outcome);
  if (input.outcome === "pending") throw new Error("A saved review needs a terminal outcome");
  const reviewedBy = input.reviewedBy.trim();
  if (!reviewedBy) throw new Error("Reviewer identity is required");
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      state: string;
      codebookJson: unknown;
      reviewerIdentity: string | null;
    }>(sql`
      select state, codebook_json as "codebookJson", reviewer_identity as "reviewerIdentity"
      from ${framingStudies}
      where id = ${input.studyId} and project_id = ${input.projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Framing study not found");
    if (study.state !== "revealed" && study.state !== "reviewing") {
      throw new Error("Full-sample review requires a revealed, unlocked-for-review study");
    }
    if (study.reviewerIdentity !== reviewedBy) {
      throw new Error("Full-sample reviewer must match the disclosed reviewer identity");
    }
    const codebook = parseCodebook(study.codebookJson);
    const associationIds = new Set(codebook.map((association) => association.associationId));
    const [review] = await tx
      .select({
        id: framingResponseReviews.id,
        responseId: framingResponseReviews.responseId,
        rawText: responses.rawText,
      })
      .from(framingResponseReviews)
      .leftJoin(responses, eq(responses.id, framingResponseReviews.responseId))
      .where(
        and(
          eq(framingResponseReviews.id, input.reviewId),
          eq(framingResponseReviews.framingStudyId, input.studyId),
        ),
      );
    if (!review) throw new Error("Response review not found");
    if (!review.responseId || review.rawText === null) {
      if (input.outcome !== "generation_unavailable" || input.annotations.length > 0) {
        throw new Error("Unavailable jobs must remain generation_unavailable without annotations");
      }
    } else if (input.outcome === "generation_unavailable") {
      throw new Error("A stored response cannot be marked generation_unavailable");
    }

    const prepared = input.annotations.map((annotation) => {
      if (annotation.decision !== "accepted" && annotation.decision !== "rejected") {
        throw new Error("Unknown annotation decision");
      }
      if (
        annotation.proposalSource !== "human_raw_read" &&
        annotation.proposalSource !== "ai_span_assist"
      ) {
        throw new Error("Unknown annotation proposal source");
      }
      if (annotation.proposalSource === "ai_span_assist") {
        throw new Error(
          "Production v1 records human raw-text review only; AI span assist requires a structured proposal record",
        );
      }
      if (!associationIds.has(annotation.associationId)) {
        throw new Error(`Annotation references unknown locked association: ${annotation.associationId}`);
      }
      const note = annotation.note?.trim() || null;
      if (note && note.length > 500) throw new Error("Annotation note must be 500 characters or fewer");
      if (!annotation.quote) {
        if (annotation.decision === "accepted") {
          throw new Error("Accepted annotations require a literal evidence quote");
        }
        return { ...annotation, note, startOffset: null, endOffset: null };
      }
      if (review.rawText === null) throw new Error("Unavailable responses cannot carry evidence");
      const offsets = resolveUniqueExactQuote(review.rawText, annotation.quote);
      return { ...annotation, note, startOffset: offsets.start, endOffset: offsets.end };
    });
    const accepted = prepared.filter((annotation) => annotation.decision === "accepted");
    if (input.outcome === "coded" && accepted.length === 0) {
      throw new Error("A coded response needs at least one accepted annotation");
    }
    if (input.outcome !== "coded" && accepted.length > 0) {
      throw new Error("Accepted annotations require the response outcome coded");
    }

    await tx
      .delete(framingAnnotations)
      .where(eq(framingAnnotations.responseReviewId, input.reviewId));
    if (prepared.length > 0) {
      await tx.insert(framingAnnotations).values(
        prepared.map((annotation) => ({
          responseReviewId: input.reviewId,
          associationId: annotation.associationId,
          decision: annotation.decision,
          proposalSource: annotation.proposalSource,
          startOffset: annotation.startOffset,
          endOffset: annotation.endOffset,
          reviewedBy,
          note: annotation.note,
        })),
      );
    }
    const now = new Date();
    await tx
      .update(framingResponseReviews)
      .set({
        outcome: input.outcome,
        reviewedBy,
        reviewedAt: now,
        note: input.note?.trim() || null,
        updatedAt: now,
      })
      .where(eq(framingResponseReviews.id, input.reviewId));
    await tx
      .update(framingStudies)
      .set({ state: "reviewing", updatedAt: now })
      .where(eq(framingStudies.id, input.studyId));
    return { id: input.reviewId };
  });
}

export async function completeFramingReview(projectId: string, studyId: string) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      state: string;
      sourceRunId: string;
      codebookJson: unknown;
      codebookLockedAt: Date | null;
      revealedAt: Date | null;
      reviewerIdentity: string | null;
      reviewMethod: string | null;
    }>(sql`
      select
        state,
        source_run_id as "sourceRunId",
        codebook_json as "codebookJson",
        codebook_locked_at as "codebookLockedAt",
        revealed_at as "revealedAt",
        reviewer_identity as "reviewerIdentity",
        review_method as "reviewMethod"
      from ${framingStudies}
      where id = ${studyId} and project_id = ${projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Framing study not found");
    if (study.state !== "reviewing" && study.state !== "revealed") {
      throw new Error("Only an active full-sample review can be completed");
    }
    const associationIds = new Set(
      parseCodebook(study.codebookJson).map((association) => association.associationId),
    );
    if (
      !study.codebookLockedAt ||
      !study.revealedAt ||
      study.revealedAt < study.codebookLockedAt ||
      !study.reviewerIdentity ||
      !study.reviewMethod
    ) {
      throw new Error("Review provenance is incomplete or reveal ordering is invalid");
    }
    assertReviewMethod(study.reviewMethod);
    const [counts] = await tx
      .select({
        denominator: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${framingResponseReviews.outcome} = 'pending')::int`,
      })
      .from(framingResponseReviews)
      .where(eq(framingResponseReviews.framingStudyId, studyId));
    const [sourceCounts] = await tx
      .select({ denominator: sql<number>`count(*)::int` })
      .from(jobs)
      .innerJoin(promptCells, eq(promptCells.id, jobs.cellId))
      .where(
        and(eq(jobs.runId, study.sourceRunId), eq(promptCells.intent, "representation")),
      );
    if (!counts || counts.denominator === 0 || counts.denominator !== sourceCounts?.denominator) {
      throw new Error("Framing denominator is incomplete relative to the source jobs");
    }
    if (counts.pending > 0) {
      throw new Error(`Review every denominator job before completion (${counts.pending} pending)`);
    }
    const reviewRows = await tx
      .select({
        id: framingResponseReviews.id,
        responseId: framingResponseReviews.responseId,
        outcome: framingResponseReviews.outcome,
        rawText: responses.rawText,
      })
      .from(framingResponseReviews)
      .leftJoin(responses, eq(responses.id, framingResponseReviews.responseId))
      .where(eq(framingResponseReviews.framingStudyId, studyId));
    for (const review of reviewRows) {
      if (
        (review.responseId === null && review.outcome !== "generation_unavailable") ||
        (review.responseId !== null && review.outcome === "generation_unavailable")
      ) {
        throw new Error("Response availability and review outcome disagree");
      }
    }
    const codedWithoutEvidence = await tx.execute<{ id: string }>(sql`
      select r.id
      from ${framingResponseReviews} r
      where r.framing_study_id = ${studyId}
        and r.outcome = 'coded'
        and not exists (
          select 1 from ${framingAnnotations} a
          where a.response_review_id = r.id and a.decision = 'accepted'
        )
      limit 1
    `);
    if (codedWithoutEvidence.rows.length > 0) {
      throw new Error("Every coded response needs accepted exact-span evidence");
    }
    const acceptedRows = await tx
      .select({
        associationId: framingAnnotations.associationId,
        startOffset: framingAnnotations.startOffset,
        endOffset: framingAnnotations.endOffset,
        rawText: responses.rawText,
      })
      .from(framingAnnotations)
      .innerJoin(
        framingResponseReviews,
        eq(framingResponseReviews.id, framingAnnotations.responseReviewId),
      )
      .innerJoin(responses, eq(responses.id, framingResponseReviews.responseId))
      .where(
        and(
          eq(framingResponseReviews.framingStudyId, studyId),
          eq(framingAnnotations.decision, "accepted"),
        ),
      );
    for (const annotation of acceptedRows) {
      if (!associationIds.has(annotation.associationId)) {
        throw new Error("Accepted evidence references an association outside the locked codebook");
      }
      const start = annotation.startOffset;
      const end = annotation.endOffset;
      if (start === null || end === null || start < 0 || end <= start || end > annotation.rawText.length) {
        throw new Error("Accepted evidence offsets are outside the immutable response");
      }
      const quote = annotation.rawText.slice(start, end);
      resolveUniqueExactQuote(annotation.rawText, quote);
    }
    const now = new Date();
    const [updated] = await tx
      .update(framingStudies)
      .set({ state: "completed", completedAt: now, updatedAt: now })
      .where(eq(framingStudies.id, studyId))
      .returning();
    return updated;
  });
}

export async function computeFramingRecurrence(
  projectId: string,
  studyId: string,
): Promise<RecurrenceRow[]> {
  const detail = await getFramingStudy(projectId, studyId);
  if (!detail) throw new Error("Framing study not found");
  if (detail.reviews.some((review) => review.outcome === "pending")) {
    throw new Error("Recurrence requires a complete denominator review");
  }
  const codebook = parseCodebook(detail.study.codebookJson);
  const denominator = detail.reviews.length;
  const promptVariants = [...new Set(detail.reviews.map((review) => review.variantKey))].sort();
  return codebook.map((association) => {
    const matched = detail.reviews.filter((review) =>
      review.annotations.some(
        (annotation) =>
          annotation.decision === "accepted" &&
          annotation.associationId === association.associationId,
      ),
    );
    const matchedIds = new Set(matched.map((review) => review.id));
    const scopes = new Map<string, RecurrenceRow["scopes"][number]>();
    for (const review of detail.reviews) {
      const modelVersion = review.modelVersion ?? "generation_unavailable";
      const key = `${review.providerId}|${modelVersion}|${review.generationMode}`;
      const scope = scopes.get(key) ?? {
        providerId: review.providerId,
        modelVersion,
        generationMode: review.generationMode,
        responsesContainingAssociation: 0,
        denominator: 0,
      };
      scope.denominator += 1;
      if (matchedIds.has(review.id)) scope.responsesContainingAssociation += 1;
      scopes.set(key, scope);
    }
    return {
      associationId: association.associationId,
      associationLabel: association.label,
      responsesContainingAssociation: matched.length,
      denominator,
      promptVariantsContainingAssociation: [
        ...new Set(matched.map((review) => review.variantKey)),
      ].sort(),
      promptVariantDenominator: promptVariants.length,
      scopes: [...scopes.values()].sort((a, b) =>
        `${a.providerId}|${a.modelVersion}|${a.generationMode}`.localeCompare(
          `${b.providerId}|${b.modelVersion}|${b.generationMode}`,
        ),
      ),
      reviewStatus: "human-reviewed",
    };
  });
}

export async function saveFramingGapClassifications(input: {
  projectId: string;
  studyId: string;
  classifiedBy: string;
  gapOutcome: FramingGapOutcome;
  gaps: FramingGapInput[];
}) {
  const classifiedBy = input.classifiedBy.trim();
  if (!classifiedBy) throw new Error("Gap analyst identity is required");
  if (input.gaps.length === 0) throw new Error("Gap review needs at least one explicit decision");
  if (
    input.gapOutcome !== "actionable_gap_identified" &&
    input.gapOutcome !== "no_actionable_gap_identified"
  ) {
    throw new Error("Unknown gap review outcome");
  }
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      state: string;
      codebookJson: unknown;
      factSheetSnapshotJson: unknown;
    }>(sql`
      select
        state,
        codebook_json as "codebookJson",
        fact_sheet_snapshot_json as "factSheetSnapshotJson"
      from ${framingStudies}
      where id = ${input.studyId} and project_id = ${input.projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Framing study not found");
    if (study.state !== "completed") {
      throw new Error("Actionable gaps can be classified only after full-sample review");
    }
    const associationIds = new Set(
      parseCodebook(study.codebookJson).map((association) => association.associationId),
    );
    const facts = (Array.isArray(study.factSheetSnapshotJson) ? study.factSheetSnapshotJson : [])
      .map((fact) => fact as { id?: unknown; sourceNote?: unknown; sourceUrl?: unknown })
      .filter((fact): fact is { id: string; sourceNote?: string | null; sourceUrl?: string | null } =>
        typeof fact.id === "string",
      );
    const factIds = new Set(facts.map((fact) => fact.id));
    const factById = new Map(facts.map((fact) => [fact.id, fact]));
    const rows = input.gaps.map((gap) => {
      if (!(GAP_CLASSIFICATIONS as readonly string[]).includes(gap.classification)) {
        throw new Error(`Unknown gap classification: ${gap.classification}`);
      }
      const rationale = gap.rationale.trim();
      if (!rationale) throw new Error("Every gap classification needs a rationale");
      if (gap.classification === "missing") {
        if (gap.associationId !== null || !gap.missingTarget?.trim()) {
          throw new Error("Missing gaps name a target and never invent an observed association");
        }
      } else if (!gap.associationId || !associationIds.has(gap.associationId) || gap.missingTarget !== null) {
        throw new Error("Observed gap classifications must reference a locked association");
      }
      const unknownFacts = gap.factReferences.filter((id) => !factIds.has(id));
      if (unknownFacts.length > 0) {
        throw new Error("Gap fact references must come from the revealed fact-sheet snapshot");
      }
      if (gap.classification === "unsupported") {
        if (gap.factReferences.length === 0) {
          throw new Error("Unsupported gaps require a sourced fact-sheet reference");
        }
        const hasSourcedFact = gap.factReferences.some((id) => {
          const fact = factById.get(id);
          return Boolean(fact?.sourceNote?.trim() || fact?.sourceUrl?.trim());
        });
        if (!hasSourcedFact) {
          throw new Error("Unsupported gaps require a fact with a source note or URL");
        }
      }
      return {
        framingStudyId: input.studyId,
        classification: gap.classification,
        associationId: gap.associationId,
        missingTarget: gap.missingTarget?.trim() || null,
        rationale,
        factReferencesJson: gap.factReferences,
        classifiedBy,
      };
    });
    const actionable = rows.filter((row) =>
      row.classification === "missing" ||
      row.classification === "misframed" ||
      row.classification === "unsupported",
    );
    if (input.gapOutcome === "actionable_gap_identified" && actionable.length === 0) {
      throw new Error("Actionable gap outcome requires a missing, misframed, or unsupported decision");
    }
    if (input.gapOutcome === "no_actionable_gap_identified") {
      if (actionable.length > 0) {
        throw new Error("No-actionable-gap outcome cannot contain an actionable decision");
      }
      if (!rows.some((row) => row.classification === "non_actionable")) {
        throw new Error("No-actionable-gap outcome requires an explicit non-actionable decision");
      }
    }
    await tx
      .delete(framingGapClassifications)
      .where(eq(framingGapClassifications.framingStudyId, input.studyId));
    if (rows.length > 0) await tx.insert(framingGapClassifications).values(rows);
    const now = new Date();
    await tx
      .update(framingStudies)
      .set({
        gapOutcome: input.gapOutcome,
        gapCompletedBy: classifiedBy,
        gapCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(framingStudies.id, input.studyId));
    return rows.length;
  });
}

export function framingEvidenceSnapshotSha256(payload: SimulationEvidenceSnapshot): string {
  return canonicalSha256(payload);
}

export function verifyFramingEvidenceSnapshotRecord(record: {
  projectId: string;
  framingStudyId: string;
  annotationId: string;
  gapClassificationId?: string | null;
  responseId: string;
  evidenceJson: unknown;
  sha256: string;
}): SimulationEvidenceSnapshot {
  const payload = simulationEvidenceSnapshotSchema.parse(record.evidenceJson);
  if (
    payload.projectId !== record.projectId ||
    payload.studyId !== record.framingStudyId ||
    payload.annotationId !== record.annotationId ||
    payload.responseId !== record.responseId
  ) {
    throw new Error("Framing evidence snapshot linkage does not match its immutable payload");
  }
  if (
    payload.snapshotVersion === "m34a-simulation-evidence.v2" &&
    record.gapClassificationId !== payload.gap.id
  ) {
    throw new Error("Framing evidence snapshot gap linkage does not match its immutable payload");
  }
  if (!digestMatches(payload, record.sha256)) {
    throw new Error("Framing evidence snapshot hash does not match its immutable payload");
  }
  return payload;
}

export async function createFramingEvidenceSnapshot(input: {
  projectId: string;
  studyId: string;
  annotationId: string;
  gapClassificationId: string;
}) {
  const isoTimestamp = (value: Date | string) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  const detail = await getFramingStudy(input.projectId, input.studyId);
  if (!detail || detail.study.state !== "completed") {
    throw new Error("Simulation handoff requires a completed framing review");
  }
  if (
    detail.study.gapOutcome !== "actionable_gap_identified" ||
    !detail.study.gapCompletedAt ||
    !detail.study.gapCompletedBy
  ) {
    throw new Error("Simulation handoff requires a completed actionable-gap decision");
  }
  const [sourceRun] = await db
    .select({
      id: auditRuns.id,
      runMode: auditRuns.runMode,
      repetitions: auditRuns.repetitions,
    })
    .from(auditRuns)
    .where(
      and(
        eq(auditRuns.id, detail.study.sourceRunId),
        eq(auditRuns.projectId, input.projectId),
      ),
    );
  if (!sourceRun || sourceRun.runMode !== "live_audit") {
    throw new Error("Only a completed live audit may create a client-ready Simulation handoff");
  }
  const gap = detail.gaps.find((candidate) => candidate.id === input.gapClassificationId);
  if (
    !gap ||
    (gap.classification !== "missing" &&
      gap.classification !== "misframed" &&
      gap.classification !== "unsupported")
  ) {
    throw new Error("Simulation handoff requires a selected actionable gap from this study");
  }
  const review = detail.reviews.find((candidate) =>
    candidate.annotations.some((annotation) => annotation.id === input.annotationId),
  );
  const annotation = review?.annotations.find((candidate) => candidate.id === input.annotationId);
  if (
    !review ||
    !annotation ||
    annotation.decision !== "accepted" ||
    review.outcome !== "coded" ||
    !review.responseId ||
    review.rawText === null ||
    review.modelVersion === null ||
    annotation.startOffset === null ||
    annotation.endOffset === null
  ) {
    throw new Error("Simulation handoff requires an accepted reviewed annotation with immutable source text");
  }
  const recurrence = (await computeFramingRecurrence(input.projectId, input.studyId))
    .find((row) => row.associationId === annotation.associationId);
  if (!recurrence) throw new Error("Selected association is absent from the recurrence matrix");
  if (
    gap.classification !== "missing" &&
    gap.associationId !== annotation.associationId
  ) {
    throw new Error("Observed actionable gap must match the selected evidence association");
  }
  const association = detail.codebook.find(
    (candidate) => candidate.associationId === annotation.associationId,
  );
  if (!association) throw new Error("Selected association is absent from the locked codebook");
  const evidenceText = review.rawText.slice(annotation.startOffset, annotation.endOffset);
  resolveUniqueExactQuote(review.rawText, evidenceText);
  const recurrenceLabel = recurrence.responsesContainingAssociation <= 1
    ? "SINGLE OBSERVED INSTANCE"
    : `OBSERVED IN ${recurrence.responsesContainingAssociation}/${recurrence.denominator} SOURCE JOBS`;
  if (
    !detail.study.codebookLockedAt ||
    !detail.study.revealedAt ||
    !detail.study.revealedBy ||
    !detail.study.positioningDigest ||
    !detail.study.factSheetDigest ||
    !detail.study.reviewerIdentity ||
    !detail.study.reviewMethod ||
    !detail.study.discoveryManifestDigest ||
    !detail.study.discoveryAttestedBy ||
    !detail.study.discoveryAttestedAt
  ) {
    throw new Error("Framing review provenance is incomplete");
  }
  assertReviewMethod(detail.study.reviewMethod);
  const factSnapshot = (Array.isArray(detail.study.factSheetSnapshotJson)
    ? detail.study.factSheetSnapshotJson
    : []) as Array<{
      id?: unknown;
      statement?: unknown;
      sourceNote?: unknown;
      sourceUrl?: unknown;
    }>;
  const requestedFactIds = new Set(
    Array.isArray(gap.factReferencesJson) ? gap.factReferencesJson as string[] : [],
  );
  const factReferences = factSnapshot
    .filter((fact) => typeof fact.id === "string" && requestedFactIds.has(fact.id))
    .map((fact) => ({
      id: fact.id as string,
      statement: typeof fact.statement === "string" ? fact.statement : "",
      sourceNote: typeof fact.sourceNote === "string" ? fact.sourceNote : null,
      sourceUrl: typeof fact.sourceUrl === "string" ? fact.sourceUrl : null,
    }));
  const availableResponses = detail.reviews.filter((candidate) => candidate.responseId !== null).length;
  const unavailableJobs = detail.reviews.length - availableResponses;
  const payload = simulationEvidenceSnapshotSchema.parse({
    snapshotVersion: "m34a-simulation-evidence.v2",
    studyId: detail.study.id,
    projectId: detail.study.projectId,
    promptProtocolVersion: detail.study.promptProtocolVersion,
    responseId: review.responseId,
    annotationId: annotation.id,
    associationId: annotation.associationId,
    verbatimResponse: review.rawText,
    evidence: {
      start: annotation.startOffset,
      end: annotation.endOffset,
      text: evidenceText,
    },
    association: {
      id: association.associationId,
      label: association.label,
      definition: association.definition,
    },
    gap: {
      id: gap.id,
      classification: gap.classification,
      subject: gap.classification === "missing"
        ? gap.missingTarget
        : association.label,
      rationale: gap.rationale,
      factReferences,
    },
    codebook: {
      id: detail.study.codebookId,
      version: String(detail.study.codebookVersion),
      lockedAt: detail.study.codebookLockedAt.toISOString(),
    },
    codingRun: {
      id: detail.study.id,
      reviewerId: detail.study.reviewerIdentity,
      reviewMethod: detail.study.reviewMethod,
    },
    discovery: {
      manifestDigest: detail.study.discoveryManifestDigest,
      attestedBy: detail.study.discoveryAttestedBy,
      attestedAt: detail.study.discoveryAttestedAt.toISOString(),
    },
    reveal: {
      revealedAt: detail.study.revealedAt.toISOString(),
      revealedBy: detail.study.revealedBy,
      positioningDigest: detail.study.positioningDigest,
      factSheetDigest: detail.study.factSheetDigest,
    },
    source: {
      auditRunId: sourceRun.id,
      runMode: sourceRun.runMode,
      repetitions: sourceRun.repetitions,
      promptVariant: review.variantKey,
      promptText: review.promptText,
      providerId: review.providerId,
      modelVersion: review.modelVersion,
      generationMode: review.generationMode,
      observedAt: isoTimestamp(review.observedAt),
    },
    recurrence: {
      denominatorUnit: "source_jobs",
      numerator: recurrence.responsesContainingAssociation,
      denominator: recurrence.denominator,
      availableResponses,
      unavailableJobs,
      promptVariantsContainingAssociation: recurrence.promptVariantsContainingAssociation,
      promptVariantDenominator: recurrence.promptVariantDenominator,
      scopes: recurrence.scopes,
      label: recurrenceLabel,
    },
  });
  const inserted = await db
    .insert(framingEvidenceSnapshots)
    .values({
      projectId: input.projectId,
      framingStudyId: input.studyId,
      annotationId: input.annotationId,
      gapClassificationId: input.gapClassificationId,
      responseId: review.responseId,
      evidenceJson: payload,
      sha256: framingEvidenceSnapshotSha256(payload),
    })
    .onConflictDoNothing()
    .returning();
  const snapshot = inserted[0] ?? (await db
    .select()
    .from(framingEvidenceSnapshots)
    .where(
      and(
        eq(framingEvidenceSnapshots.annotationId, input.annotationId),
        eq(framingEvidenceSnapshots.gapClassificationId, input.gapClassificationId),
      ),
    ))[0];
  if (!snapshot) throw new Error("Simulation evidence snapshot could not be created");
  const storedPayload = verifyFramingEvidenceSnapshotRecord(snapshot);
  return { snapshot, payload: storedPayload };
}

export async function listFramingEvidenceSnapshots(projectId: string) {
  const rows = await db
    .select()
    .from(framingEvidenceSnapshots)
    .where(eq(framingEvidenceSnapshots.projectId, projectId))
    .orderBy(sql`${framingEvidenceSnapshots.createdAt} desc`);
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    payload: verifyFramingEvidenceSnapshotRecord(row),
  }));
}
