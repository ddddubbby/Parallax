import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { isUuid } from "@/core/id";
import { fetchDashboardData, fetchRunOptions } from "@/modules/dashboard/actions";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const runs = await fetchRunOptions(id);
  const initialRunId = runs[0]?.id ?? null;
  const initialData = initialRunId ? await fetchDashboardData(id, initialRunId) : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Dashboard
      </div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="label-mono text-lg font-semibold">Dashboard</h1>
        <Link
          href={`/projects/${id}/report`}
          className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink"
        >
          Report →
        </Link>
      </div>
      <DashboardClient projectId={id} initialRuns={runs} initialRunId={initialRunId} initialData={initialData} />
    </main>
  );
}
