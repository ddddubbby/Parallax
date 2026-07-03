import { desc, eq } from "drizzle-orm";
import { db } from "../client";
import { extractions, metrics, responses } from "../schema";

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
    .where(eq(responses.runId, runId));
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
      computedAt: metrics.computedAt,
    })
    .from(metrics)
    .where(eq(metrics.runId, runId));
}

/** Citations are embedded per-extraction JSON, not a separate table — flatten them for export. */
export async function getExportCitations(runId: string) {
  const extractionRows = await getExportExtractions(runId);
  const rows: Array<{ responseId: string; url: string; domain: string; title: string | null; citedForBrandIds: string }> = [];
  for (const ext of extractionRows) {
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
