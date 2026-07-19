CREATE TABLE "framing_observation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"valid_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"paused_reason" text,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_observation_batches_state_ck" CHECK ("framing_observation_batches"."state" in ('queued', 'running', 'paused', 'completed', 'partial', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "framing_observations" DROP CONSTRAINT "framing_observations_state_ck";--> statement-breakpoint
ALTER TABLE "framing_observations" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "framing_observations" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "framing_observations" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD COLUMN "brand_order_json" jsonb;--> statement-breakpoint
ALTER TABLE "framing_observation_batches" ADD CONSTRAINT "framing_observation_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framing_observation_batches_project_idx" ON "framing_observation_batches" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "framing_observation_batches_project_active_uq" ON "framing_observation_batches" USING btree ("project_id") WHERE "framing_observation_batches"."state" in ('queued', 'running', 'paused');--> statement-breakpoint
ALTER TABLE "framing_observations" ADD CONSTRAINT "framing_observations_batch_id_framing_observation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."framing_observation_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framing_observations_batch_state_idx" ON "framing_observations" USING btree ("batch_id","state");--> statement-breakpoint
ALTER TABLE "framing_observations" ADD CONSTRAINT "framing_observations_state_ck" CHECK ("framing_observations"."state" in ('queued', 'running', 'valid', 'failed'));