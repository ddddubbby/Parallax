import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SimulationSummarySection } from "@/components/dashboard/simulation-summary";
import { isUuid } from "@/core/id";
import { summarizeSimulationStudy } from "@/core/workspace";
import { fetchDashboardData, fetchRunOptions } from "@/modules/dashboard/actions";
import { getResonanceStudyResults, listResonanceStudies } from "@/db/repositories/resonance";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

/**
 * M31 / D-087: audit dashboard stays exactly as before (own run selector,
 * own metric scopes). Below it, a walled Simulation summary lists approved
 * studies with headline ΔPI per engine and links through to full results —
 * never a shared chart/selector/aggregate with audit data (C-12).
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const [runs, studies] = await Promise.all([fetchRunOptions(id), listResonanceStudies(id)]);
  const initialRunId = runs[0]?.id ?? null;
  const initialData = initialRunId ? await fetchDashboardData(id, initialRunId) : null;

  // Approved studies only for the summary wall; drafts stay on Setup → Simulation.
  const approved = studies.filter((s) => s.study.state === "approved");
  const resultEntries = await Promise.all(
    approved.map(async ({ study }) => {
      const results = await getResonanceStudyResults(id, study.id, undefined, {
        refreshMetrics: true,
      });
      return summarizeSimulationStudy(
        results
          ? {
              studyId: study.id,
              studyName: study.name,
              runId: results.run.id,
              runMode: results.run.runMode,
              providerGroups: results.providerGroups,
            }
          : {
              studyId: study.id,
              studyName: study.name,
              runId: null,
              runMode: null,
              providerGroups: [],
            },
      );
    }),
  );
  const simulationSummaries = resultEntries.filter(
    (s): s is NonNullable<typeof s> => s !== null,
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
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
      <DashboardClient
        projectId={id}
        initialRuns={runs}
        initialRunId={initialRunId}
        initialData={initialData}
      />
      <SimulationSummarySection projectId={id} summaries={simulationSummaries} />
    </main>
  );
}
