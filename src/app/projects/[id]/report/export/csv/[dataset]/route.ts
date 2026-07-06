import { NextRequest } from "next/server";
import { toCsv } from "@/core/csv";
import { isUuid } from "@/core/id";
import { resonanceExportMetadata, type ResonanceExportStudyLabel } from "@/core/resonance";
import { csvDatasetsForKind } from "@/core/report-templates";
import { isReportableRunState } from "@/core/runner";
import { getExportBrandMetrics, getExportCitations, getExportExtractions, getExportMetrics, getExportResponses } from "@/db/repositories/export";
import { recomputeMetrics } from "@/db/repositories/metrics";
import { getResonanceStudyExportLabel } from "@/db/repositories/resonance";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { reportError } from "@/observability";

// EX-3, D-013: synchronous download, one CSV per dataset (each has a
// different shape — responses/extractions/metrics/citations don't share
// columns, so one combined CSV isn't natural; see /export/json for a
// single-file bundle instead).
function withResonanceExportColumns<T extends Record<string, unknown>>(
  rows: T[],
  study: ResonanceExportStudyLabel | null,
) {
  const metadata = resonanceExportMetadata(study);
  return rows.map((row) => ({
    simulationLabel: metadata?.label ?? "SIMULATED",
    genericUnconditioned: metadata?.genericUnconditioned ?? null,
    studyId: metadata?.studyId ?? null,
    studyName: metadata?.studyName ?? null,
    ...row,
  }));
}

async function buildCsv(
  dataset: string,
  runId: string,
  kind: string,
  resonanceStudy: ResonanceExportStudyLabel | null,
): Promise<string | null> {
  if (kind === "resonance") {
    switch (dataset) {
      case "resonance_responses": {
        const rows = withResonanceExportColumns(await getExportResponses(runId), resonanceStudy);
        return toCsv(rows, [
          "simulationLabel", "genericUnconditioned", "studyId", "studyName",
          "id", "cellId", "providerId", "generationMode", "modelVersion",
          "tokensIn", "tokensOut", "costUsd", "latencyMs", "rawText", "createdAt",
        ]);
      }
      case "resonance_metrics": {
        const rows = withResonanceExportColumns(
          (await getExportMetrics(runId)).map((m) => ({
            ...m,
            metadataJson: JSON.stringify(m.metadataJson),
          })),
          resonanceStudy,
        );
        return toCsv(rows, [
          "simulationLabel", "genericUnconditioned", "studyId", "studyName",
          "scopeType", "scopeKey", "metricKey", "n", "value", "ciLow", "ciHigh", "metadataJson", "computedAt",
        ]);
      }
      default:
        return null;
    }
  }

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
  if (!isUuid(id)) return Response.json({ error: "invalid project id" }, { status: 400 });
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });
  if (!isUuid(runId)) return Response.json({ error: "invalid runId" }, { status: 400 });

  const run = await getRun(runId);
  if (!run || run.projectId !== id) return Response.json({ error: "not found" }, { status: 404 });
  if (!isReportableRunState(run.state)) return Response.json({ error: "run must be completed before export" }, { status: 409 });

  try {
    const kind = await getRunMatrixKind(runId);
    if (!(csvDatasetsForKind(kind?.kind) as readonly string[]).includes(dataset)) {
      return Response.json({ error: "unknown dataset" }, { status: 404 });
    }
    const resonanceStudy =
      kind?.kind === "resonance" && kind.resonanceStudyId
        ? await getResonanceStudyExportLabel(id, kind.resonanceStudyId)
        : null;
    await recomputeMetrics(runId);

    const csv = await buildCsv(dataset, runId, kind?.kind ?? "audit", resonanceStudy);
    if (csv === null) return Response.json({ error: "unknown dataset" }, { status: 404 });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dataset}-${runId}.csv"`,
      },
    });
  } catch (err) {
    // Unexpected generation failure (DB fault, recompute error). Return a
    // sanitized 500 rather than leaking a stack/internal detail to the client.
    reportError(err, { boundary: "export-csv", projectId: id, runId, dataset });
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
