-- Custom SQL migration file, put your code below! --
-- Fixes a real regression in migration 0010 (D-081's prompt_cells freeze
-- trigger): the function unconditionally returned OLD. For a BEFORE UPDATE
-- ROW trigger, returning OLD instead of NEW discards the caller's intended
-- new column values and silently rewrites the row's PREVIOUS values instead
-- — no exception is raised, so `updateCellText`'s `.returning()` reports one
-- row affected and the app believes the save succeeded. In practice: every
-- edit to a DRAFT prompt cell (the common, fully-mutable case C-4 says must
-- stay editable) was silently discarded, reverting to the pre-edit text on
-- the next fetch. Frozen (approved/superseded) rows correctly raised their
-- exception and were never affected by this bug — only the non-frozen path
-- was broken, which is also why it went uncaught until first real use.
--
-- Fix: branch on TG_OP. UPDATE returns NEW (let the intended write through);
-- DELETE returns OLD (Postgres requires a non-null OLD-shaped row to proceed
-- with a delete). The bypass path and the frozen-state exception path are
-- unchanged in behavior, just corrected to return the right row shape too.
CREATE OR REPLACE FUNCTION "public"."prevent_frozen_prompt_cells_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_state "public"."matrix_state";
BEGIN
  IF current_setting('app.bypass_cell_freeze', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT "state" INTO v_state
  FROM "public"."matrix_versions"
  WHERE "id" = OLD."matrix_version_id";

  IF v_state IN ('approved', 'superseded') THEN
    RAISE EXCEPTION 'prompt_cells is frozen once its matrix version is approved or superseded (C-4)';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;