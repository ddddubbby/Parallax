ALTER TYPE "public"."intent" ADD VALUE 'simulation';--> statement-breakpoint
CREATE TABLE "resonance_studies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "state" text DEFAULT 'draft' NOT NULL,
  "panel_personas_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "anchor_set_version" text DEFAULT 'purchase_intent.v1' NOT NULL,
  "baseline_stimulus_id" uuid,
  "generic_unconditioned" boolean DEFAULT false NOT NULL,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "resonance_studies_state_ck" CHECK ("resonance_studies"."state" in ('draft', 'approved', 'archived'))
);--> statement-breakpoint
CREATE TABLE "resonance_stimuli" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "study_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "body" text NOT NULL,
  "evidence_response_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "resonance_stimuli_kind_ck" CHECK ("resonance_stimuli"."kind" in ('measured_ai', 'corrected', 'repositioned', 'custom'))
);--> statement-breakpoint
ALTER TABLE "matrix_versions" ADD COLUMN "kind" text DEFAULT 'audit' NOT NULL;--> statement-breakpoint
ALTER TABLE "matrix_versions" ADD COLUMN "resonance_study_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD COLUMN "stimulus_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD COLUMN "panel_persona_key" text;--> statement-breakpoint
ALTER TABLE "resonance_studies" ADD CONSTRAINT "resonance_studies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resonance_stimuli" ADD CONSTRAINT "resonance_stimuli_study_id_resonance_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."resonance_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_versions" ADD CONSTRAINT "matrix_versions_resonance_study_id_resonance_studies_id_fk" FOREIGN KEY ("resonance_study_id") REFERENCES "public"."resonance_studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_stimulus_id_resonance_stimuli_id_fk" FOREIGN KEY ("stimulus_id") REFERENCES "public"."resonance_stimuli"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_versions" ADD CONSTRAINT "matrix_versions_kind_ck" CHECK ("matrix_versions"."kind" in ('audit', 'resonance'));--> statement-breakpoint
CREATE INDEX "matrix_versions_project_kind_idx" ON "matrix_versions" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "resonance_studies_project_idx" ON "resonance_studies" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resonance_stimuli_study_position_uq" ON "resonance_stimuli" USING btree ("study_id","position");--> statement-breakpoint
CREATE INDEX "resonance_stimuli_study_idx" ON "resonance_stimuli" USING btree ("study_id");
