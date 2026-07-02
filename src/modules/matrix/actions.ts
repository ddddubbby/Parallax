"use server";

import { revalidatePath } from "next/cache";
import { MAX_CELLS_PER_RUN } from "@/core/constants";
import {
  allocateMatrix,
  type BrandTerms,
  findBrandTerms,
  type Intent,
  type MatrixContext,
  renderTemplate,
  shuffle,
  UNBRANDED_INTENTS,
} from "@/core/matrix";
import {
  approveVersion,
  copyToNewDraft,
  createDraftVersion,
  deleteCell,
  getMatrixInputs,
  getVersionWithCells,
  insertCell,
  replaceCell,
  updateCellText,
} from "@/db/repositories/matrix";

type ActionResult =
  | { ok: true; versionId?: string }
  | { ok: false; error: string };

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

export async function generateMatrix(projectId: string): Promise<ActionResult> {
  const loaded = await loadContext(projectId);
  if (!loaded) return { ok: false, error: "Project intake is not complete" };
  if (loaded.project.status !== "active")
    return { ok: false, error: "Complete intake before generating a matrix" };
  if (loaded.personas.length === 0 || loaded.markets.length === 0)
    return { ok: false, error: "Personas and markets are required" };
  if (loaded.templates.length === 0)
    return { ok: false, error: "No active prompt templates seeded" };

  const cells = allocateMatrix(
    loaded.templates as Parameters<typeof allocateMatrix>[0],
    loaded.personas,
    loaded.markets,
    loaded.ctx,
  );
  if (cells.length === 0) return { ok: false, error: "Allocator produced no cells" };
  const version = await createDraftVersion(projectId, cells);
  revalidatePath(`/projects/${projectId}/matrix`);
  return { ok: true, versionId: version.id };
}

/** PM-5/PM-6 server side: the 51st cell is rejected here regardless of UI state. */
export async function addCell(
  projectId: string,
  versionId: string,
  intent: Intent,
): Promise<ActionResult> {
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId);
  if (!loaded || !existing) return { ok: false, error: "Not found" };
  if (existing.cells.length >= MAX_CELLS_PER_RUN)
    return { ok: false, error: `Cap reached: a run processes at most ${MAX_CELLS_PER_RUN} cells (C-1)` };

  const variants = loaded.templates
    .filter((t) => t.intent === intent)
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  const used = new Set(
    existing.cells
      .filter((c) => c.intent === intent)
      .map((c) => `${c.personaId}|${c.marketId}|${c.variantKey}`),
  );
  for (const persona of loaded.personas) {
    for (const market of loaded.markets) {
      for (const template of variants) {
        const key = `${persona.id}|${market.id}|${template.variantKey}`;
        if (used.has(key)) continue;
        const competitorOrder =
          intent === "comparison"
            ? shuffle(loaded.ctx.competitors.map((c) => c.name), Math.random)
            : [];
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
          }),
          competitorOrder,
        });
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
  const text = resolvedText.trim();
  if (!text) return { ok: false, error: "Prompt text cannot be empty" };
  try {
    const updated = await updateCellText(versionId, cellId, text);
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
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId);
  const cell = existing?.cells.find((c) => c.id === cellId);
  if (!loaded || !existing || !cell) return { ok: false, error: "Not found" };

  const variants = loaded.templates
    .filter((t) => t.intent === cell.intent)
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
  if (variants.length === 0) return { ok: false, error: "No templates for this intent" };
  const currentIdx = variants.findIndex((v) => v.variantKey === cell.variantKey);
  const next = variants[(currentIdx + 1) % variants.length];

  const persona =
    loaded.personas.find((p) => p.id === cell.personaId) ?? loaded.personas[0];
  const market =
    loaded.markets.find((m) => m.id === cell.marketId) ?? loaded.markets[0];
  const competitorOrder =
    cell.intent === "comparison"
      ? shuffle(loaded.ctx.competitors.map((c) => c.name), Math.random)
      : [];
  try {
    await replaceCell(versionId, cellId, {
      variantKey: next.variantKey,
      resolvedText: renderTemplate(next.templateText, {
        persona,
        market,
        ctx: loaded.ctx,
        competitorOrder,
      }),
      competitorOrder,
    });
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
  try {
    await deleteCell(versionId, cellId);
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
  const loaded = await loadContext(projectId);
  const existing = await getVersionWithCells(versionId);
  if (!loaded || !existing) return { ok: false, error: "Not found" };

  if (existing.cells.length === 0)
    return { ok: false, error: "Cannot approve an empty matrix" };
  if (existing.cells.length > MAX_CELLS_PER_RUN)
    return { ok: false, error: `Cap exceeded: ${existing.cells.length} > ${MAX_CELLS_PER_RUN} (PM-6)` };

  const allBrands: BrandTerms[] = [loaded.ctx.clientBrand, ...loaded.ctx.competitors];
  const violations: string[] = [];
  for (const cell of existing.cells) {
    if (!UNBRANDED_INTENTS.includes(cell.intent)) continue;
    const terms = findBrandTerms(cell.resolvedText, allBrands);
    if (terms.length > 0)
      violations.push(`${cell.intent} cell contains tracked brand terms: ${terms.join(", ")}`);
  }
  if (violations.length > 0)
    return { ok: false, error: `PM-9 violation — ${violations[0]}${violations.length > 1 ? ` (+${violations.length - 1} more)` : ""}` };

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
  try {
    const version = await copyToNewDraft(projectId, versionId);
    revalidatePath(`/projects/${projectId}/matrix`);
    return { ok: true, versionId: version.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Copy failed" };
  }
}
