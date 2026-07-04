import { NextRequest } from "next/server";
import { toCsv } from "@/core/csv";
import { getExportBrandMetrics, getExportCitations, getExportExtractions, getExportMetrics, getExportResponses } from "@/db/repositories/export";
import { getRun } from "@/db/repositories/runner";

// EX-3, D-013: synchronous download, one CSV per dataset (each has a
// different shape — responses/extractions/metrics/citations don't share
// columns, so one combined CSV isn't natural; see /export/json for a
// single-file bundle instead).
async function buildCsv(dataset: string, runId: string): Promise<string | null> {
  switch (dataset) {
    case "responses":
      return toCsv(await getExportResponses(runId), [
        "id", "cellId", "providerId", "generationMode", "modelVersion",
        "tokensIn", "tokensOut", "costUsd", "latencyMs", "rawText", "createdAt",
      ]);
    case "extractions": {
      const rows = (await getExportExtractions(runId)).map((e) => ({
        ...e,
        extractedJson: JSON.stringify(e.extractedJson),
      }));
      return toCsv(rows, [
        "id", "responseId", "extractionVersion", "state", "extractionModel",
        "validationError", "extractedJson", "createdAt",
      ]);
    }
    case "metrics":
      return toCsv(await getExportMetrics(runId), [
        "scopeType", "scopeKey", "metricKey", "n", "value", "ciLow", "ciHigh", "computedAt",
      ]);
    case "brand_metrics":
      return toCsv(await getExportBrandMetrics(runId), [
        "brandName", "brandRole", "metricKey", "n", "value", "ciLow", "ciHigh",
      ]);
    case "citations":
      return toCsv(await getExportCitations(runId), [
        "responseId", "url", "domain", "title", "citedForBrandIds",
      ]);
    default:
      return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dataset: string }> },
) {
  const { id, dataset } = await params;
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run || run.projectId !== id) return Response.json({ error: "not found" }, { status: 404 });

  const csv = await buildCsv(dataset, runId);
  if (csv === null) return Response.json({ error: "unknown dataset" }, { status: 404 });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${dataset}-${runId}.csv"`,
    },
  });
}
