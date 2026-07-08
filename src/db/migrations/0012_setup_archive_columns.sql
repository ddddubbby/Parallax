ALTER TABLE "brands" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "setup_updated_at" timestamp with time zone;