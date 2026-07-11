import { isUuid } from "@/core/id";
import { buildFramingReport } from "@/modules/framing/report";
import { reportError } from "@/observability";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; studyId: string }> }) {
  const { id, studyId } = await params;
  if (!isUuid(id) || !isUuid(studyId)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const report = await buildFramingReport(id, studyId);
    if (!report) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(report, { headers: { "content-disposition": `attachment; filename="framing-evidence-${studyId.slice(0, 8)}.json"` } });
  } catch (error) {
    reportError(error, { boundary: "framing-export-json", projectId: id, studyId });
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
