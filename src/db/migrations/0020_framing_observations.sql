CREATE TABLE "framing_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"state" text NOT NULL,
	"observations_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vectors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text,
	"embedding_model" text,
	"llm_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"embedding_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framing_observations_state_ck" CHECK ("framing_observations"."state" in ('valid', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "framing_observations" ADD CONSTRAINT "framing_observations_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "framing_observations_response_version_uq" ON "framing_observations" USING btree ("response_id","version");--> statement-breakpoint
CREATE INDEX "framing_observations_response_idx" ON "framing_observations" USING btree ("response_id");