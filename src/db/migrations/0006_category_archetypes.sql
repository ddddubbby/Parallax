CREATE TYPE "public"."category_archetype" AS ENUM('b2b', 'consumer_product', 'consumer_venue');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "category_archetype" "category_archetype" DEFAULT 'b2b' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "archetype" "category_archetype" DEFAULT 'b2b' NOT NULL;--> statement-breakpoint
DROP INDEX "prompt_templates_intent_variant_active_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_archetype_intent_variant_active_uq" ON "prompt_templates" USING btree ("archetype","intent","variant_key") WHERE "prompt_templates"."active" = true;
