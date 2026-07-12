-- M36 (AGENT_PRD §12): two enum additions, each its own statement, and NO
-- statement in this batch consumes the new value — Drizzle batches pending
-- migrations into one transaction and PostgreSQL rejects direct use of a
-- just-added enum value in the same transaction (this repo hit this twice:
-- D-066, D-102). Both values are consumed only at runtime (inserts), never DDL.
ALTER TYPE "public"."category_archetype" ADD VALUE 'crypto_token';--> statement-breakpoint
ALTER TYPE "public"."provider_id" ADD VALUE 'xai';