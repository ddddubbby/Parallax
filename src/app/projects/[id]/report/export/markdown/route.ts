import { NextRequest } from "next/server";
import { isUuid } from "@/core/id";
import { resonanceExportLabel } from "@/core/resonance";
import { reportSectionsForKind } from "@/core/report-templates";
import { isReportableRunState } from "@/core/runner";
import { getResonanceStudyExportLabel } from "@/db/repositories/resonance";
import { getReportFreshness, getReportSections } from "@/db/repositories/report";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { reportError } from "@/observability";

// EX-1, D-013: synchronous download, no export table/queue.
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
  const reportSections = reportSectionsForKind(kind?.kind);
  const resonanceStudy =
    kind?.kind === "resonance" && kind.resonanceStudyId
      ? await getResonanceStudyExportLabel(id, kind.resonanceStudyId)
      : null;
  const resonanceLabel = resonanceStudy ? resonanceExportLabel(resonanceStudy.genericUnconditioned) : null;
  const title = kind?.kind === "resonance"
    ? `Simulation Report${resonanceLabel ? ` — ${resonanceLabel}` : ""}`
    : "Audit Report";

  const [sections, freshness] = await Promise.all([getReportSections(runId), getReportFreshness(runId)]);
  const byKey = new Map(sections.map((s) => [s.sectionKey, s]));
  const freshnessWarning = freshness.stale
    ? [
        "> Stale report warning: these report sections predate the latest computed metrics.",
        "> Regenerate affected sections before using this as a final client deliverable.",
        "",
      ].join("\n")
    : "";
  // RB-2: edited_md always wins.
  const body = reportSections.map(({ key, title }) => {
    const section = byKey.get(key);
    const content = section?.editedMd ?? section?.generatedMd ?? "_Not yet generated._";
    return `## ${title}\n\n${content}`;
  }).join("\n\n");

  return new Response(`# ${title}\n\n${freshnessWarning}${body}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${runId}.md"`,
    },
  });
  } catch (err) {
    reportError(err, { boundary: "export-markdown", projectId: id, runId });
    return Response.json({ error: "export failed" }, { status: 500 });
  }
}
