import { NextRequest } from "next/server";
import { getExportCitations, getExportExtractions, getExportMetrics, getExportResponses } from "@/db/repositories/export";
import { getRun } from "@/db/repositories/runner";

// EX-3, D-013: synchronous download, one file, four datasets — every
// reported number traces to stored raw text (C-3).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run || run.projectId !== id) return Response.json({ error: "not found" }, { status: 404 });

  const [respRows, extRows, metricRows, citationRows] = await Promise.all([
    getExportResponses(runId),
    getExportExtractions(runId),
    getExportMetrics(runId),
    getExportCitations(runId),
  ]);

  const body = JSON.stringify(
    { runId, responses: respRows, extractions: extRows, metrics: metricRows, citations: citationRows },
    null,
    2,
  );

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="evidence-${runId}.json"`,
    },
  });
}
