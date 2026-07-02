import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import { INTENT_ORDER } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { matrixVersions, promptCells, projects } from "@/db/schema";
import { eq } from "drizzle-orm";

// M3 acceptance (guidelines F): direct API attempt at 51 cells; approval
// immutability. Runs against the local dev database and self-skips when no
// Postgres is reachable (e.g. CI has no DB service yet).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
let demoProjectId: string | null = null;
try {
  await pool.query("select 1");
  dbUp = true;
  const [demo] = await db
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(eq(projects.slug, "ledgerfox-demo"));
  demoProjectId = demo?.status === "active" ? demo.id : null;
} catch {
  dbUp = false;
}

const createdVersionIds: string[] = [];

afterAll(async () => {
  if (createdVersionIds.length > 0) {
    await db
      .delete(promptCells)
      .where(inArray(promptCells.matrixVersionId, createdVersionIds));
    await db
      .delete(matrixVersions)
      .where(inArray(matrixVersions.id, createdVersionIds));
  }
  await pool.end().catch(() => {});
});

describe.skipIf(!dbUp || !demoProjectId)(
  "matrix actions against the dev database",
  () => {
    it("caps at 50, rejects the 51st server-side, and freezes on approval", async () => {
      const { addCell, approveMatrix, generateMatrix, newDraftFromVersion, saveCellText } =
        await import("./actions");
      const projectId = demoProjectId as string;

      // Generate the default matrix: demo contract yields exactly 40.
      const generated = await generateMatrix(projectId);
      expect(generated.ok).toBe(true);
      const versionId = (generated as { versionId: string }).versionId;
      createdVersionIds.push(versionId);

      const countCells = async () =>
        (
          await db
            .select({ id: promptCells.id })
            .from(promptCells)
            .where(eq(promptCells.matrixVersionId, versionId))
        ).length;
      expect(await countCells()).toBe(40);

      // Fill to the cap through the real action.
      let guard = 30;
      while ((await countCells()) < MAX_CELLS_PER_RUN && guard-- > 0) {
        let added = false;
        for (const intent of INTENT_ORDER) {
          const result = await addCell(projectId, versionId, intent);
          if (result.ok) {
            added = true;
            break;
          }
        }
        expect(added).toBe(true);
      }
      expect(await countCells()).toBe(MAX_CELLS_PER_RUN);

      // The 51st is rejected server-side for every intent (PM-6).
      for (const intent of INTENT_ORDER) {
        const rejected = await addCell(projectId, versionId, intent);
        expect(rejected.ok).toBe(false);
        if (!rejected.ok) expect(rejected.error).toMatch(/cap/i);
      }
      expect(await countCells()).toBe(MAX_CELLS_PER_RUN);

      // Approve, then verify the version is frozen (PM-10 / C-4).
      const approved = await approveMatrix(projectId, versionId);
      expect(approved.ok).toBe(true);

      const [cell] = await db
        .select({ id: promptCells.id, resolvedText: promptCells.resolvedText })
        .from(promptCells)
        .where(eq(promptCells.matrixVersionId, versionId))
        .limit(1);
      const editAttempt = await saveCellText(projectId, versionId, cell.id, "tampered");
      expect(editAttempt.ok).toBe(false);
      if (!editAttempt.ok) expect(editAttempt.error).toMatch(/frozen|draft/i);

      const [after] = await db
        .select({ resolvedText: promptCells.resolvedText })
        .from(promptCells)
        .where(eq(promptCells.id, cell.id));
      expect(after.resolvedText).toBe(cell.resolvedText);

      // PM-10: edits go into a fresh draft copy, which IS editable.
      const draft = await newDraftFromVersion(projectId, versionId);
      expect(draft.ok).toBe(true);
      const draftId = (draft as { versionId: string }).versionId;
      createdVersionIds.push(draftId);
      const [draftCell] = await db
        .select({ id: promptCells.id })
        .from(promptCells)
        .where(eq(promptCells.matrixVersionId, draftId))
        .limit(1);
      const draftEdit = await saveCellText(projectId, draftId, draftCell.id, "edited in draft");
      expect(draftEdit.ok).toBe(true);
    }, 60_000);
  },
);
