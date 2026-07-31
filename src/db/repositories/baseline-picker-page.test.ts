import { eq, max } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import {
  auditRuns,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
} from "@/db/schema";
import { forceDeleteMatrixVersions } from "@/db/repositories/matrix.test-helpers";
import {
  getBaselinePickerItem,
  listBaselinePickerPage,
} from "@/db/repositories/resonance";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdVersionIds: string[] = [];
const createdRunIds: string[] = [];
const createdResponseIds: string[] = [];

afterAll(async () => {
  for (const responseId of createdResponseIds) {
    await db.delete(responses).where(eq(responses.id, responseId)).catch(() => {});
  }
  for (const runId of createdRunIds) {
    await db.delete(jobs).where(eq(jobs.runId, runId)).catch(() => {});
    await db.delete(auditRuns).where(eq(auditRuns.id, runId)).catch(() => {});
  }
  if (createdVersionIds.length > 0) {
    await forceDeleteMatrixVersions(createdVersionIds).catch(() => {});
  }
});

describe.skipIf(!dbUp)("listBaselinePickerPage (M51 / F13)", () => {
  it("pages with opaque cursors and ignores forged cursors", async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
    if (!project) return; // seed required

    const [{ latest }] = await db
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, project.id));
    const [version] = await db
      .insert(matrixVersions)
      .values({
        projectId: project.id,
        version: (latest ?? 0) + 1,
        state: "approved",
        kind: "audit",
        cellCount: 1,
        approvedAt: new Date(),
      })
      .returning({ id: matrixVersions.id });
    createdVersionIds.push(version.id);

    const [cell] = await db
      .insert(promptCells)
      .values({
        matrixVersionId: version.id,
        intent: "discovery",
        variantKey: "m51-baseline-picker",
        resolvedText: "What tools should I consider?",
        competitorOrderJson: [],
      })
      .returning({ id: promptCells.id });

    const [run] = await db
      .insert(auditRuns)
      .values({
        projectId: project.id,
        matrixVersionId: version.id,
        runMode: "mock",
        state: "completed",
        repetitions: 5,
        selectedProvidersJson: ["mock"],
        selectedModesJson: ["ungrounded"],
        plannedCalls: 5,
        costCapUsd: "1",
      })
      .returning({ id: auditRuns.id });
    createdRunIds.push(run.id);

    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const [job] = await db
        .insert(jobs)
        .values({
          runId: run.id,
          cellId: cell.id,
          providerId: "mock",
          generationMode: "ungrounded",
          repIndex: i,
          state: "succeeded",
        })
        .returning({ id: jobs.id });
      const [response] = await db
        .insert(responses)
        .values({
          jobId: job.id,
          runId: run.id,
          cellId: cell.id,
          providerId: "mock",
          generationMode: "ungrounded",
          modelVersion: "mock-fixture-v1",
          rawText: `Stored answer ${i}`,
          createdAt: new Date(now - i * 1000),
        })
        .returning({ id: responses.id });
      createdResponseIds.push(response.id);
    }

    // Count only the responses we just inserted for this run's paging identity;
    // the project may already have other completed audit responses.
    const page1 = await listBaselinePickerPage(project.id, { pageSize: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.totalCount).toBeGreaterThanOrEqual(5);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listBaselinePickerPage(project.id, {
      cursor: page1.nextCursor,
      pageSize: 2,
    });
    expect(page2.items.length).toBe(2);
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    // Pages do not overlap.
    const page1Ids = new Set(page1.items.map((r) => r.id));
    expect(page2.items.every((r) => !page1Ids.has(r.id))).toBe(true);

    const forged = await listBaselinePickerPage(project.id, {
      cursor: "not-a-valid-cursor",
      pageSize: 2,
    });
    expect(forged.items.map((r) => r.id)).toEqual(page1.items.map((r) => r.id));

    // Sanity: our seeded rows are reachable via the picker for this project.
    const seeded = createdResponseIds.slice();
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let guard = 0; guard < 50; guard++) {
      const page = await listBaselinePickerPage(project.id, { cursor, pageSize: 20 });
      for (const item of page.items) seen.add(item.id);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seeded.every((id) => seen.has(id))).toBe(true);

    const savedOffPageId = seeded[seeded.length - 1]!;
    const savedItem = await getBaselinePickerItem(project.id, savedOffPageId);
    expect(savedItem).toMatchObject({
      id: savedOffPageId,
      rawText: "Stored answer 4",
      providerId: "mock",
    });
    expect(
      await getBaselinePickerItem(
        "00000000-0000-4000-8000-000000000099",
        savedOffPageId,
      ),
    ).toBeNull();
  });
});
