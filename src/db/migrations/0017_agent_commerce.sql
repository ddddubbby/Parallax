CREATE TYPE "public"."agent_acp_status" AS ENUM('created', 'budgeted', 'funded', 'submitted', 'completed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."agent_deliverable_state" AS ENUM('draft', 'published', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."agent_effect_state" AS ENUM('pending', 'confirmed', 'unknown', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."agent_effect_type" AS ENUM('set_budget', 'reject', 'submit_offchain', 'submit_onchain', 'claim_refund', 'message');--> statement-breakpoint
CREATE TYPE "public"."agent_exec_status" AS ENUM('pending', 'admitted', 'processing', 'submitted', 'completed', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."agent_result_state" AS ENUM('open', 'completed', 'rejected', 'refunded', 'expired');--> statement-breakpoint
CREATE TABLE "agent_deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"envelope_json" jsonb NOT NULL,
	"report_sha256" text NOT NULL,
	"acp_hash" text,
	"capability_hash" text,
	"state" "agent_deliverable_state" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"effect_type" "agent_effect_type" NOT NULL,
	"payload_hash" text NOT NULL,
	"precondition" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"tx_hash" text,
	"state" "agent_effect_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"settlement_chain_id" integer NOT NULL,
	"onchain_job_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" text NOT NULL,
	"sender" text,
	"source" text NOT NULL,
	"raw_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_chain_id" integer NOT NULL,
	"onchain_job_id" text NOT NULL,
	"buyer_address" text NOT NULL,
	"provider_address" text NOT NULL,
	"evaluator_address" text NOT NULL,
	"offering_version" text NOT NULL,
	"offering_digest" text NOT NULL,
	"requirement_json" jsonb,
	"asset_identity_json" jsonb,
	"expired_at" timestamp with time zone,
	"acp_status" "agent_acp_status" DEFAULT 'created' NOT NULL,
	"exec_status" "agent_exec_status" DEFAULT 'pending' NOT NULL,
	"result_state" "agent_result_state" DEFAULT 'open' NOT NULL,
	"terminal_attribution" text,
	"run_id" uuid,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runtime_control" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_key" text NOT NULL,
	"admissions_enabled" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runtime_control_key_ck" CHECK ("agent_runtime_control"."control_key" <> '')
);
--> statement-breakpoint
CREATE TABLE "agent_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gross_micro_usdc" bigint DEFAULT 0 NOT NULL,
	"contract_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expected_provider_credit" bigint,
	"actual_provider_credit" bigint,
	"fee_recipients_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tx_ref" text,
	"log_ref" text,
	"cogs_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"wasted_cogs_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"instance_id" text NOT NULL,
	"state" text DEFAULT 'online' NOT NULL,
	"last_beat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_deliverables" ADD CONSTRAINT "agent_deliverables_order_id_agent_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."agent_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_effects" ADD CONSTRAINT "agent_effects_order_id_agent_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."agent_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_order_events" ADD CONSTRAINT "agent_order_events_order_id_agent_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."agent_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_orders" ADD CONSTRAINT "agent_orders_run_id_audit_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."audit_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settlements" ADD CONSTRAINT "agent_settlements_order_id_agent_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."agent_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_deliverables_order_uq" ON "agent_deliverables" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_effects_once_uq" ON "agent_effects" USING btree ("order_id","effect_type","payload_hash");--> statement-breakpoint
CREATE INDEX "agent_effects_state_idx" ON "agent_effects" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_order_events_fingerprint_uq" ON "agent_order_events" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "agent_order_events_order_idx" ON "agent_order_events" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_orders_chain_job_uq" ON "agent_orders" USING btree ("settlement_chain_id","onchain_job_id");--> statement-breakpoint
CREATE INDEX "agent_orders_status_idx" ON "agent_orders" USING btree ("acp_status","exec_status");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runtime_control_key_uq" ON "agent_runtime_control" USING btree ("control_key");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_settlements_order_uq" ON "agent_settlements" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_heartbeats_service_instance_uq" ON "service_heartbeats" USING btree ("service","instance_id");