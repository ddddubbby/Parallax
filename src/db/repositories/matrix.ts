import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import type { CellPlan } from "@/core/matrix";
import { db } from "../client";
import {
  attributes,
  brands,
  markets,
  matrixVersions,
  personas,
  projects,
  promptCells,
  promptTemplates,
} from "../schema";

/** Everything the allocator needs, loaded from the completed intake. */
export async function getMatrixInputs(projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      category: projects.category,
      jobToBeDone: projects.jobToBeDone,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;

  const [projectBrands, projectPersonas, projectMarkets, projectAttributes, templates] =
    await Promise.all([
      db.select().from(brands).where(eq(brands.projectId, projectId)),
      db
        .select({ id: personas.id, title: personas.title })
        .from(personas)
        .where(eq(personas.projectId, projectId))
        .orderBy(asc(personas.priority)),
      db
        .select({ id: markets.id, name: markets.name })
        .from(markets)
        .where(eq(markets.projectId, projectId))
        .orderBy(asc(markets.priority)),
      db
        .select({ name: attributes.name })
        .from(attributes)
        .where(eq(attributes.projectId, projectId))
        .orderBy(asc(attributes.priority)),
      db
        .select({
          intent: promptTemplates.intent,
          variantKey: promptTemplates.variantKey,
          templateText: promptTemplates.templateText,
        })
        .from(promptTemplates)
        .where(eq(promptTemplates.active, true)),
    ]);

  const client = projectBrands.find((b) => b.role === "client");
  const competitors = projectBrands
    .filter((b) => b.role === "competitor")
    .sort((a, b) => a.priority - b.priority);

  return { project, client, competitors, personas: projectPersonas, markets: projectMarkets, attributes: projectAttributes.map((a) => a.name), templates };
}

export async function listVersions(projectId: string) {
  return db
    .select({
      id: matrixVersions.id,
      version: matrixVersions.version,
      state: matrixVersions.state,
      cellCount: matrixVersions.cellCount,
      approvedAt: matrixVersions.approvedAt,
      createdAt: matrixVersions.createdAt,
    })
    .from(matrixVersions)
    .where(eq(matrixVersions.projectId, projectId))
    .orderBy(desc(matrixVersions.version));
}

export async function getVersionWithCells(versionId: string) {
  const [version] = await db
    .select()
    .from(matrixVersions)
    .where(eq(matrixVersions.id, versionId));
  if (!version) return null;
  const cells = await db
    .select({
      id: promptCells.id,
      intent: promptCells.intent,
      personaId: promptCells.personaId,
      marketId: promptCells.marketId,
      variantKey: promptCells.variantKey,
      resolvedText: promptCells.resolvedText,
      competitorOrderJson: promptCells.competitorOrderJson,
    })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, versionId))
    .orderBy(asc(promptCells.createdAt));
  return { version, cells };
}

export type CellInput = Omit<CellPlan, "personaId" | "marketId"> & {
  personaId: string | null;
  marketId: string | null;
};

/** Create the next draft version for a project with the given cells. */
export async function createDraftVersion(projectId: string, cells: CellInput[]) {
  return db.transaction(async (tx) => {
    const [{ latest }] = await tx
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const [version] = await tx
      .insert(matrixVersions)
      .values({
        projectId,
        version: (latest ?? 0) + 1,
        cellCount: cells.length,
      })
      .returning({ id: matrixVersions.id, version: matrixVersions.version });
    for (const cell of cells) {
      await tx.insert(promptCells).values({
        matrixVersionId: version.id,
        intent: cell.intent,
        personaId: cell.personaId,
        marketId: cell.marketId,
        variantKey: cell.variantKey,
        resolvedText: cell.resolvedText,
        competitorOrderJson: cell.competitorOrder,
      });
    }
    return version;
  });
}

async function assertDraft(versionId: string) {
  const [version] = await db
    .select({ state: matrixVersions.state })
    .from(matrixVersions)
    .where(eq(matrixVersions.id, versionId));
  if (!version || version.state !== "draft") {
    throw new Error("Matrix version is not a draft; approved versions are frozen (C-4)");
  }
}

async function syncCellCount(versionId: string) {
  await db
    .update(matrixVersions)
    .set({
      cellCount: sql`(select count(*) from ${promptCells} where ${promptCells.matrixVersionId} = ${versionId})`,
      updatedAt: new Date(),
    })
    .where(and(eq(matrixVersions.id, versionId), eq(matrixVersions.state, "draft")));
}

/** Draft-only cell text edit (PM-7); approved cells never match (C-4). */
export async function updateCellText(versionId: string, cellId: string, resolvedText: string) {
  await assertDraft(versionId);
  const updated = await db
    .update(promptCells)
    .set({ resolvedText })
    .where(and(eq(promptCells.id, cellId), eq(promptCells.matrixVersionId, versionId)))
    .returning({ id: promptCells.id });
  return updated.length;
}

export async function replaceCell(
  versionId: string,
  cellId: string,
  cell: { variantKey: string; resolvedText: string; competitorOrder: string[] },
) {
  await assertDraft(versionId);
  const updated = await db
    .update(promptCells)
    .set({
      variantKey: cell.variantKey,
      resolvedText: cell.resolvedText,
      competitorOrderJson: cell.competitorOrder,
    })
    .where(and(eq(promptCells.id, cellId), eq(promptCells.matrixVersionId, versionId)))
    .returning({ id: promptCells.id });
  return updated.length;
}

export async function insertCell(versionId: string, cell: CellPlan) {
  await assertDraft(versionId);
  await db.insert(promptCells).values({
    matrixVersionId: versionId,
    intent: cell.intent,
    personaId: cell.personaId,
    marketId: cell.marketId,
    variantKey: cell.variantKey,
    resolvedText: cell.resolvedText,
    competitorOrderJson: cell.competitorOrder,
  });
  await syncCellCount(versionId);
}

export async function deleteCell(versionId: string, cellId: string) {
  await assertDraft(versionId);
  await db
    .delete(promptCells)
    .where(and(eq(promptCells.id, cellId), eq(promptCells.matrixVersionId, versionId)));
  await syncCellCount(versionId);
}

/** PM-10 / C-4: freeze the draft; supersede any previously approved version. */
export async function approveVersion(projectId: string, versionId: string) {
  await db.transaction(async (tx) => {
    await tx
      .update(matrixVersions)
      .set({ state: "superseded", supersededAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.state, "approved")),
      );
    const approved = await tx
      .update(matrixVersions)
      .set({ state: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(matrixVersions.id, versionId), eq(matrixVersions.state, "draft")))
      .returning({ id: matrixVersions.id });
    if (approved.length === 0) {
      throw new Error("Only draft versions can be approved");
    }
  });
}

/** PM-10: editing after approval means copying cells into a new draft. */
export async function copyToNewDraft(projectId: string, sourceVersionId: string) {
  const source = await getVersionWithCells(sourceVersionId);
  if (!source) throw new Error("Source version not found");
  return createDraftVersion(
    projectId,
    source.cells.map((c) => ({
      intent: c.intent,
      personaId: c.personaId,
      marketId: c.marketId,
      variantKey: c.variantKey,
      resolvedText: c.resolvedText,
      competitorOrder: (c.competitorOrderJson as string[]) ?? [],
    })),
  );
}
