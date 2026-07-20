import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportClient } from "@/components/report/report-client";
import { ReportRunSwitcher } from "@/components/report/report-run-switcher";
import { e2eNavDelay } from "@/app/e2e-nav-delay";
import { isUuid } from "@/core/id";
import { reportSectionsForKind } from "@/core/report-templates";
import { parseReportView } from "@/core/views";
import { listCompletedResonanceRuns, listCompletedRuns } from "@/db/repositories/dashboard";
import { getReportFreshness, getReportSections } from "@/db/repositories/report";
import { getResonanceStudyExportLabel } from "@/db/repositories/resonance";
import { getProjectSummary, getRunMatrixKind } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runId?: string; view?: string }>;
}) {
  const { id } = await params;
  const { runId: requestedRunId, view: viewRaw } = await searchParams;
  if (!isUuid(id)) notFound();
  await e2eNavDelay();
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const [auditRuns, resonanceRuns] = await Promise.all([
    listCompletedRuns(id, { includePaused: false }),
    listCompletedResonanceRuns(id, { includePaused: false }),
  ]);
  const runs = [
    ...auditRuns.map((run) => ({ ...run, matrixKind: "audit" as const })),
    ...resonanceRuns.map((run) => ({ ...run, matrixKind: "resonance" as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (runs.length === 0) redirect(`/projects/${id}/dashboard`);

  const defaultRun = auditRuns[0]
    ? { ...auditRuns[0], matrixKind: "audit" as const }
    : runs[0];
  const selectedRun = requestedRunId
    ? (runs.find((r) => r.id === requestedRunId) ?? defaultRun)
    : defaultRun;
  const runId = selectedRun.id;
  const [sections, freshness, runKind] = await Promise.all([
    getReportSections(runId),
    getReportFreshness(runId),
    getRunMatrixKind(runId),
  ]);
  const resonanceStudy = runKind?.kind === "resonance" && runKind.resonanceStudyId
    ? await getResonanceStudyExportLabel(id, runKind.resonanceStudyId)
    : null;
  const activeSectionKey = parseReportView(viewRaw, selectedRun.matrixKind);
  // Ensure the selected key exists in the kind's outline (parser already does).
  const outline = reportSectionsForKind(selectedRun.matrixKind);
  const sectionKey = outline.some((s) => s.key === activeSectionKey)
    ? activeSectionKey
    : outline[0].key;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/65">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/dashboard`} className="hover:text-ink">
          Dashboard
        </Link>{" "}
        / Report
      </div>
      <h1 className="label-mono mb-4 text-lg font-semibold">Report</h1>
      <ReportRunSwitcher projectId={id} runId={runId} runs={runs} />
      <ReportClient
        projectId={id}
        runId={runId}
        initialSections={sections}
        kind={selectedRun.matrixKind}
        initialIsStale={freshness.stale}
        activeSectionKey={sectionKey}
        baselineProvenance={resonanceStudy?.baselineProvenance ?? null}
      />
    </main>
  );
}
