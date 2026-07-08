-- Custom SQL migration file, put your code below! --
-- D-081 / C-4 DB backstop: block direct UPDATE/DELETE on prompt_cells rows
-- whose parent matrix_versions.state is 'approved' or 'superseded' (frozen
-- per C-4 — "approved matrices are frozen, edits create a new matrix
-- version"). Draft-state cells stay fully mutable; INSERT is never blocked
-- (compilation inserts happen while a matrix/resonance version is draft).
--
-- Escape hatch: DB-backed test suites (see M22's ephemeral test DB) tear
-- down fixture rows created directly against approved/superseded versions,
-- bypassing the app-level assertDraft() guard entirely (raw db.delete()
-- calls in afterAll/afterEach cleanup). Without an opt-in bypass this
-- trigger would break that teardown pattern across ~11 test files. The
-- bypass is a transaction-scoped session GUC (SET LOCAL, never plain SET,
-- so it can never leak onto a pooled connection's next caller) that only
-- test cleanup helpers set explicitly — see
-- src/db/repositories/matrix.test-helpers.ts's forceDeleteMatrixVersionCells.
CREATE FUNCTION "public"."prevent_frozen_prompt_cells_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_state "public"."matrix_state";
BEGIN
  IF current_setting('app.bypass_cell_freeze', true) = 'on' THEN
    RETURN OLD;
  END IF;

  SELECT "state" INTO v_state
  FROM "public"."matrix_versions"
  WHERE "id" = OLD."matrix_version_id";

  IF v_state IN ('approved', 'superseded') THEN
    RAISE EXCEPTION 'prompt_cells is frozen once its matrix version is approved or superseded (C-4)';
  END IF;

  RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "prompt_cells_freeze_trigger"
BEFORE UPDATE OR DELETE ON "public"."prompt_cells"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_frozen_prompt_cells_mutation"();
