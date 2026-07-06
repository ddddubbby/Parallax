import { NextRequest } from "next/server";
import { isUuid } from "@/core/id";
import { resonanceExportMetadata } from "@/core/resonance";
import { isReportableRunState } from "@/core/runner";
import { getExportCitations, getExportExtractions, getExportMetrics, getExportResponses } from "@/db/repositories/export";
import { recomputeMetrics } from "@/db/repositories/metrics";
import { getResonanceStudyExportLabel } from "@/db/repositories/resonance";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { reportError } from "@/observability";

// EX-3, D-013: synchronous download, one file, four datasets — every
// reported number traces to stored raw text (C-3).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = request.nextUrl.searchParams.get("runId");
  if (!isUuid(id)) return Response.json({ error: "invalid project id" }, { status: 400 });
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });
  if (!isUuid(runId)) return Response.json({ error: "invalid runId" }, { status: 400 });

  const run = await getRun(runId);
  if (!run || run.projectId !== id) return Response.json({ error: "not found" }, { status: 404 });
  if (!isReportableRunState(run.state)) return Response.json({ error: "run must be completed before export" }, { status: 409 });

  try {
  const kind = await getRunMatrixKind(runId);
  const resonanceStudy =
    kind?.kind === "resonance" && kind.resonanceStudyId
      ? await getResonanceStudyExportLabel(id, kind.resonanceStudyId)
      : null;
  await recomputeMetrics(runId);

  const [respRows, extRows, metricRows, citationRows] = await Promise.all([
    getExportResponses(runId),
    getExportExtractions(runId),
    getExportMetrics(runId),
    getExportCitations(runId),
  ]);

  const body = JSON.stringify(
    {
      runId,
      kind: kind?.kind ?? "audit",
      resonance: resonanceExportMetadata(resonanceStudy),
      responses: respRows,
      extractions: extRows,
      metrics: metricRows,
      citations: citationRows,
    },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-${runId}.json"`,
    },
  });
  } catch (err) {
    reportError(err, { boundary: "export-json", projectId: id, runId });
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
