-- M62/D-141: retire the GEO agent. Drops its six commerce tables and six
-- agent-only enum types. service_heartbeats (also created in 0017) stays: the
-- operator worker uses it. The `crypto_token` and `xai` labels remain in the
-- shared category_archetype/provider_id types because Postgres cannot drop an
-- enum value in place; no code path produces them.
DROP TABLE "agent_order_events";--> statement-breakpoint
DROP TABLE "agent_effects";--> statement-breakpoint
DROP TABLE "agent_deliverables";--> statement-breakpoint
DROP TABLE "agent_settlements";--> statement-breakpoint
DROP TABLE "agent_orders";--> statement-breakpoint
DROP TABLE "agent_runtime_control";--> statement-breakpoint
DROP TYPE "public"."agent_acp_status";--> statement-breakpoint
DROP TYPE "public"."agent_deliverable_state";--> statement-breakpoint
DROP TYPE "public"."agent_effect_state";--> statement-breakpoint
DROP TYPE "public"."agent_effect_type";--> statement-breakpoint
DROP TYPE "public"."agent_exec_status";--> statement-breakpoint
DROP TYPE "public"."agent_result_state";
