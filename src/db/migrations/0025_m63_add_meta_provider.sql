-- M63/D-143: Muse Spark via the Meta Model API becomes a live audit engine.
-- `xai` needs no change: its label survived M62 (0024) and is live again.
ALTER TYPE "public"."provider_id" ADD VALUE 'meta';
