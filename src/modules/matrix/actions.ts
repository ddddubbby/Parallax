"use server";

import { revalidatePath } from "next/cache";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import { isUuid } from "@/core/id";
import { findAliasOverlaps } from "@/core/intake";
import {
  allocateMatrix,
  brandRosterMatches,
  type BrandTerms,
  competitorOrderFromBrandOrder,
  type Intent,
  isAuditIntent,
  type MatrixContext,
  nextBalancedBrandOrder,
  renderRepresentationTemplate,
  renderTemplate,
  scanUnbrandedCells,
  trackedBrandRoster,
} from "@/core/matrix";
import type { FrameAspect } from "@/core/prompt-templates";
import {
  activateTemplatesForAspect,
  approveVersion,
  copyToNewDraft,
  createDraftVersion,
  deleteCell,
  getMarketLabelsForProject,
  getMatrixInputs,
  getPersonaLabelsForProject,
  getVersionWithCells,
  insertCell,
  replaceCell,
  updateCellText,
} from "@/db/repositories/matrix";

/**
 * PM-9-adjacent guard (M27/D-084, pinned decision 6a; M46/D-117): a
 * comparison-intent cell's rendered text interpolates {brand_list}; with
 * zero active competitors that renders as client-only rather than a true
 * comparison, so generation is blocked server-side with a clear error.
 */
const NO_ACTIVE_COMPETITORS_ERROR =
  "At least one active competitor is required for comparison prompts — unarchive a competitor or add a new one in Setup";

function storedBrandOrder(cell: {
  brandOrderJson?: unknown;
  competitorOrderJson?: unknown;
  resolvedText?: string;
}): string[] {
  if (Array.isArray(cell.brandOrderJson)) {
    return cell.brandOrderJson.filter((name): name is string => typeof name === "string");
  }
  return [];
}

type ActionResult =
  | { ok: true; versionId?: string }
  | { ok: false; error: string };

function validIds(...ids: string[]) {
  return ids.every(isUuid);
}

async function loadContext(projectId: string) {
  const inputs = await getMatrixInputs(projectId);
  if (!inputs || !inputs.client) return null;
  const ctx: MatrixContext = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: {
      name: inputs.client.name,
      aliases: (inputs.client.aliasesJson as string[]) ?? [],
    },
    competitors: inputs.competitors.map((c) => ({
      name: c.name,
      aliases: (c.aliasesJson as string[]) ?? [],
    })),
    attributes: inputs.attributes,
  };
  return { ...inputs, ctx };
}

function aliasOverlapError(brands: BrandTerms[]) {
  const overlaps = findAliasOverlaps(brands);
  if (overlaps.length === 0) return null;
  const first = overlaps[0];
  return `BC-3 alias overlap — "${first.value}" is tracked on both ${first.brands[0]} and ${first.brands[1]}${overlaps.length > 1 ? ` (+${overlaps.length - 1} more)` : ""}`;
}

export async function generateMatrix(projectId: string): Promise<ActionResult> {
  if (!validIds(projectId)) return { ok: false, error: "Invalid id" };
  const loaded = await loadContext(projectId);
  if (!loaded) return { ok: false, error: "Project intake is not complete" };
  if (loaded.project.status !== "active")
    return { ok: false, error: "Complete intake before generating a matrix" };
  if (loaded.personas.length === 0 || loaded.markets.length === 0)
    return { ok: false, error: "Personas and markets are required" };
  if (loaded.templates.length === 0)
    return { ok: false, error: "No active prompt templates seeded" };
  const overlapError = aliasOverlapError([loaded.ctx.clientBrand, ...loaded.ctx.competitors]);
  if (overlapError) return { ok: false, error: overlapError };
  if (loaded.ctx.competitors.length === 0)
    return { ok: false, error: NO_ACTIVE_COMPETITORS_ERROR };

  const cells = allocateMatrix(
    loaded.templates as Parameters<typeof allocateMatrix>[0],
    loaded.personas,
    loaded.markets,
    loaded.ctx,
  );
  if (cells.length === 0) return { ok: false, error: "Allocator produced no cells" };
  let version: Awaited<ReturnType<typeof createDraftVersion>>;
  try {
    version = await createDraftVersion(projectId, cells);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Matrix generation failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true, versionId: version.id };
}

/** PM-5/PM-6 server side: the 51st cell is rejected here regardless of UI state. */
export async function addCell(
  projectId: string,
  versionId: string,
  intent: Intent,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId)) return { ok: false, error: "Invalid id" };
  if (!isAuditIntent(intent)) return { ok: false, error: "Unknown audit intent" };
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId, projectId);
  if (!loaded || !existing) return { ok: false, error: "Not found" };
  if (existing.cells.length >= MAX_CELLS_PER_RUN)
    return { ok: false, error: `Cap reached: a run processes at most ${MAX_CELLS_PER_RUN} cells (C-1)` };
  if (intent === "comparison" && loaded.ctx.competitors.length === 0)
    return { ok: false, error: NO_ACTIVE_COMPETITORS_ERROR };

  const variants = loaded.templates
    .filter((t) => t.intent === intent)
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  const used = new Set(
    existing.cells
      .filter((c) => c.intent === intent)
      .map((c) => `${c.personaId}|${c.marketId}|${c.variantKey}`),
  );
  if (intent === "representation") {
    const template = variants.find(
      (candidate) =>
        !used.has(`null|null|${candidate.variantKey}`),
    );
    if (!template) {
      return { ok: false, error: "All fixed representation prompts are already present" };
    }
    try {
      await insertCell(
        versionId,
        {
          intent,
          personaId: null,
          marketId: null,
          variantKey: template.variantKey,
          resolvedText: renderRepresentationTemplate(
            template.templateText,
            loaded.ctx.clientBrand.name,
          ),
          competitorOrder: [],
          brandOrder: [],
        },
        projectId,
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Add cell failed" };
    }
    revalidatePath(`/projects/${projectId}/matrix`);
    return { ok: true };
  }
  const roster = trackedBrandRoster(loaded.ctx);
  const existingComparisonOrders = existing.cells
    .filter((c) => c.intent === "comparison")
    .map((c) => storedBrandOrder(c));
  for (const persona of loaded.personas) {
    for (const market of loaded.markets) {
      for (const template of variants) {
        const key = `${persona.id}|${market.id}|${template.variantKey}`;
        if (used.has(key)) continue;
        const brandOrder =
          intent === "comparison"
            ? nextBalancedBrandOrder(existingComparisonOrders, roster, Math.random)
            : [];
        const competitorOrder =
          intent === "comparison"
            ? competitorOrderFromBrandOrder(brandOrder, loaded.ctx.clientBrand.name)
            : [];
        try {
          await insertCell(versionId, {
            intent,
            personaId: persona.id,
            marketId: market.id,
            variantKey: template.variantKey,
            resolvedText: renderTemplate(template.templateText, {
              persona,
              market,
              ctx: loaded.ctx,
              competitorOrder,
              brandOrder,
            }),
            competitorOrder,
            brandOrder,
          }, projectId);
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Add cell failed" };
        }
        revalidatePath(`/projects/${projectId}/matrix`);
        return { ok: true };
      }
    }
  }
  return { ok: false, error: `No unused ${intent} combinations remain` };
}

export async function saveCellText(
  projectId: string,
  versionId: string,
  cellId: string,
  resolvedText: string,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId, cellId)) return { ok: false, error: "Invalid id" };
  const text = resolvedText.trim();
  if (!text) return { ok: false, error: "Prompt text cannot be empty" };
  const existing = await getVersionWithCells(versionId, projectId);
  const cell = existing?.cells.find((candidate) => candidate.id === cellId);
  if (!cell) return { ok: false, error: "Cell not found in this version" };
  if (cell.intent === "representation") {
    return { ok: false, error: "Representation prompts are fixed by the pinned protocol" };
  }
  try {
    const updated = await updateCellText(versionId, cellId, text, projectId);
    if (updated === 0) return { ok: false, error: "Cell not found in this version" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Update failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true };
}

/** PM-7: re-render the cell from the next variant template for its intent. */
export async function regenerateCell(
  projectId: string,
  versionId: string,
  cellId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId, cellId)) return { ok: false, error: "Invalid id" };
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId, projectId);
  const cell = existing?.cells.find((c) => c.id === cellId);
  if (!loaded || !existing || !cell) return { ok: false, error: "Not found" };

  if (cell.intent === "representation") {
    return { ok: false, error: "Representation prompts are fixed by the pinned protocol" };
  }

  if (cell.intent === "comparison" && loaded.ctx.competitors.length === 0)
    return { ok: false, error: NO_ACTIVE_COMPETITORS_ERROR };

  const variants = loaded.templates
    .filter((t) => t.intent === cell.intent)
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  if (variants.length === 0) return { ok: false, error: "No templates for this intent" };
  const currentIdx = variants.findIndex((v) => v.variantKey === cell.variantKey);
  const next = variants[(currentIdx + 1) % variants.length];

  // M27/D-084 two-reads rule: this cell's OWN persona/market may since have
  // been archived (excluded from loaded.personas/markets, the generation-
  // input lists) — look it up through the archived-inclusive label source
  // so regeneration re-renders for the persona/market the cell was actually
  // built for, never silently substituting an unrelated fallback.
  const [personaLabels, marketLabels] = await Promise.all([
    getPersonaLabelsForProject(projectId),
    getMarketLabelsForProject(projectId),
  ]);
  const persona =
    personaLabels.find((p) => p.id === cell.personaId) ?? loaded.personas[0];
  const market =
    marketLabels.find((m) => m.id === cell.marketId) ?? loaded.markets[0];
  if (!persona || !market) return { ok: false, error: "No persona/market available to render this cell" };
  // M46/D-117: keep frozen brand order unless the active roster changed.
  const roster = trackedBrandRoster(loaded.ctx);
  const frozen = storedBrandOrder(cell);
  const brandOrder =
    cell.intent === "comparison"
      ? brandRosterMatches(frozen, roster)
        ? frozen
        : nextBalancedBrandOrder(
            existing.cells
              .filter((c) => c.intent === "comparison" && c.id !== cellId)
              .map((c) => storedBrandOrder(c)),
            roster,
            Math.random,
          )
      : [];
  const competitorOrder =
    cell.intent === "comparison"
      ? competitorOrderFromBrandOrder(brandOrder, loaded.ctx.clientBrand.name)
      : [];
  try {
    const updated = await replaceCell(versionId, cellId, {
      intent: cell.intent,
      variantKey: next.variantKey,
      resolvedText: renderTemplate(next.templateText, {
        persona,
        market,
        ctx: loaded.ctx,
        competitorOrder,
        brandOrder,
      }),
      competitorOrder,
      brandOrder,
    }, projectId);
    if (updated === 0) return { ok: false, error: "Cell not found in this version" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Regenerate failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true };
}

export async function removeCell(
  projectId: string,
  versionId: string,
  cellId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId, cellId)) return { ok: false, error: "Invalid id" };
  const existing = await getVersionWithCells(versionId, projectId);
  const cell = existing?.cells.find((candidate) => candidate.id === cellId);
  if (!cell) return { ok: false, error: "Cell not found" };
  if (cell.intent === "representation") {
    return { ok: false, error: "Representation prompts are fixed by the pinned protocol" };
  }
  try {
    const deleted = await deleteCell(versionId, cellId, projectId);
    if (deleted === 0) return { ok: false, error: "Cell not found in this version" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Delete failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true };
}

/**
 * PM-6, PM-9, PM-10: server-side approval gate. Rejects over-cap versions,
 * scans unbranded intents for tracked brand terms, then freezes.
 */
export async function approveMatrix(
  projectId: string,
  versionId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId)) return { ok: false, error: "Invalid id" };
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId, projectId);
  if (!loaded || !existing) return { ok: false, error: "Not found" };

  if (existing.cells.length === 0)
    return { ok: false, error: "Cannot approve an empty matrix" };
  if (existing.cells.length > MAX_CELLS_PER_RUN)
    return { ok: false, error: `Cap exceeded: ${existing.cells.length} > ${MAX_CELLS_PER_RUN} (PM-6)` };

  const allBrands: BrandTerms[] = [loaded.ctx.clientBrand, ...loaded.ctx.competitors];
  const overlapError = aliasOverlapError(allBrands);
  if (overlapError) return { ok: false, error: overlapError };
  const violations = scanUnbrandedCells(existing.cells, allBrands);
  if (violations.length > 0) {
    const first = `${violations[0].intent} cell contains tracked brand terms: ${violations[0].terms.join(", ")}`;
    return { ok: false, error: `PM-9 violation — ${first}${violations.length > 1 ? ` (+${violations.length - 1} more)` : ""}` };
  }

  try {
    await approveVersion(projectId, versionId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Approval failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true };
}

/** PM-10: edits after approval go into a fresh draft copy. */
export async function newDraftFromVersion(
  projectId: string,
  versionId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, versionId)) return { ok: false, error: "Invalid id" };
  try {
    const version = await copyToNewDraft(projectId, versionId);
    revalidatePath(`/projects/${projectId}/matrix`);
    return { ok: true, versionId: version.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Copy failed" };
  }
}

/**
 * M23 (D-079): the coverage panel's "activate" control — flips the seeded
 * opt-in price/promo templates whose declared aspect matches from
 * active:false to active:true for the project's archetype. Archetype-scoped
 * (prompt_templates has no per-project dimension): this changes the pool
 * for every project sharing the archetype's future `generateMatrix`/
 * `addCell` calls, never existing approved matrices (C-4).
 */
export async function activateCoverageAspectAction(
  projectId: string,
  aspect: FrameAspect,
): Promise<ActionResult> {
  if (!validIds(projectId)) return { ok: false, error: "Invalid id" };
  const inputs = await getMatrixInputs(projectId);
  if (!inputs) return { ok: false, error: "Project not found" };
  try {
    const activated = await activateTemplatesForAspect(inputs.project.categoryArchetype, aspect);
    if (activated === 0) return { ok: false, error: "No inactive templates found for that aspect" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Activation failed" };
  }
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true };
}
