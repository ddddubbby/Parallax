CREATE TABLE "framing_annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_review_id" uuid NOT NULL,
	"association_id" text NOT NULL,
	"decision" text NOT NULL,
	"proposal_source" text NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"reviewed_by" text NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_annotations_decision_ck" CHECK ("framing_annotations"."decision" in ('accepted', 'rejected')),
	CONSTRAINT "framing_annotations_proposal_source_ck" CHECK ("framing_annotations"."proposal_source" in ('human_raw_read', 'ai_span_assist')),
	CONSTRAINT "framing_annotations_accepted_offsets_ck" CHECK ("framing_annotations"."decision" <> 'accepted' or ("framing_annotations"."start_offset" is not null and "framing_annotations"."end_offset" is not null and "framing_annotations"."start_offset" >= 0 and "framing_annotations"."end_offset" > "framing_annotations"."start_offset"))
);
--> statement-breakpoint
CREATE TABLE "framing_evidence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"framing_study_id" uuid NOT NULL,
	"annotation_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"evidence_json" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_evidence_snapshots_sha256_ck" CHECK ("framing_evidence_snapshots"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "framing_gap_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framing_study_id" uuid NOT NULL,
	"classification" text NOT NULL,
	"association_id" text,
	"missing_target" text,
	"rationale" text NOT NULL,
	"fact_references_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"classified_by" text NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_gap_classifications_kind_ck" CHECK ("framing_gap_classifications"."classification" in ('reinforced', 'missing', 'misframed', 'unsupported', 'non_actionable')),
	CONSTRAINT "framing_gap_classifications_subject_ck" CHECK (("framing_gap_classifications"."classification" = 'missing' and "framing_gap_classifications"."association_id" is null and nullif(btrim("framing_gap_classifications"."missing_target"), '') is not null) or ("framing_gap_classifications"."classification" <> 'missing' and nullif(btrim("framing_gap_classifications"."association_id"), '') is not null and "framing_gap_classifications"."missing_target" is null))
);
--> statement-breakpoint
CREATE TABLE "framing_response_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framing_study_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"response_id" uuid,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_response_reviews_outcome_ck" CHECK ("framing_response_reviews"."outcome" in ('pending', 'coded', 'none', 'ambiguous', 'entity_ambiguous', 'generation_unavailable'))
);
--> statement-breakpoint
CREATE TABLE "framing_studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_run_id" uuid NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"prompt_protocol_version" text NOT NULL,
	"codebook_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"codebook_version" integer DEFAULT 1 NOT NULL,
	"codebook_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"codebook_created_by" text,
	"codebook_created_at" timestamp with time zone,
	"codebook_locked_at" timestamp with time zone,
	"positioning_text" text,
	"positioning_digest" text,
	"fact_sheet_snapshot_json" jsonb,
	"fact_sheet_digest" text,
	"revealed_by" text,
	"revealed_at" timestamp with time zone,
	"reviewer_identity" text,
	"review_method" text,
	"review_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_studies_state_ck" CHECK ("framing_studies"."state" in ('draft', 'codebook_locked', 'revealed', 'reviewing', 'completed')),
	CONSTRAINT "framing_studies_codebook_version_ck" CHECK ("framing_studies"."codebook_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "prompt_cells" DROP CONSTRAINT "prompt_cells_audit_resonance_shape_ck";--> statement-breakpoint
ALTER TABLE "resonance_stimuli" ADD COLUMN "framing_evidence_snapshot_id" uuid;--> statement-breakpoint
ALTER TABLE "framing_annotations" ADD CONSTRAINT "framing_annotations_response_review_id_framing_response_reviews_id_fk" FOREIGN KEY ("response_review_id") REFERENCES "public"."framing_response_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD CONSTRAINT "framing_evidence_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD CONSTRAINT "framing_evidence_snapshots_framing_study_id_framing_studies_id_fk" FOREIGN KEY ("framing_study_id") REFERENCES "public"."framing_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD CONSTRAINT "framing_evidence_snapshots_annotation_id_framing_annotations_id_fk" FOREIGN KEY ("annotation_id") REFERENCES "public"."framing_annotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD CONSTRAINT "framing_evidence_snapshots_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_gap_classifications" ADD CONSTRAINT "framing_gap_classifications_framing_study_id_framing_studies_id_fk" FOREIGN KEY ("framing_study_id") REFERENCES "public"."framing_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_response_reviews" ADD CONSTRAINT "framing_response_reviews_framing_study_id_framing_studies_id_fk" FOREIGN KEY ("framing_study_id") REFERENCES "public"."framing_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_response_reviews" ADD CONSTRAINT "framing_response_reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_response_reviews" ADD CONSTRAINT "framing_response_reviews_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD CONSTRAINT "framing_studies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD CONSTRAINT "framing_studies_source_run_id_audit_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framing_annotations_review_idx" ON "framing_annotations" USING btree ("response_review_id");--> statement-breakpoint
CREATE INDEX "framing_annotations_association_idx" ON "framing_annotations" USING btree ("association_id");--> statement-breakpoint
CREATE INDEX "framing_evidence_snapshots_project_idx" ON "framing_evidence_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "framing_evidence_snapshots_study_idx" ON "framing_evidence_snapshots" USING btree ("framing_study_id");--> statement-breakpoint
CREATE INDEX "framing_evidence_snapshots_response_idx" ON "framing_evidence_snapshots" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "framing_gap_classifications_study_idx" ON "framing_gap_classifications" USING btree ("framing_study_id");--> statement-breakpoint
CREATE UNIQUE INDEX "framing_response_reviews_study_job_uq" ON "framing_response_reviews" USING btree ("framing_study_id","job_id");--> statement-breakpoint
CREATE INDEX "framing_response_reviews_study_outcome_idx" ON "framing_response_reviews" USING btree ("framing_study_id","outcome");--> statement-breakpoint
CREATE INDEX "framing_response_reviews_response_idx" ON "framing_response_reviews" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "framing_studies_project_idx" ON "framing_studies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "framing_studies_source_run_idx" ON "framing_studies" USING btree ("source_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "framing_studies_codebook_version_uq" ON "framing_studies" USING btree ("codebook_id","codebook_version");--> statement-breakpoint
ALTER TABLE "resonance_stimuli" ADD CONSTRAINT "resonance_stimuli_framing_evidence_snapshot_id_framing_evidence_snapshots_id_fk" FOREIGN KEY ("framing_evidence_snapshot_id") REFERENCES "public"."framing_evidence_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_audit_resonance_shape_ck" CHECK ((("prompt_cells"."intent")::text = 'simulation' and "prompt_cells"."persona_id" is null and "prompt_cells"."market_id" is null and "prompt_cells"."stimulus_id" is not null and "prompt_cells"."panel_persona_key" is not null) or (("prompt_cells"."intent")::text = 'representation' and "prompt_cells"."persona_id" is null and "prompt_cells"."market_id" is null and "prompt_cells"."stimulus_id" is null and "prompt_cells"."panel_persona_key" is null) or (("prompt_cells"."intent")::text not in ('simulation', 'representation') and "prompt_cells"."stimulus_id" is null and "prompt_cells"."panel_persona_key" is null));
