CREATE TYPE "public"."brand_role" AS ENUM('client', 'competitor');--> statement-breakpoint
CREATE TYPE "public"."claim_severity" AS ENUM('none', 'low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."claim_type" AS ENUM('pricing', 'feature', 'company_fact', 'security', 'availability', 'other');--> statement-breakpoint
CREATE TYPE "public"."claim_verdict" AS ENUM('supported', 'contradicted', 'outdated', 'unsupported', 'ambiguous', 'not_checked');--> statement-breakpoint
CREATE TYPE "public"."credential_status" AS ENUM('missing', 'active', 'invalid', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."extraction_state" AS ENUM('pending', 'retrying', 'valid', 'dead_lettered', 'qa_reviewed');--> statement-breakpoint
CREATE TYPE "public"."fact_claim_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."fact_claim_type" AS ENUM('pricing', 'feature', 'company_fact', 'security', 'availability');--> statement-breakpoint
CREATE TYPE "public"."generation_mode" AS ENUM('grounded', 'ungrounded');--> statement-breakpoint
CREATE TYPE "public"."intent" AS ENUM('discovery', 'consideration', 'comparison', 'validation', 'objection');--> statement-breakpoint
CREATE TYPE "public"."job_state" AS ENUM('queued', 'running', 'succeeded', 'retryable_failed', 'dead_lettered', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."matrix_state" AS ENUM('draft', 'approved', 'superseded', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."provider_error_type" AS ENUM('rate_limit', 'timeout', 'server_error', 'auth_error', 'malformed_output', 'unsupported_mode', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."provider_id" AS ENUM('mock', 'deepseek', 'minimax', 'openai', 'anthropic', 'google', 'perplexity');--> statement-breakpoint
CREATE TYPE "public"."recommendation_strength" AS ENUM('strong', 'soft', 'neutral', 'discouraged');--> statement-breakpoint
CREATE TYPE "public"."report_section_state" AS ENUM('generated', 'edited', 'regenerated');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('unreviewed', 'confirmed', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."run_event_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."run_mode" AS ENUM('mock', 'live_validation', 'live_audit');--> statement-breakpoint
CREATE TYPE "public"."run_state" AS ENUM('draft', 'queued', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'mixed', 'negative');--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" "provider_id" NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"api_key_last4" text NOT NULL,
	"api_key_fingerprint" text NOT NULL,
	"base_url" text,
	"default_model" text,
	"status" "credential_status" DEFAULT 'active' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"brand_id" uuid,
	"observed_name" text NOT NULL,
	"position" integer,
	"recommended" boolean DEFAULT false NOT NULL,
	"recommendation_strength" "recommendation_strength" DEFAULT 'neutral' NOT NULL,
	"sentiment" "sentiment" DEFAULT 'neutral' NOT NULL,
	"attributes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims_found" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"extraction_id" uuid NOT NULL,
	"brand_id" uuid,
	"fact_claim_id" uuid,
	"claim_text" text NOT NULL,
	"claim_type" "claim_type" NOT NULL,
	"extracted_verdict" "claim_verdict" DEFAULT 'not_checked' NOT NULL,
	"extracted_severity" "claim_severity" DEFAULT 'none' NOT NULL,
	"operator_verdict" "claim_verdict",
	"operator_severity" "claim_severity",
	"review_state" "review_state" DEFAULT 'unreviewed' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"evidence_quote" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"extraction_version" integer DEFAULT 1 NOT NULL,
	"state" "extraction_state" DEFAULT 'pending' NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"extraction_model" text,
	"extracted_json" jsonb,
	"validation_error" text,
	"qa_status" text,
	"qa_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"role" "brand_role" NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"description" text,
	"aliases_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" "fact_claim_type" NOT NULL,
	"statement" text NOT NULL,
	"source_note" text,
	"source_url" text,
	"status" "fact_claim_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"company_context" text,
	"pain_points_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"buying_criteria_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text,
	"job_to_be_done" text,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"intake_step" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "matrix_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"state" "matrix_state" DEFAULT 'draft' NOT NULL,
	"cell_count" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matrix_versions_cell_cap_ck" CHECK ("matrix_versions"."cell_count" <= 50)
);
--> statement-breakpoint
CREATE TABLE "prompt_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matrix_version_id" uuid NOT NULL,
	"intent" "intent" NOT NULL,
	"persona_id" uuid,
	"market_id" uuid,
	"variant_key" text NOT NULL,
	"resolved_text" text NOT NULL,
	"competitor_order_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent" "intent" NOT NULL,
	"template_text" text NOT NULL,
	"variant_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"matrix_version_id" uuid NOT NULL,
	"run_mode" "run_mode" NOT NULL,
	"state" "run_state" DEFAULT 'draft' NOT NULL,
	"repetitions" integer NOT NULL,
	"selected_providers_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_modes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"planned_calls" integer DEFAULT 0 NOT NULL,
	"cost_cap_usd" numeric(12, 6) NOT NULL,
	"actual_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"failure_rate" real DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_runs_audit_repetitions_ck" CHECK ("audit_runs"."run_mode" <> 'live_audit' OR "audit_runs"."repetitions" = 5)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"cell_id" uuid NOT NULL,
	"provider_id" "provider_id" NOT NULL,
	"generation_mode" "generation_mode" NOT NULL,
	"rep_index" integer NOT NULL,
	"state" "job_state" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error_type" "provider_error_type",
	"last_error_message" text,
	"next_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"cell_id" uuid NOT NULL,
	"provider_id" "provider_id" NOT NULL,
	"generation_mode" "generation_mode" NOT NULL,
	"model_version" text NOT NULL,
	"raw_text" text NOT NULL,
	"citations_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"finding_type" text NOT NULL,
	"severity" "claim_severity" DEFAULT 'none' NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"evidence_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_key" text NOT NULL,
	"metric_key" text NOT NULL,
	"n" integer NOT NULL,
	"value" double precision NOT NULL,
	"ci_low" double precision,
	"ci_high" double precision,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"generated_md" text,
	"edited_md" text,
	"state" "report_section_state" DEFAULT 'generated' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"job_id" uuid,
	"level" "run_event_level" DEFAULT 'info' NOT NULL,
	"event_type" text NOT NULL,
	"message" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_mentions" ADD CONSTRAINT "brand_mentions_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_mentions" ADD CONSTRAINT "brand_mentions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims_found" ADD CONSTRAINT "claims_found_extraction_id_extractions_id_fk" FOREIGN KEY ("extraction_id") REFERENCES "public"."extractions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims_found" ADD CONSTRAINT "claims_found_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims_found" ADD CONSTRAINT "claims_found_fact_claim_id_fact_claims_id_fk" FOREIGN KEY ("fact_claim_id") REFERENCES "public"."fact_claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributes" ADD CONSTRAINT "attributes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_claims" ADD CONSTRAINT "fact_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_versions" ADD CONSTRAINT "matrix_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_matrix_version_id_matrix_versions_id_fk" FOREIGN KEY ("matrix_version_id") REFERENCES "public"."matrix_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_runs" ADD CONSTRAINT "audit_runs_matrix_version_id_matrix_versions_id_fk" FOREIGN KEY ("matrix_version_id") REFERENCES "public"."matrix_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_cell_id_prompt_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."prompt_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_cell_id_prompt_cells_id_fk" FOREIGN KEY ("cell_id") REFERENCES "public"."prompt_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_sections" ADD CONSTRAINT "report_sections_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_provider_label_uq" ON "provider_credentials" USING btree ("provider_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_one_active_uq" ON "provider_credentials" USING btree ("provider_id") WHERE "provider_credentials"."status" = 'active';--> statement-breakpoint
CREATE INDEX "brand_mentions_brand_recommended_idx" ON "brand_mentions" USING btree ("brand_id","recommended");--> statement-breakpoint
CREATE UNIQUE INDEX "extractions_response_version_uq" ON "extractions" USING btree ("response_id","extraction_version");--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_project_name_uq" ON "attributes" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_project_role_name_uq" ON "brands" USING btree ("project_id","role","name");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_one_client_per_project_uq" ON "brands" USING btree ("project_id") WHERE "brands"."role" = 'client';--> statement-breakpoint
CREATE UNIQUE INDEX "markets_project_name_uq" ON "markets" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "matrix_versions_project_version_uq" ON "matrix_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "prompt_cells_version_intent_idx" ON "prompt_cells" USING btree ("matrix_version_id","intent");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_intent_variant_active_uq" ON "prompt_templates" USING btree ("intent","variant_key") WHERE "prompt_templates"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_identity_uq" ON "jobs" USING btree ("run_id","cell_id","provider_id","generation_mode","rep_index");--> statement-breakpoint
CREATE INDEX "jobs_state_next_attempt_idx" ON "jobs" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_scope_uq" ON "metrics" USING btree ("run_id","scope_type","scope_key","metric_key");--> statement-breakpoint
CREATE UNIQUE INDEX "report_sections_run_section_uq" ON "report_sections" USING btree ("run_id","section_key");--> statement-breakpoint
CREATE INDEX "run_events_run_created_idx" ON "run_events" USING btree ("run_id","created_at");