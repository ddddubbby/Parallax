import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReportClient } from "@/components/report/report-client";
import { listCompletedRuns } from "@/db/repositories/dashboard";
import { getReportSections } from "@/db/repositories/report";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runId?: string }>;
}) {
  const { id } = await params;
  const { runId: requestedRunId } = await searchParams;
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const runs = await listCompletedRuns(id);
  if (runs.length === 0) redirect(`/projects/${id}/dashboard`);

  const runId = requestedRunId && runs.some((r) => r.id === requestedRunId) ? requestedRunId : runs[0].id;
  const sections = await getReportSections(runId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/dashboard`} className="hover:text-ink">
          Dashboard
        </Link>{" "}
        / Report
      </div>
      <h1 className="label-mono mb-6 text-lg font-semibold">Report</h1>
      <ReportClient projectId={id} runId={runId} initialSections={sections} />
    </main>
  );
}
