import { isUuid } from "@/core/id";
import { renderFramingReportMarkdown } from "@/core/framing-report";
import { buildFramingReport } from "@/modules/framing/report";
import { reportError } from "@/observability";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; studyId: string }> }) {
  const { id, studyId } = await params;
  if (!isUuid(id) || !isUuid(studyId)) return new Response("Not found", { status: 404 });
  try {
    const report = await buildFramingReport(id, studyId);
    if (!report) return new Response("Not found", { status: 404 });
    return new Response(renderFramingReportMarkdown(report), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="framing-evidence-${studyId.slice(0, 8)}.md"` } });
  } catch (error) {
    reportError(error, { boundary: "framing-export-markdown", projectId: id, studyId });
    return new Response("Export failed", { status: 500 });
  }
}
