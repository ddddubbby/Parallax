ALTER TABLE "framing_response_reviews" DROP CONSTRAINT "framing_response_reviews_outcome_ck";--> statement-breakpoint
ALTER TABLE "prompt_cells" DROP CONSTRAINT "prompt_cells_audit_resonance_shape_ck";--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD COLUMN "gap_classification_id" uuid;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "discovery_manifest_json" jsonb;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "discovery_manifest_digest" text;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "discovery_attested_by" text;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "discovery_attested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "gap_outcome" text;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "gap_completed_by" text;--> statement-breakpoint
ALTER TABLE "framing_studies" ADD COLUMN "gap_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "framing_evidence_snapshots" ADD CONSTRAINT "framing_evidence_snapshots_gap_classification_id_framing_gap_classifications_id_fk" FOREIGN KEY ("gap_classification_id") REFERENCES "public"."framing_gap_classifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "framing_evidence_snapshots_handoff_uq" ON "framing_evidence_snapshots" USING btree ("annotation_id","gap_classification_id") WHERE "framing_evidence_snapshots"."gap_classification_id" is not null;--> statement-breakpoint
ALTER TABLE "framing_response_reviews" ADD CONSTRAINT "framing_response_reviews_outcome_ck" CHECK ("framing_response_reviews"."outcome" in ('pending', 'coded', 'none', 'other', 'ambiguous', 'entity_ambiguous', 'insufficient_evidence', 'generation_unavailable'));--> statement-breakpoint
ALTER TABLE "framing_studies" ADD CONSTRAINT "framing_studies_gap_outcome_ck" CHECK ("framing_studies"."gap_outcome" is null or "framing_studies"."gap_outcome" in ('actionable_gap_identified', 'no_actionable_gap_identified'));--> statement-breakpoint
ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_audit_resonance_shape_ck" CHECK (("prompt_cells"."intent"::text = 'simulation' and "prompt_cells"."persona_id" is null and "prompt_cells"."market_id" is null and "prompt_cells"."stimulus_id" is not null and "prompt_cells"."panel_persona_key" is not null) or ("prompt_cells"."intent"::text = 'representation' and "prompt_cells"."persona_id" is null and "prompt_cells"."market_id" is null and "prompt_cells"."stimulus_id" is null and "prompt_cells"."panel_persona_key" is null) or ("prompt_cells"."intent"::text not in ('simulation', 'representation') and "prompt_cells"."stimulus_id" is null and "prompt_cells"."panel_persona_key" is null));
--> statement-breakpoint
CREATE FUNCTION "public"."prevent_framing_snapshot_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.bypass_framing_snapshot_freeze', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'framing_evidence_snapshots is append-only (C-15)';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "framing_evidence_snapshots_freeze_trigger"
BEFORE UPDATE OR DELETE ON "public"."framing_evidence_snapshots"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_framing_snapshot_mutation"();
--> statement-breakpoint
CREATE FUNCTION "public"."prevent_approved_resonance_stimulus_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_old_state text;
  v_new_state text;
BEGIN
  IF current_setting('app.bypass_resonance_stimulus_freeze', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT "state" INTO v_old_state FROM "public"."resonance_studies" WHERE "id" = OLD."study_id";
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "state" INTO v_new_state FROM "public"."resonance_studies" WHERE "id" = NEW."study_id";
  END IF;
  IF v_old_state = 'approved' OR v_new_state = 'approved' THEN
    RAISE EXCEPTION 'resonance_stimuli is frozen once its study is approved (C-4/C-15)';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "resonance_stimuli_freeze_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."resonance_stimuli"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_approved_resonance_stimulus_mutation"();
