import { inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { matrixVersions, promptCells } from "../schema";

/**
 * TEST-ONLY escape hatch for migration 0010's C-4 DB freeze trigger
 * (D-081). DB-backed test suites routinely approve a matrix version (to get
 * past the app-level assertDraft() guard and exercise the runner/worker/
 * extraction pipeline), then tear the fixture down directly in afterAll/
 * afterEach with a raw prompt_cells delete — a path the freeze trigger would
 * otherwise reject just like it rejects real application tampering.
 *
 * The bypass is scoped to a single transaction via `SET LOCAL`, never plain
 * `SET`, so it can never leak onto a pooled connection and silently disable
 * the trigger for an unrelated later query. Never import this outside test
 * files — it exists to delete test fixtures, not to give app code a way
 * around C-4.
 */
export async function forceDeleteMatrixVersionCells(
  versionIds: string | string[],
): Promise<void> {
  const ids = Array.isArray(versionIds) ? versionIds : [versionIds];
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.bypass_cell_freeze = 'on'`);
    await tx.delete(promptCells).where(inArray(promptCells.matrixVersionId, ids));
  });
}

/** Same bypass, scoped to specific prompt_cells row ids rather than a whole version. */
export async function forceDeletePromptCellsByIds(cellIds: string[]): Promise<void> {
  if (cellIds.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.bypass_cell_freeze = 'on'`);
    await tx.delete(promptCells).where(inArray(promptCells.id, cellIds));
  });
}

/** Convenience: bypassed cell delete followed by the (untriggered) version delete. */
export async function forceDeleteMatrixVersions(versionIds: string | string[]): Promise<void> {
  const ids = Array.isArray(versionIds) ? versionIds : [versionIds];
  if (ids.length === 0) return;
  await forceDeleteMatrixVersionCells(ids);
  await db.delete(matrixVersions).where(inArray(matrixVersions.id, ids));
}
