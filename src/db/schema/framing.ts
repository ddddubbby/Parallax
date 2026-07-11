import { sql } from "drizzle-orm";
import {
  check,
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./intake";
import { auditRuns, jobs, responses } from "./runs";

/**
 * M34A's human-reviewed framing workflow. Semantic coding remains human
 * judgment; these tables preserve ordering, denominator, and provenance.
 */
export const framingStudies = pgTable(
  "framing_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sourceRunId: uuid("source_run_id")
      .notNull()
      .references((): AnyPgColumn => auditRuns.id),
    state: text("state").notNull().default("draft"),
    promptProtocolVersion: text("prompt_protocol_version").notNull(),
    codebookId: uuid("codebook_id").defaultRandom().notNull(),
    codebookVersion: integer("codebook_version").notNull().default(1),
    codebookJson: jsonb("codebook_json").notNull().default([]),
    codebookCreatedBy: text("codebook_created_by"),
    codebookCreatedAt: timestamp("codebook_created_at", { withTimezone: true }),
    codebookLockedAt: timestamp("codebook_locked_at", { withTimezone: true }),
    discoveryManifestJson: jsonb("discovery_manifest_json"),
    discoveryManifestDigest: text("discovery_manifest_digest"),
    discoveryAttestedBy: text("discovery_attested_by"),
    discoveryAttestedAt: timestamp("discovery_attested_at", { withTimezone: true }),
    positioningText: text("positioning_text"),
    positioningDigest: text("positioning_digest"),
    factSheetSnapshotJson: jsonb("fact_sheet_snapshot_json"),
    factSheetDigest: text("fact_sheet_digest"),
    revealedBy: text("revealed_by"),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    reviewerIdentity: text("reviewer_identity"),
    reviewMethod: text("review_method"),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    gapOutcome: text("gap_outcome"),
    gapCompletedBy: text("gap_completed_by"),
    gapCompletedAt: timestamp("gap_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("framing_studies_project_idx").on(t.projectId),
    index("framing_studies_source_run_idx").on(t.sourceRunId),
    uniqueIndex("framing_studies_codebook_version_uq").on(
      t.codebookId,
      t.codebookVersion,
    ),
    check(
      "framing_studies_state_ck",
      sql`${t.state} in ('draft', 'codebook_locked', 'revealed', 'reviewing', 'completed')`,
    ),
    check("framing_studies_codebook_version_ck", sql`${t.codebookVersion} > 0`),
    check(
      "framing_studies_gap_outcome_ck",
      sql`${t.gapOutcome} is null or ${t.gapOutcome} in ('actionable_gap_identified', 'no_actionable_gap_identified')`,
    ),
  ],
);

export const framingResponseReviews = pgTable(
  "framing_response_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    framingStudyId: uuid("framing_study_id")
      .notNull()
      .references(() => framingStudies.id),
    jobId: uuid("job_id")
      .notNull()
      .references((): AnyPgColumn => jobs.id),
    responseId: uuid("response_id").references((): AnyPgColumn => responses.id),
    outcome: text("outcome").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("framing_response_reviews_study_job_uq").on(
      t.framingStudyId,
      t.jobId,
    ),
    index("framing_response_reviews_study_outcome_idx").on(
      t.framingStudyId,
      t.outcome,
    ),
    index("framing_response_reviews_response_idx").on(t.responseId),
    check(
      "framing_response_reviews_outcome_ck",
      sql`${t.outcome} in ('pending', 'coded', 'none', 'other', 'ambiguous', 'entity_ambiguous', 'insufficient_evidence', 'generation_unavailable')`,
    ),
  ],
);

export const framingAnnotations = pgTable(
  "framing_annotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responseReviewId: uuid("response_review_id")
      .notNull()
      .references((): AnyPgColumn => framingResponseReviews.id),
    associationId: text("association_id").notNull(),
    decision: text("decision").notNull(),
    proposalSource: text("proposal_source").notNull(),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    reviewedBy: text("reviewed_by").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("framing_annotations_review_idx").on(t.responseReviewId),
    index("framing_annotations_association_idx").on(t.associationId),
    check(
      "framing_annotations_decision_ck",
      sql`${t.decision} in ('accepted', 'rejected')`,
    ),
    check(
      "framing_annotations_proposal_source_ck",
      sql`${t.proposalSource} in ('human_raw_read', 'ai_span_assist')`,
    ),
    check(
      "framing_annotations_accepted_offsets_ck",
      sql`${t.decision} <> 'accepted' or (${t.startOffset} is not null and ${t.endOffset} is not null and ${t.startOffset} >= 0 and ${t.endOffset} > ${t.startOffset})`,
    ),
  ],
);

export const framingGapClassifications = pgTable(
  "framing_gap_classifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    framingStudyId: uuid("framing_study_id")
      .notNull()
      .references(() => framingStudies.id),
    classification: text("classification").notNull(),
    associationId: text("association_id"),
    missingTarget: text("missing_target"),
    rationale: text("rationale").notNull(),
    factReferencesJson: jsonb("fact_references_json").notNull().default([]),
    classifiedBy: text("classified_by").notNull(),
    classifiedAt: timestamp("classified_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("framing_gap_classifications_study_idx").on(t.framingStudyId),
    check(
      "framing_gap_classifications_kind_ck",
      sql`${t.classification} in ('reinforced', 'missing', 'misframed', 'unsupported', 'non_actionable')`,
    ),
    check(
      "framing_gap_classifications_subject_ck",
      sql`(${t.classification} = 'missing' and ${t.associationId} is null and nullif(btrim(${t.missingTarget}), '') is not null) or (${t.classification} <> 'missing' and nullif(btrim(${t.associationId}), '') is not null and ${t.missingTarget} is null)`,
    ),
  ],
);

export const framingEvidenceSnapshots = pgTable(
  "framing_evidence_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    framingStudyId: uuid("framing_study_id")
      .notNull()
      .references(() => framingStudies.id),
    annotationId: uuid("annotation_id")
      .notNull()
      .references((): AnyPgColumn => framingAnnotations.id),
    gapClassificationId: uuid("gap_classification_id").references(
      (): AnyPgColumn => framingGapClassifications.id,
    ),
    responseId: uuid("response_id")
      .notNull()
      .references((): AnyPgColumn => responses.id),
    evidenceJson: jsonb("evidence_json").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("framing_evidence_snapshots_project_idx").on(t.projectId),
    index("framing_evidence_snapshots_study_idx").on(t.framingStudyId),
    index("framing_evidence_snapshots_response_idx").on(t.responseId),
    uniqueIndex("framing_evidence_snapshots_handoff_uq")
      .on(t.annotationId, t.gapClassificationId)
      .where(sql`${t.gapClassificationId} is not null`),
    check(
      "framing_evidence_snapshots_sha256_ck",
      sql`${t.sha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
