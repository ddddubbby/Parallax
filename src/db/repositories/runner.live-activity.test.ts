// M54/D-124: getRunDetail liveActivity substance previews.

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "../client";
import {
  auditRuns,
  brandMentions,
  brands,
  extractions,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  responses,
} from "../schema";
import { getRunDetail } from "./runner";
import { forceDeleteMatrixVersions } from "./matrix.test-helpers";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const made = {
  projectIds: [] as string[],
  versionIds: [] as string[],
  brandIds: [] as string[],
  cellIds: [] as string[],
  runIds: [] as string[],
  jobIds: [] as string[],
  responseIds: [] as string[],
  extractionIds: [] as string[],
};

afterAll(async () => {
  if (!dbUp) return;
  if (made.extractionIds.length) {
    await db.delete(brandMentions).where(inArray(brandMentions.extractionId, made.extractionIds));
    await db.delete(extractions).where(inArray(extractions.id, made.extractionIds));
  }
  if (made.responseIds.length) {
    await db.delete(responses).where(inArray(responses.id, made.responseIds));
  }
  if (made.jobIds.length) await db.delete(jobs).where(inArray(jobs.id, made.jobIds));
  if (made.runIds.length) await db.delete(auditRuns).where(inArray(auditRuns.id, made.runIds));
  // C-4: approved matrix cells are frozen — forceDeleteMatrixVersions bypasses.
  if (made.versionIds.length) await forceDeleteMatrixVersions(made.versionIds);
  if (made.brandIds.length) await db.delete(brands).where(inArray(brands.id, made.brandIds));
  if (made.projectIds.length) await db.delete(projects).where(inArray(projects.id, made.projectIds));
});

describe("getRunDetail liveActivity (M54/D-124)", () => {
  it.skipIf(!dbUp)(
    "returns asking, answered, and reading hit lines from persisted rows",
    async () => {
      const [project] = await db
        .insert(projects)
        .values({ name: "Live activity", slug: `live-act-${Date.now()}` })
        .returning();
      made.projectIds.push(project!.id);

      const [brand] = await db
        .insert(brands)
        .values({ projectId: project!.id, name: "Acme", role: "client" })
        .returning();
      made.brandIds.push(brand!.id);

      const [version] = await db
        .insert(matrixVersions)
        .values({ projectId: project!.id, version: 1, state: "approved" })
        .returning();
      made.versionIds.push(version!.id);

      const [cell] = await db
        .insert(promptCells)
        .values({
          matrixVersionId: version!.id,
          intent: "discovery",
          variantKey: "v1",
          resolvedText: "Which tools should a finance team evaluate for expense reporting?",
        })
        .returning();
      made.cellIds.push(cell!.id);

      const [run] = await db
        .insert(auditRuns)
        .values({
          projectId: project!.id,
          matrixVersionId: version!.id,
          runMode: "mock",
          state: "running",
          repetitions: 5,
          selectedProvidersJson: ["mock"],
          selectedModesJson: ["ungrounded"],
          plannedCalls: 2,
          costCapUsd: "0",
        })
        .returning();
      made.runIds.push(run!.id);

      const [askingJob] = await db
        .insert(jobs)
        .values({
          runId: run!.id,
          cellId: cell!.id,
          providerId: "mock",
          generationMode: "ungrounded",
          repIndex: 0,
          state: "running",
        })
        .returning();
      made.jobIds.push(askingJob!.id);

      const [doneJob] = await db
        .insert(jobs)
        .values({
          runId: run!.id,
          cellId: cell!.id,
          providerId: "mock",
          generationMode: "ungrounded",
          repIndex: 1,
          state: "succeeded",
        })
        .returning();
      made.jobIds.push(doneJob!.id);

      const [response] = await db
        .insert(responses)
        .values({
          jobId: doneJob!.id,
          runId: run!.id,
          cellId: cell!.id,
          providerId: "mock",
          generationMode: "ungrounded",
          modelVersion: "mock-v1",
          rawText: "Acme and Contoso both appear on shortlists for mid-market finance teams.",
          latencyMs: 1800,
          costUsd: "0",
        })
        .returning();
      made.responseIds.push(response!.id);

      const [extraction] = await db
        .insert(extractions)
        .values({
          responseId: response!.id,
          extractionVersion: 1,
          state: "valid",
          extractedJson: { brands: ["Acme"] },
        })
        .returning();
      made.extractionIds.push(extraction!.id);

      await db.insert(brandMentions).values({
        extractionId: extraction!.id,
        brandId: brand!.id,
        observedName: "Acme",
        position: 1,
        recommended: true,
      });

      const detail = await getRunDetail(run!.id);
      expect(detail).not.toBeNull();
      expect(detail!.liveActivity.asking).toHaveLength(1);
      expect(detail!.liveActivity.asking[0]!.promptPreview).toContain("finance team");
      expect(detail!.liveActivity.asking[0]!.engineLabel).toBe("Mock");
      expect(detail!.liveActivity.answered).toHaveLength(1);
      expect(detail!.liveActivity.answered[0]!.responsePreview).toContain("Acme");
      expect(detail!.liveActivity.answered[0]!.latencyMs).toBe(1800);
      expect(detail!.liveActivity.showSecondary).toBe(true);
      expect(detail!.liveActivity.secondary[0]!.label).toMatch(/Found 1 brand mention/);
      expect(detail!.liveActivity.secondary[0]!.label).toContain("Acme");
    },
  );
});
