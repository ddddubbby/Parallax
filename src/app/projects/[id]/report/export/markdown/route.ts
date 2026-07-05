import { NextRequest } from "next/server";
import { REPORT_SECTIONS } from "@/core/report-templates";
import { getReportSections } from "@/db/repositories/report";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";

// EX-1, D-013: synchronous download, no export table/queue.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = request.nextUrl.searchParams.get("runId");
  if (!runId) return Response.json({ error: "runId required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run || run.projectId !== id) return Response.json({ error: "not found" }, { status: 404 });
  const kind = await getRunMatrixKind(runId);
  if (kind?.kind !== "audit") {
    return Response.json({ error: "Audit report exports do not support Resonance simulation runs" }, { status: 400 });
  }

  const sections = await getReportSections(runId);
  const byKey = new Map(sections.map((s) => [s.sectionKey, s]));
  // RB-2: edited_md always wins.
  const body = REPORT_SECTIONS.map(({ key, title }) => {
    const section = byKey.get(key);
    const content = section?.editedMd ?? section?.generatedMd ?? "_Not yet generated._";
    return `## ${title}\n\n${content}`;
  }).join("\n\n");

  return new Response(`# Audit Report\n\n${body}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${runId}.md"`,
    },
  });
}
