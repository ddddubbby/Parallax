import { z } from "zod";

/**
 * M34A (D-099): human-reviewed framing evidence, not automated framing
 * certification. This module deliberately contains no embeddings, clustering,
 * prevalence threshold, or semantic eligibility rule. It validates the
 * auditable workflow that makes an analyst's judgement visible instead.
 */

export const FRAMING_LANES = ["neutral_elicited", "organic_in_context"] as const;
export type FramingLane = (typeof FRAMING_LANES)[number];

export const FRAMING_RESPONSE_STATES = [
  "ok",
  "no_frame",
  "uncertain",
  "insufficient_evidence",
  "entity_ambiguous",
  "malformed",
  "extraction_failed",
  "generation_unavailable",
] as const;
export type FramingResponseState = (typeof FRAMING_RESPONSE_STATES)[number];

export const RESPONSE_REVIEW_OUTCOMES = [
  "coded",
  "no_relevant_association",
  "other",
  "ambiguous",
  "entity_ambiguous",
  "no_frame",
  "uncertain",
  "insufficient_evidence",
  "generation_unavailable",
] as const;
export type ResponseReviewOutcome = (typeof RESPONSE_REVIEW_OUTCOMES)[number];

export const REVIEW_METHODS = [
  "single_analyst",
  "intra_rater_consistency",
  "machine_discrepancy_check",
  "inter_rater_reliability",
] as const;
export type ReviewMethod = (typeof REVIEW_METHODS)[number];

export const CONSISTENCY_CHECK_TYPES = [
  "intra_rater_consistency",
  "machine_discrepancy_check",
  "inter_rater_reliability",
] as const;
export type ConsistencyCheckType = (typeof CONSISTENCY_CHECK_TYPES)[number];

export const GAP_CLASSIFICATIONS = [
  "reinforced",
  "missing",
  "misframed",
  "unsupported",
  "non_actionable",
] as const;
export type GapClassificationKind = (typeof GAP_CLASSIFICATIONS)[number];

const timestampSchema = z.string().min(1);

export const framingResponseSchema = z.object({
  responseId: z.string().min(1),
  rawText: z.string().min(1).nullable(),
  lane: z.enum(FRAMING_LANES),
  promptVariant: z.string().min(1),
  promptText: z.string().min(1),
  providerId: z.string().min(1),
  modelVersion: z.string().min(1),
  generationMode: z.enum(["grounded", "ungrounded"]),
  observedAt: timestampSchema,
  terminalState: z.enum(FRAMING_RESPONSE_STATES),
}).superRefine((response, ctx) => {
  if (response.terminalState === "generation_unavailable" && response.rawText !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "generation_unavailable responses must not fabricate raw text", path: ["rawText"] });
  }
  if (response.terminalState !== "generation_unavailable" && response.rawText === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "stored responses require immutable raw text", path: ["rawText"] });
  }
});
export type FramingResponse = z.infer<typeof framingResponseSchema>;

export const framingStudySchema = z.object({
  studyId: z.string().min(1),
  projectId: z.string().min(1),
  projectLabel: z.string().min(1),
  observedBrandName: z.string().min(1),
  promptProtocolVersion: z.string().min(1),
  createdAt: timestampSchema,
  responses: z.array(framingResponseSchema).min(1),
});
export type FramingStudy = z.infer<typeof framingStudySchema>;

export const codebookAssociationSchema = z.object({
  associationId: z.string().min(1),
  label: z.string().min(1),
  definition: z.string().min(1),
});
export type CodebookAssociation = z.infer<typeof codebookAssociationSchema>;

export const codebookDraftSchema = z.object({
  codebookId: z.string().min(1),
  studyId: z.string().min(1),
  discoveryPacketId: z.string().min(1),
  version: z.string().min(1),
  createdBy: z.string().min(1),
  createdAt: timestampSchema,
  associations: z.array(codebookAssociationSchema).min(1),
});
export type CodebookDraft = z.infer<typeof codebookDraftSchema>;

export const lockedCodebookSchema = codebookDraftSchema.extend({
  status: z.literal("locked"),
  lockedAt: timestampSchema,
});
export type LockedCodebook = z.infer<typeof lockedCodebookSchema>;

export const positioningRevealSchema = z.object({
  studyId: z.string().min(1),
  codebookId: z.string().min(1),
  codebookVersion: z.string().min(1),
  revealedAt: timestampSchema,
  revealedBy: z.string().min(1),
  positioningDigest: z.string().min(1),
  factSheetDigest: z.string().min(1),
});
export type PositioningReveal = z.infer<typeof positioningRevealSchema>;

export const responseReviewSchema = z.object({
  responseId: z.string().min(1),
  outcome: z.enum(RESPONSE_REVIEW_OUTCOMES),
  reviewedBy: z.string().min(1),
  reviewedAt: timestampSchema,
});
export type ResponseReview = z.infer<typeof responseReviewSchema>;

export const annotationProposalSources = ["human_raw_read", "ai_span_assist"] as const;
export type AnnotationProposalSource = (typeof annotationProposalSources)[number];

export const framingAnnotationSchema = z.object({
  annotationId: z.string().min(1),
  responseId: z.string().min(1),
  associationId: z.string().min(1).nullable(),
  decision: z.enum(["accepted", "rejected"]),
  proposalSource: z.enum(annotationProposalSources),
  start: z.number().int().nonnegative().nullable(),
  end: z.number().int().nonnegative().nullable(),
  reviewedBy: z.string().min(1),
  reviewedAt: timestampSchema,
  note: z.string().max(500).nullable(),
});
export type FramingAnnotation = z.infer<typeof framingAnnotationSchema>;

export const consistencyCheckSchema = z.object({
  checkId: z.string().min(1),
  type: z.enum(CONSISTENCY_CHECK_TYPES),
  status: z.enum(["not_run", "completed"]),
  comparisonCount: z.number().int().nonnegative(),
  agreementCount: z.number().int().nonnegative(),
  completedAt: timestampSchema.nullable(),
  reviewerDescription: z.string().min(1),
  note: z.string().min(1),
});
export type ConsistencyCheck = z.infer<typeof consistencyCheckSchema>;

export const codingRecordSchema = z.object({
  codingRunId: z.string().min(1),
  studyId: z.string().min(1),
  codebookId: z.string().min(1),
  codebookVersion: z.string().min(1),
  reviewerId: z.string().min(1),
  reviewMethod: z.enum(REVIEW_METHODS),
  createdAt: timestampSchema,
  responseReviews: z.array(responseReviewSchema),
  annotations: z.array(framingAnnotationSchema),
  consistencyChecks: z.array(consistencyCheckSchema),
});
export type CodingRecord = z.infer<typeof codingRecordSchema>;

export interface BlindDiscoveryPacket {
  packetVersion: "m34a-blind-discovery-packet.v1";
  packetId: string;
  studyId: string;
  createdAt: string;
  instructions: string[];
  items: Array<{ blindId: string; rawText: string }>;
}

export interface BlindDiscoveryKey {
  packetVersion: "m34a-blind-discovery-key.v1";
  packetId: string;
  studyId: string;
  entries: Array<{ blindId: string; responseId: string }>;
}

export interface RecurrenceScope {
  providerId: string;
  modelVersion: string;
  generationMode: "grounded" | "ungrounded";
  responsesContainingAssociation: number;
  denominator: number;
}

export interface RecurrenceRow {
  associationId: string;
  associationLabel: string;
  responsesContainingAssociation: number;
  denominator: number;
  promptVariantsContainingAssociation: string[];
  promptVariantDenominator: number;
  scopes: RecurrenceScope[];
  reviewStatus: "human-reviewed";
}

export interface GapClassification {
  gapId: string;
  kind: GapClassificationKind;
  associationId: string | null;
  targetAssociation: string | null;
  rationale: string;
  factSheetReferences: string[];
  classifiedBy: string;
  classifiedAt: string;
}

export interface SimulationEvidenceSnapshot {
  snapshotVersion: "m34a-simulation-evidence.v1";
  studyId: string;
  projectId: string;
  responseId: string;
  annotationId: string;
  associationId: string;
  evidence: { start: number; end: number; text: string };
  codebook: { id: string; version: string; lockedAt: string };
  codingRun: { id: string; reviewerId: string; reviewMethod: ReviewMethod };
  reveal: { revealedAt: string; revealedBy: string };
  recurrence: {
    numerator: number;
    denominator: number;
    promptVariantsContainingAssociation: string[];
    promptVariantDenominator: number;
    scopes: RecurrenceScope[];
    label: string;
  };
}

function assertTimestamp(value: string, label: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be a valid timestamp`);
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertStudy(study: FramingStudy): void {
  framingStudySchema.parse(study);
  assertUnique(study.responses.map((response) => response.responseId), "responseId");
  for (const response of study.responses) assertTimestamp(response.observedAt, `response ${response.responseId} observedAt`);
}

function rankBlindItem(seed: string, responseId: string): number {
  let hash = 2166136261;
  for (const char of `${seed}|${responseId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Produces a packet with raw text only. The key is intentionally separate so
 * the discovery packet cannot expose provenance, frequencies, or candidates.
 */
export function createBlindDiscoveryPacket(input: {
  study: FramingStudy;
  responseIds: string[];
  packetId: string;
  createdAt: string;
  shuffleSeed: string;
}): { packet: BlindDiscoveryPacket; key: BlindDiscoveryKey } {
  assertStudy(input.study);
  assertTimestamp(input.createdAt, "packet createdAt");
  assertUnique(input.responseIds, "discovery responseId");
  const byId = new Map(input.study.responses.map((response) => [response.responseId, response]));
  const selected = input.responseIds.map((responseId) => {
    const response = byId.get(responseId);
    if (!response) throw new Error(`Discovery response is not in study: ${responseId}`);
    return response;
  });
  const ordered = [...selected].sort((a, b) => {
    const rank = rankBlindItem(input.shuffleSeed, a.responseId) - rankBlindItem(input.shuffleSeed, b.responseId);
    return rank !== 0 ? rank : a.responseId.localeCompare(b.responseId);
  });
  const entries = ordered.map((response, index) => ({
    blindId: `blind-${String(index + 1).padStart(3, "0")}`,
    responseId: response.responseId,
  }));
  return {
    packet: {
      packetVersion: "m34a-blind-discovery-packet.v1",
      packetId: input.packetId,
      studyId: input.study.studyId,
      createdAt: input.createdAt,
      instructions: [
        "Code only the response text supplied here.",
        "Do not use client positioning, desired attributes, fact sheet, response frequency, or simulation candidates.",
        "Develop a small association codebook; other, ambiguous, and no relevant association are valid outcomes.",
      ],
      items: ordered.map((response, index) => {
        if (response.rawText === null) throw new Error(`Discovery packet cannot include unavailable response ${response.responseId}`);
        return { blindId: entries[index]!.blindId, rawText: response.rawText };
      }),
    },
    key: {
      packetVersion: "m34a-blind-discovery-key.v1",
      packetId: input.packetId,
      studyId: input.study.studyId,
      entries,
    },
  };
}

export function lockCodebook(input: CodebookDraft & { lockedAt: string }): LockedCodebook {
  codebookDraftSchema.parse(input);
  assertTimestamp(input.createdAt, "codebook createdAt");
  assertTimestamp(input.lockedAt, "codebook lockedAt");
  if (Date.parse(input.lockedAt) < Date.parse(input.createdAt)) {
    throw new Error("codebook lockedAt cannot precede createdAt");
  }
  assertUnique(input.associations.map((association) => association.associationId), "associationId");
  return { ...input, status: "locked" };
}

export function assertPositioningReveal(input: {
  codebook: LockedCodebook;
  reveal: PositioningReveal;
}): void {
  lockedCodebookSchema.parse(input.codebook);
  positioningRevealSchema.parse(input.reveal);
  if (input.reveal.studyId !== input.codebook.studyId) throw new Error("positioning reveal study does not match codebook");
  if (input.reveal.codebookId !== input.codebook.codebookId || input.reveal.codebookVersion !== input.codebook.version) {
    throw new Error("positioning reveal does not match locked codebook version");
  }
  assertTimestamp(input.codebook.lockedAt, "codebook lockedAt");
  assertTimestamp(input.reveal.revealedAt, "positioning revealedAt");
  if (Date.parse(input.reveal.revealedAt) < Date.parse(input.codebook.lockedAt)) {
    throw new Error("positioning cannot be revealed before the codebook is locked");
  }
}

function validateAcceptedAnnotation(input: {
  annotation: FramingAnnotation;
  response: FramingResponse;
  associationIds: Set<string>;
}): void {
  const { annotation, response, associationIds } = input;
  if (annotation.decision !== "accepted") return;
  if (!annotation.associationId || !associationIds.has(annotation.associationId)) {
    throw new Error(`Accepted annotation ${annotation.annotationId} must reference a locked codebook association`);
  }
  if (response.rawText === null || annotation.start === null || annotation.end === null || annotation.start >= annotation.end || annotation.end > response.rawText.length) {
    throw new Error(`Accepted annotation ${annotation.annotationId} needs an exact in-bounds source span`);
  }
  if (response.rawText.slice(annotation.start, annotation.end).trim().length === 0) {
    throw new Error(`Accepted annotation ${annotation.annotationId} cannot point to blank source text`);
  }
}

/** Verifies that every response, including terminal/abstention states, is in the denominator. */
export function assertCompleteCoding(input: {
  study: FramingStudy;
  codebook: LockedCodebook;
  coding: CodingRecord;
}): void {
  assertStudy(input.study);
  lockedCodebookSchema.parse(input.codebook);
  codingRecordSchema.parse(input.coding);
  if (input.coding.studyId !== input.study.studyId) throw new Error("coding record study does not match");
  if (input.coding.codebookId !== input.codebook.codebookId || input.coding.codebookVersion !== input.codebook.version) {
    throw new Error("coding record does not match the locked codebook version");
  }
  assertTimestamp(input.coding.createdAt, "coding record createdAt");
  if (Date.parse(input.coding.createdAt) < Date.parse(input.codebook.lockedAt)) {
    throw new Error("full-sample coding cannot start before the codebook is locked");
  }
  const responseIds = new Set(input.study.responses.map((response) => response.responseId));
  assertUnique(input.coding.responseReviews.map((review) => review.responseId), "response review responseId");
  if (input.coding.responseReviews.length !== input.study.responses.length) {
    throw new Error("full-sample coding must record one response review for every study response");
  }
  for (const review of input.coding.responseReviews) {
    if (!responseIds.has(review.responseId)) throw new Error(`response review references unknown response ${review.responseId}`);
    assertTimestamp(review.reviewedAt, `response review ${review.responseId} reviewedAt`);
  }
  assertUnique(input.coding.annotations.map((annotation) => annotation.annotationId), "annotationId");
  assertUnique(input.coding.consistencyChecks.map((check) => check.checkId), "consistency check id");
  assertUnique(input.coding.consistencyChecks.map((check) => check.type), "consistency check type");
  for (const check of input.coding.consistencyChecks) {
    if (check.agreementCount > check.comparisonCount) {
      throw new Error(`consistency check ${check.checkId} has more agreements than comparisons`);
    }
    if (check.status === "completed") {
      if (check.comparisonCount === 0 || check.completedAt === null) {
        throw new Error(`completed consistency check ${check.checkId} needs comparisons and completedAt`);
      }
      assertTimestamp(check.completedAt, `consistency check ${check.checkId} completedAt`);
    } else if (check.comparisonCount !== 0 || check.agreementCount !== 0 || check.completedAt !== null) {
      throw new Error(`not-run consistency check ${check.checkId} cannot carry completed results`);
    }
  }
  const responseById = new Map(input.study.responses.map((response) => [response.responseId, response]));
  const associationIds = new Set(input.codebook.associations.map((association) => association.associationId));
  for (const annotation of input.coding.annotations) {
    const response = responseById.get(annotation.responseId);
    if (!response) throw new Error(`annotation ${annotation.annotationId} references unknown response`);
    assertTimestamp(annotation.reviewedAt, `annotation ${annotation.annotationId} reviewedAt`);
    validateAcceptedAnnotation({ annotation, response, associationIds });
  }
  const acceptedResponseIds = new Set(
    input.coding.annotations.filter((annotation) => annotation.decision === "accepted").map((annotation) => annotation.responseId),
  );
  const reviewByResponseId = new Map(input.coding.responseReviews.map((review) => [review.responseId, review]));
  for (const responseId of acceptedResponseIds) {
    if (reviewByResponseId.get(responseId)?.outcome !== "coded") {
      throw new Error(`response ${responseId} has accepted evidence but is not marked coded`);
    }
  }
  for (const review of input.coding.responseReviews) {
    const response = responseById.get(review.responseId)!;
    if (response.terminalState === "generation_unavailable" && review.outcome !== "generation_unavailable") {
      throw new Error(`unavailable response ${review.responseId} must be recorded as generation_unavailable`);
    }
  }
}

export function computeRecurrenceMatrix(input: {
  study: FramingStudy;
  codebook: LockedCodebook;
  coding: CodingRecord;
}): RecurrenceRow[] {
  assertCompleteCoding(input);
  const promptVariants = [...new Set(input.study.responses.map((response) => response.promptVariant))].sort();
  const associationById = new Map(input.codebook.associations.map((association) => [association.associationId, association]));
  const accepted = input.coding.annotations.filter(
    (annotation) => annotation.decision === "accepted" && annotation.associationId !== null,
  );
  return input.codebook.associations.map((association) => {
    const responseIds = new Set(
      accepted.filter((annotation) => annotation.associationId === association.associationId).map((annotation) => annotation.responseId),
    );
    const matchedResponses = input.study.responses.filter((response) => responseIds.has(response.responseId));
    const scopeMap = new Map<string, RecurrenceScope>();
    for (const response of input.study.responses) {
      const key = `${response.providerId}|${response.modelVersion}|${response.generationMode}`;
      const prior = scopeMap.get(key) ?? {
        providerId: response.providerId,
        modelVersion: response.modelVersion,
        generationMode: response.generationMode,
        responsesContainingAssociation: 0,
        denominator: 0,
      };
      prior.denominator += 1;
      if (responseIds.has(response.responseId)) prior.responsesContainingAssociation += 1;
      scopeMap.set(key, prior);
    }
    return {
      associationId: association.associationId,
      associationLabel: associationById.get(association.associationId)!.label,
      responsesContainingAssociation: responseIds.size,
      denominator: input.study.responses.length,
      promptVariantsContainingAssociation: [...new Set(matchedResponses.map((response) => response.promptVariant))].sort(),
      promptVariantDenominator: promptVariants.length,
      scopes: [...scopeMap.values()].sort((a, b) =>
        `${a.providerId}|${a.modelVersion}|${a.generationMode}`.localeCompare(`${b.providerId}|${b.modelVersion}|${b.generationMode}`),
      ),
      reviewStatus: "human-reviewed",
    };
  });
}

export function assertGapClassifications(input: {
  codebook: LockedCodebook;
  reveal: PositioningReveal;
  classifications: GapClassification[];
}): void {
  assertPositioningReveal({ codebook: input.codebook, reveal: input.reveal });
  const associationIds = new Set(input.codebook.associations.map((association) => association.associationId));
  assertUnique(input.classifications.map((classification) => classification.gapId), "gapId");
  for (const classification of input.classifications) {
    if (!GAP_CLASSIFICATIONS.includes(classification.kind)) throw new Error(`Unknown gap classification ${classification.kind}`);
    assertTimestamp(classification.classifiedAt, `gap ${classification.gapId} classifiedAt`);
    if (Date.parse(classification.classifiedAt) < Date.parse(input.reveal.revealedAt)) {
      throw new Error(`gap ${classification.gapId} cannot be classified before positioning reveal`);
    }
    if (classification.kind === "missing") {
      if (!classification.targetAssociation) throw new Error(`missing gap ${classification.gapId} requires targetAssociation`);
      continue;
    }
    if (!classification.associationId || !associationIds.has(classification.associationId)) {
      throw new Error(`gap ${classification.gapId} must reference a locked codebook association`);
    }
  }
}

export function createSimulationEvidenceSnapshot(input: {
  study: FramingStudy;
  codebook: LockedCodebook;
  coding: CodingRecord;
  reveal: PositioningReveal;
  responseId: string;
  annotationId: string;
}): SimulationEvidenceSnapshot {
  assertCompleteCoding(input);
  assertPositioningReveal({ codebook: input.codebook, reveal: input.reveal });
  const annotation = input.coding.annotations.find((candidate) => candidate.annotationId === input.annotationId);
  if (!annotation || annotation.decision !== "accepted" || !annotation.associationId) {
    throw new Error("simulation handoff requires an accepted reviewed annotation");
  }
  if (annotation.responseId !== input.responseId) throw new Error("simulation response does not match the selected annotation");
  const response = input.study.responses.find((candidate) => candidate.responseId === input.responseId);
  if (!response || response.rawText === null || annotation.start === null || annotation.end === null) throw new Error("simulation handoff source evidence is missing");
  const recurrence = computeRecurrenceMatrix(input).find((row) => row.associationId === annotation.associationId);
  if (!recurrence) throw new Error("simulation handoff association is absent from the recurrence matrix");
  const label = recurrence.responsesContainingAssociation <= 1
    ? "SINGLE OBSERVED INSTANCE"
    : `OBSERVED IN ${recurrence.responsesContainingAssociation}/${recurrence.denominator} RESPONSES`;
  return {
    snapshotVersion: "m34a-simulation-evidence.v1",
    studyId: input.study.studyId,
    projectId: input.study.projectId,
    responseId: response.responseId,
    annotationId: annotation.annotationId,
    associationId: annotation.associationId,
    evidence: {
      start: annotation.start,
      end: annotation.end,
      text: response.rawText.slice(annotation.start, annotation.end),
    },
    codebook: { id: input.codebook.codebookId, version: input.codebook.version, lockedAt: input.codebook.lockedAt },
    codingRun: { id: input.coding.codingRunId, reviewerId: input.coding.reviewerId, reviewMethod: input.coding.reviewMethod },
    reveal: { revealedAt: input.reveal.revealedAt, revealedBy: input.reveal.revealedBy },
    recurrence: {
      numerator: recurrence.responsesContainingAssociation,
      denominator: recurrence.denominator,
      promptVariantsContainingAssociation: recurrence.promptVariantsContainingAssociation,
      promptVariantDenominator: recurrence.promptVariantDenominator,
      scopes: recurrence.scopes,
      label,
    },
  };
}
