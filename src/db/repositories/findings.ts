import { eq } from "drizzle-orm";
import type { CellBrandPresence, Finding } from "@/core/findings";
import { db } from "../client";
import { auditRuns, brands, findings, promptCells } from "../schema";
import { getBrandMentionsForExtractions, getEligibleExtractionsForRun } from "./extraction";

/**
 * Lost-shortlist input: per (cell, mode) client rate and the strongest
 * competitor's rate. Not in the `metrics` table — every existing scope
 * there tracks the client brand only, never a per-competitor breakdown.
 */
export async function getCellBrandPresence(runId: string): Promise<CellBrandPresence[]> {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId));
  if (!run) return [];

  const [projectBrands, eligible, cellRows] = await Promise.all([
    db.select({ id: brands.id, role: brands.role, name: brands.name }).from(brands).where(eq(brands.projectId, run.projectId)),
    getEligibleExtractionsForRun(runId),
    db
      .select({ id: promptCells.id, intent: promptCells.intent })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, run.matrixVersionId)),
  ]);
  const clientBrandId = projectBrands.find((b) => b.role === "client")?.id ?? null;
  const competitors = projectBrands.filter((b) => b.role === "competitor");
  const cellById = new Map(cellRows.map((c) => [c.id, c]));
  const extractionIds = eligible.map((e) => e.extractionId);
  const allMentions = await getBrandMentionsForExtractions(extractionIds);
  const mentionsByExtraction = new Map<string, typeof allMentions>();
  for (const m of allMentions) {
    if (!mentionsByExtraction.has(m.extractionId)) mentionsByExtraction.set(m.extractionId, []);
    mentionsByExtraction.get(m.extractionId)!.push(m);
  }

  const groups = new Map<string, { cellId: string; intent: string; samples: typeof allMentions[] }>();
  for (const e of eligible) {
    const cell = cellById.get(e.cellId);
    if (!cell || cell.intent === "representation") continue;
    const key = `${e.cellId}|${e.generationMode}`;
    if (!groups.has(key)) groups.set(key, { cellId: e.cellId, intent: cell.intent, samples: [] });
    groups.get(key)!.samples.push(mentionsByExtraction.get(e.extractionId) ?? []);
  }

  const result: CellBrandPresence[] = [];
  for (const { cellId, intent, samples } of groups.values()) {
    const n = samples.length;
    if (n === 0) continue;
    const clientRate = samples.filter((s) => s.some((m) => m.brandId === clientBrandId)).length / n;
    let topCompetitorName = "";
    let topCompetitorRate = 0;
    for (const comp of competitors) {
      const rate = samples.filter((s) => s.some((m) => m.brandId === comp.id)).length / n;
      if (rate > topCompetitorRate) {
        topCompetitorRate = rate;
        topCompetitorName = comp.name;
      }
    }
    if (topCompetitorName) result.push({ cellId, intent, clientRate, topCompetitorName, topCompetitorRate, n });
  }
  return result;
}

/** Derived, regenerate-only (spec §2) — same disposable delete-then-rebuild pattern as metrics (C-3/C-5). */
export async function saveFindings(runId: string, computed: Finding[]) {
  await db.transaction(async (tx) => {
    await tx.delete(findings).where(eq(findings.runId, runId));
    for (const f of computed) {
      await tx.insert(findings).values({
        runId,
        findingType: f.findingType,
        severity: f.severity,
        title: f.title,
        bodyMd: f.bodyMd,
        evidenceJson: { ...f.evidence, directionalOnly: f.directionalOnly },
      });
    }
  });
  return computed.length;
}

export async function listFindings(runId: string) {
  return db.select().from(findings).where(eq(findings.runId, runId));
}
