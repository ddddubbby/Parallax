import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Intent } from "@/core/matrix";
import { metricAllowsIntent } from "@/core/semantic";
import { db } from "../client";
import { auditRuns, brands, extractions, metrics, promptCells, responses } from "../schema";
import { getEligibleExtractionsForRun } from "./extraction";

/** EX-3: raw responses for a run — the base evidence every other export trace back to (C-3). */
export async function getExportResponses(runId: string) {
  return db
    .select({
      id: responses.id,
      cellId: responses.cellId,
      providerId: responses.providerId,
      generationMode: responses.generationMode,
      modelVersion: responses.modelVersion,
      tokensIn: responses.tokensIn,
      tokensOut: responses.tokensOut,
      costUsd: responses.costUsd,
      latencyMs: responses.latencyMs,
      rawText: responses.rawText,
      createdAt: responses.createdAt,
    })
    .from(responses)
    .where(eq(responses.runId, runId))
    .orderBy(desc(responses.createdAt));
}

export async function getExportExtractions(runId: string) {
  const rows = await db
    .select({
      id: extractions.id,
      responseId: extractions.responseId,
      extractionVersion: extractions.extractionVersion,
      state: extractions.state,
      extractionModel: extractions.extractionModel,
      extractedJson: extractions.extractedJson,
      validationError: extractions.validationError,
      createdAt: extractions.createdAt,
    })
    .from(extractions)
    .innerJoin(responses, eq(responses.id, extractions.responseId))
    .where(eq(responses.runId, runId))
    // Deterministic order: report generation picks embeddingModel via .find()
    // over this result, so an unordered scan could make regenerated reports
    // differ on identical data (D-061 byte-stability).
    .orderBy(asc(extractions.responseId), asc(extractions.extractionVersion));
  return rows;
}

export async function getExportMetrics(runId: string) {
  return db
    .select({
      scopeType: metrics.scopeType,
      scopeKey: metrics.scopeKey,
      metricKey: metrics.metricKey,
      n: metrics.n,
      value: metrics.value,
      ciLow: metrics.ciLow,
      ciHigh: metrics.ciHigh,
      metadataJson: metrics.metadataJson,
      computedAt: metrics.computedAt,
    })
    .from(metrics)
    .where(eq(metrics.runId, runId))
    .orderBy(asc(metrics.scopeType), asc(metrics.scopeKey), asc(metrics.metricKey), asc(metrics.computedAt));
}

/**
 * CS-3: per-brand metrics with brand names resolved (the metrics CSV carries
 * only UUID scope keys). One readable row per (brand, metric) — the client
 * ranked against every competitor across the D-054-framed metrics.
 */
export async function getExportBrandMetrics(runId: string) {
  return db
    .select({
      brandName: brands.name,
      brandRole: brands.role,
      metricKey: metrics.metricKey,
      n: metrics.n,
      value: metrics.value,
      ciLow: metrics.ciLow,
      ciHigh: metrics.ciHigh,
    })
    .from(metrics)
    .innerJoin(brands, sql`${brands.id}::text = ${metrics.scopeKey}`)
    .where(and(eq(metrics.runId, runId), eq(metrics.scopeType, "brand")))
    .orderBy(brands.role, brands.name, metrics.metricKey);
}

/** Citations are embedded per-extraction JSON, not a separate table — flatten them for export. */
export async function getExportCitations(runId: string) {
  const [extractionRows, cellRows] = await Promise.all([
    getEligibleExtractionsForRun(runId),
    db
      .select({ id: promptCells.id, intent: promptCells.intent })
      .from(promptCells)
      .innerJoin(auditRuns, eq(auditRuns.matrixVersionId, promptCells.matrixVersionId))
      .where(eq(auditRuns.id, runId)),
  ]);
  const intentByCell = new Map(cellRows.map((cell) => [cell.id, cell.intent as Intent]));
  const rows: Array<{ responseId: string; url: string; domain: string; title: string | null; citedForBrandIds: string }> = [];
  for (const ext of extractionRows) {
    if (!metricAllowsIntent("citation_share", intentByCell.get(ext.cellId) ?? null)) continue;
    const payload = ext.extractedJson as { citations?: Array<{ url: string; domain: string; title: string | null; cited_for_brand_ids: string[] }> } | null;
    for (const c of payload?.citations ?? []) {
      rows.push({
        responseId: ext.responseId,
        url: c.url,
        domain: c.domain,
        title: c.title,
        citedForBrandIds: c.cited_for_brand_ids.join(";"),
      });
    }
  }
  return rows;
}
