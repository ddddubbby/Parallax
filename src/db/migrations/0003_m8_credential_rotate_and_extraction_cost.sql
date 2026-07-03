DROP INDEX "provider_credentials_provider_label_uq";--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "tokens_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "extractions" ADD COLUMN "tokens_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_provider_label_uq" ON "provider_credentials" USING btree ("provider_id","label") WHERE "provider_credentials"."status" = 'active';