import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SimulationSummarySection } from "@/components/dashboard/simulation-summary";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { isUuid } from "@/core/id";
import { parseDashboardView, withViewParam } from "@/core/views";
import { summarizeSimulationStudy } from "@/core/workspace";
import { fetchDashboardData, fetchRunOptions } from "@/modules/dashboard/actions";
import { getResonanceStudyResults, listResonanceStudies } from "@/db/repositories/resonance";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

/**
 * M32 / D-088: Dashboard is URL-segmented. Audit views load audit DTOs only.
 * `view=simulation` loads approved-study summaries only — no audit selector,
 * chart, aggregate, or metric DTO (C-12).
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view: viewRaw } = await searchParams;
  if (!isUuid(id)) notFound();
  const project = await getProjectSummary(id);
  if (project === null) notFound();

  const view = parseDashboardView(viewRaw);
  const base = `/projects/${id}/dashboard`;
  const tabs = [
    { id: "overview", label: "Overview", href: withViewParam(base, "overview") },
    { id: "presence", label: "Presence", href: withViewParam(base, "presence") },
    { id: "position", label: "Position", href: withViewParam(base, "position") },
    { id: "perception", label: "Perception", href: withViewParam(base, "perception") },
    { id: "proof", label: "Proof", href: withViewParam(base, "proof") },
    { id: "simulation", label: "Simulation", href: withViewParam(base, "simulation") },
  ];

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
        / {view === "simulation" ? "Simulation results" : "Evidence dashboard"}
      </div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="label-mono text-lg font-semibold">
          {view === "simulation" ? "Simulation results" : "Evidence dashboard"}
        </h1>
        {view !== "simulation" && (
          <Link
            href={`/projects/${id}/report`}
            className="label-mono rounded-full border border-ink/25 px-4 py-1.5 text-xs hover:border-ink"
          >
            Report →
          </Link>
        )}
      </div>
      <LocalViewTabs tabs={tabs} activeId={view} label="Dashboard sections" />

      {view === "simulation" ? (
        <SimulationDashboard projectId={id} />
      ) : (
        <AuditDashboard projectId={id} focusPillar={view === "overview" ? null : view} />
      )}
    </main>
  );
}

async function AuditDashboard({
  projectId,
  focusPillar,
}: {
  projectId: string;
  focusPillar: "presence" | "position" | "perception" | "proof" | null;
}) {
  // C-12: audit path never calls listResonanceStudies / getResonanceStudyResults.
  const runs = await fetchRunOptions(projectId);
  const initialRunId = runs[0]?.id ?? null;
  const initialData = initialRunId ? await fetchDashboardData(projectId, initialRunId) : null;
  return (
    <DashboardClient
      projectId={projectId}
      initialRuns={runs}
      initialRunId={initialRunId}
      initialData={initialData}
      focusPillar={focusPillar}
    />
  );
}

async function SimulationDashboard({ projectId }: { projectId: string }) {
  // C-12: simulation path never calls fetchRunOptions / fetchDashboardData.
  const studies = await listResonanceStudies(projectId);
  const approved = studies.filter((s) => s.study.state === "approved");
  const resultEntries = await Promise.all(
    approved.map(async ({ study }) => {
      const results = await getResonanceStudyResults(projectId, study.id, undefined, {
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
  const simulationSummaries = resultEntries.filter((s): s is NonNullable<typeof s> => s !== null);
  return <SimulationSummarySection projectId={projectId} summaries={simulationSummaries} />;
}
