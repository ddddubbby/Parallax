import { and, asc, desc, eq, isNull, max, sql } from "drizzle-orm";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import {
  isAuditIntent,
  marketContextViolationMessage,
  renderMarketContextPrompt,
  scanMarketContextCells,
  type CellPlan,
} from "@/core/matrix";
import { frameAspectsForTemplate, TEMPLATE_SEED, type FrameAspect } from "@/core/prompt-templates";
import type { CategoryArchetype } from "@/core/semantic";
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

/**
 * Everything the allocator needs, loaded from the completed intake. M27
 * (D-084): brands/personas/markets are filtered to ACTIVE (archived_at is
 * null) — this is the "generation-input" side of the two-reads rule, since
 * these lists decide what NEW cells the allocator/addCell/PM-9 scan produce.
 * Label-resolution for EXISTING cells (which may reference an archived
 * persona/market/brand) must use the separate archived-inclusive helpers
 * below (getPersonaLabelsForProject/getMarketLabelsForProject), never this
 * function's arrays.
 */
export async function getMatrixInputs(projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      category: projects.category,
      categoryArchetype: projects.categoryArchetype,
      jobToBeDone: projects.jobToBeDone,
      setupUpdatedAt: projects.setupUpdatedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;

  const [projectBrands, projectPersonas, projectMarkets, projectAttributes, templates] =
    await Promise.all([
      db
        .select()
        .from(brands)
        .where(and(eq(brands.projectId, projectId), isNull(brands.archivedAt))),
      db
        .select({ id: personas.id, title: personas.title })
        .from(personas)
        .where(and(eq(personas.projectId, projectId), isNull(personas.archivedAt)))
        .orderBy(asc(personas.priority)),
      db
        .select({ id: markets.id, name: markets.name })
        .from(markets)
        .where(and(eq(markets.projectId, projectId), isNull(markets.archivedAt)))
        .orderBy(asc(markets.priority)),
      db
        .select({ name: attributes.name })
        .from(attributes)
        .where(eq(attributes.projectId, projectId))
        .orderBy(asc(attributes.priority)),
      db
        .select({
          intent: promptTemplates.intent,
          archetype: promptTemplates.archetype,
          variantKey: promptTemplates.variantKey,
          templateText: promptTemplates.templateText,
        })
        .from(promptTemplates)
        .where(
          and(
            eq(promptTemplates.active, true),
            eq(promptTemplates.archetype, project.categoryArchetype),
          ),
        ),
    ]);

  const client = projectBrands.find((b) => b.role === "client");
  const competitors = projectBrands
    .filter((b) => b.role === "competitor")
    .sort((a, b) => a.priority - b.priority);

  return { project, client, competitors, personas: projectPersonas, markets: projectMarkets, attributes: projectAttributes.map((a) => a.name), templates };
}

/**
 * Archived-inclusive persona/market label lookups (M27, D-084): the
 * label-resolution side of the two-reads rule. Used to resolve an EXISTING
 * `prompt_cells.persona_id`/`market_id` (any historical version, approved or
 * draft) into a display title/name even after the persona/market has since
 * been archived in Setup — never used to decide what gets generated.
 */
export async function getPersonaLabelsForProject(projectId: string) {
  return db
    .select({ id: personas.id, title: personas.title, archivedAt: personas.archivedAt })
    .from(personas)
    .where(eq(personas.projectId, projectId))
    .orderBy(asc(personas.priority));
}

export async function getMarketLabelsForProject(projectId: string) {
  return db
    .select({ id: markets.id, name: markets.name, archivedAt: markets.archivedAt })
    .from(markets)
    .where(eq(markets.projectId, projectId))
    .orderBy(asc(markets.priority));
}

/**
 * M23 (D-079): the operator-facing "matrix builder control" for the coverage
 * panel's gap stamps. Opt-in price/promo templates seed inactive (D-016
 * risk mitigation); this flips `active` on the seeded rows for one archetype
 * whose declared frame aspect matches, so a deliberate operator click — not
 * a silent default — is what changes future `generateMatrix`/`addCell`
 * pools. Archetype-scoped (the `prompt_templates` table has no per-project
 * dimension), so activating affects every project sharing the archetype
 * going forward; already-approved matrices stay frozen (C-4) regardless.
 */
export async function activateTemplatesForAspect(
  archetype: CategoryArchetype,
  aspect: FrameAspect,
): Promise<number> {
  const matches = TEMPLATE_SEED.filter(
    (t) => t.archetype === archetype && frameAspectsForTemplate(t).includes(aspect) && t.active === false,
  );
  let activated = 0;
  for (const t of matches) {
    const updated = await db
      .update(promptTemplates)
      .set({ active: true, updatedAt: new Date() })
      .where(
        and(
          eq(promptTemplates.archetype, t.archetype),
          eq(promptTemplates.intent, t.intent),
          eq(promptTemplates.variantKey, t.variantKey),
          eq(promptTemplates.active, false),
        ),
      )
      .returning({ id: promptTemplates.id });
    activated += updated.length;
  }
  return activated;
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
    .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.kind, "audit")))
    .orderBy(desc(matrixVersions.version));
}

export async function getVersionWithCells(versionId: string, projectId?: string) {
  const versionWhere = projectId
    ? and(
        eq(matrixVersions.id, versionId),
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
      )
    : and(eq(matrixVersions.id, versionId), eq(matrixVersions.kind, "audit"));
  const [version] = await db
    .select()
    .from(matrixVersions)
    .where(versionWhere);
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
      brandOrderJson: promptCells.brandOrderJson,
    })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, versionId))
    .orderBy(asc(promptCells.createdAt));
  return {
    version,
    cells: cells.map((cell) => {
      if (!isAuditIntent(cell.intent)) {
        throw new Error("Audit matrix view cannot load simulation cells (C-12)");
      }
      return { ...cell, intent: cell.intent };
    }),
  };
}

/** M46/D-117: comparison cells must carry a full brand order; derive competitor provenance. */
function persistableOrders(cell: {
  intent: string;
  brandOrder: string[];
  competitorOrder: string[];
}): { brandOrderJson: string[] | null; competitorOrderJson: string[] } {
  if (cell.intent !== "comparison") {
    return { brandOrderJson: [], competitorOrderJson: [] };
  }
  const brandOrder = cell.brandOrder;
  if (!Array.isArray(brandOrder) || brandOrder.length < 2) {
    throw new Error(
      "Comparison cells require brand_order_json with client + competitors (M46/D-117)",
    );
  }
  if (new Set(brandOrder).size !== brandOrder.length) {
    throw new Error("brand_order_json must not contain duplicate brand names (M46/D-117)");
  }
  const competitorOrder = cell.competitorOrder;
  if (competitorOrder.length !== brandOrder.length - 1) {
    throw new Error(
      "competitor_order_json must be brand_order_json without the client (M46/D-117)",
    );
  }
  for (const name of competitorOrder) {
    if (!brandOrder.includes(name)) {
      throw new Error(
        "competitor_order_json must be a subset of brand_order_json (M46/D-117)",
      );
    }
  }
  return { brandOrderJson: brandOrder, competitorOrderJson: competitorOrder };
}

export type CellInput = Omit<CellPlan, "personaId" | "marketId"> & {
  personaId: string | null;
  marketId: string | null;
};

/** Create the next draft version for a project with the given cells. */
export async function createDraftVersion(projectId: string, cells: CellInput[]) {
  if (cells.length > MAX_CELLS_PER_RUN) {
    throw new Error(`Cap exceeded: ${cells.length} > ${MAX_CELLS_PER_RUN} (C-1)`);
  }
  return db.transaction(async (tx) => {
    const [{ latest }] = await tx
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const [version] = await tx
      .insert(matrixVersions)
      .values({
        projectId,
        kind: "audit",
        version: (latest ?? 0) + 1,
        cellCount: cells.length,
      })
      .returning({ id: matrixVersions.id, version: matrixVersions.version });
    for (const cell of cells) {
      const orders = persistableOrders(cell);
      await tx.insert(promptCells).values({
        matrixVersionId: version.id,
        intent: cell.intent,
        personaId: cell.personaId,
        marketId: cell.marketId,
        variantKey: cell.variantKey,
        resolvedText: cell.resolvedText,
        competitorOrderJson: orders.competitorOrderJson,
        brandOrderJson: orders.brandOrderJson,
      });
    }
    return version;
  });
}

async function assertDraft(versionId: string, projectId?: string) {
  const versionWhere = projectId
    ? and(
        eq(matrixVersions.id, versionId),
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
      )
    : and(eq(matrixVersions.id, versionId), eq(matrixVersions.kind, "audit"));
  const [version] = await db
      .select({ state: matrixVersions.state })
      .from(matrixVersions)
      .where(versionWhere);
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
export async function updateCellText(versionId: string, cellId: string, resolvedText: string, projectId?: string) {
  await assertDraft(versionId, projectId);
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
  cell: {
    variantKey: string;
    resolvedText: string;
    competitorOrder: string[];
    brandOrder: string[];
    intent: string;
  },
  projectId?: string,
) {
  await assertDraft(versionId, projectId);
  const orders = persistableOrders(cell);
  const updated = await db
    .update(promptCells)
    .set({
      variantKey: cell.variantKey,
      resolvedText: cell.resolvedText,
      competitorOrderJson: orders.competitorOrderJson,
      brandOrderJson: orders.brandOrderJson,
    })
    .where(and(eq(promptCells.id, cellId), eq(promptCells.matrixVersionId, versionId)))
    .returning({ id: promptCells.id });
  return updated.length;
}

export async function insertCell(versionId: string, cell: CellPlan, projectId?: string) {
  await assertDraft(versionId, projectId);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, versionId));
  if (n >= MAX_CELLS_PER_RUN) {
    throw new Error(`Cap reached: a run processes at most ${MAX_CELLS_PER_RUN} cells (C-1)`);
  }
  const orders = persistableOrders(cell);
  await db.insert(promptCells).values({
    matrixVersionId: versionId,
    intent: cell.intent,
    personaId: cell.personaId,
    marketId: cell.marketId,
    variantKey: cell.variantKey,
    resolvedText: cell.resolvedText,
    competitorOrderJson: orders.competitorOrderJson,
    brandOrderJson: orders.brandOrderJson,
  });
  await syncCellCount(versionId);
}

export async function deleteCell(versionId: string, cellId: string, projectId?: string) {
  await assertDraft(versionId, projectId);
  const deleted = await db
    .delete(promptCells)
    .where(and(eq(promptCells.id, cellId), eq(promptCells.matrixVersionId, versionId)))
    .returning({ id: promptCells.id });
  if (deleted.length === 0) return 0;
  await syncCellCount(versionId);
  return deleted.length;
}

/** PM-10 / C-4: freeze the draft; supersede any previously approved version. */
export async function approveVersion(projectId: string, versionId: string) {
  await db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, versionId));
    if (n > MAX_CELLS_PER_RUN) {
      throw new Error(`Cap exceeded: ${n} > ${MAX_CELLS_PER_RUN} (C-1)`);
    }

    const approvalCells = await tx
      .select({
        id: promptCells.id,
        intent: promptCells.intent,
        marketId: promptCells.marketId,
        variantKey: promptCells.variantKey,
        resolvedText: promptCells.resolvedText,
      })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, versionId));
    const projectMarkets = await tx
      .select({ id: markets.id, name: markets.name })
      .from(markets)
      .where(eq(markets.projectId, projectId));
    const marketViolations = scanMarketContextCells(approvalCells, projectMarkets);
    if (marketViolations.length > 0) {
      throw new Error(marketContextViolationMessage(marketViolations));
    }

    await tx
      .update(matrixVersions)
      .set({ state: "superseded", supersededAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(matrixVersions.projectId, projectId),
          eq(matrixVersions.kind, "audit"),
          eq(matrixVersions.state, "approved"),
        ),
      );
    const approved = await tx
      .update(matrixVersions)
      .set({ state: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(matrixVersions.id, versionId),
          eq(matrixVersions.projectId, projectId),
          eq(matrixVersions.kind, "audit"),
          eq(matrixVersions.state, "draft"),
        ),
      )
      .returning({ id: matrixVersions.id });
    if (approved.length === 0) {
      throw new Error("Only draft versions can be approved");
    }
  });
}

/** PM-10: editing after approval means copying cells into a new draft. */
export async function copyToNewDraft(projectId: string, sourceVersionId: string) {
  const source = await getVersionWithCells(sourceVersionId, projectId);
  if (!source) throw new Error("Source version not found");
  const [inputs, marketLabels] = await Promise.all([
    getMatrixInputs(projectId),
    getMarketLabelsForProject(projectId),
  ]);
  const clientName = inputs?.client?.name ?? "";
  const marketById = new Map(marketLabels.map((market) => [market.id, market.name]));
  return createDraftVersion(
    projectId,
    source.cells.map((c) => {
      const competitorOrder = (c.competitorOrderJson as string[]) ?? [];
      const stored = c.brandOrderJson as string[] | null;
      // Pre-M46 rows have null brand_order_json; reconstruct client-first from
      // competitor provenance so the draft satisfies the M46 persist backstop
      // without rewriting frozen resolvedText (C-4).
      const brandOrder =
        Array.isArray(stored) && stored.length > 0
          ? stored
          : c.intent === "comparison" && clientName
            ? [clientName, ...competitorOrder]
            : [];
      const marketName = c.marketId ? marketById.get(c.marketId) : undefined;
      return {
        intent: c.intent,
        personaId: c.personaId,
        marketId: c.marketId,
        variantKey: c.variantKey,
        resolvedText:
          c.intent !== "representation" && marketName
            ? renderMarketContextPrompt(c.resolvedText, marketName)
            : c.resolvedText,
        competitorOrder,
        brandOrder,
      };
    }),
  );
}
