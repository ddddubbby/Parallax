import Link from "next/link";
import { notFound } from "next/navigation";
import { ExtractionPanel } from "@/components/analysis/extraction-panel";
import { LocalViewTabs } from "@/components/local-view-tabs";
import { RunProgress } from "@/components/runner/run-progress";
import { isUuid } from "@/core/id";
import { parseRunDetailView, withViewParam } from "@/core/views";
import { getProjectSummary, getRunDetail } from "@/db/repositories/runner";

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id, runId } = await params;
  const { view: viewRaw } = await searchParams;
  if (!isUuid(id)) notFound();
  if (!isUuid(runId)) notFound();
  const detail = await getRunDetail(runId);
  if (!detail || detail.run.projectId !== id) notFound();
  const project = await getProjectSummary(id);
  const view = parseRunDetailView(viewRaw);
  const isResonance = detail.run.matrixKind === "resonance";
  const base = `/projects/${id}/runs/${runId}`;

  const tabs = [
    { id: "overview", label: "Overview", href: withViewParam(base, "overview") },
    { id: "events", label: "Events", href: withViewParam(base, "events") },
    ...(!isResonance
      ? [
          { id: "extraction", label: "Extraction", href: withViewParam(base, "extraction") },
          { id: "metrics", label: "Metrics", href: withViewParam(base, "metrics") },
        ]
      : []),
  ];

  // Simulation runs have no extraction panel — fall back to overview for those views.
  const effectiveView =
    isResonance && (view === "extraction" || view === "metrics") ? "overview" : view;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project?.name ?? "Project"}
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/runs`} className="hover:text-ink">
          Runs
        </Link>{" "}
        / Run {runId.slice(0, 8)}
      </div>
      <LocalViewTabs tabs={tabs} activeId={effectiveView} label="Run detail sections" />

      {(effectiveView === "overview" || effectiveView === "events") && (
        <RunProgress
          projectId={id}
          runId={runId}
          initial={detail}
          view={effectiveView}
        />
      )}
      {!isResonance && effectiveView === "extraction" && (
        <ExtractionPanel
          projectId={id}
          runId={runId}
          terminal={TERMINAL_STATES.has(detail.run.state)}
          panel="extraction"
        />
      )}
      {!isResonance && effectiveView === "metrics" && (
        <ExtractionPanel
          projectId={id}
          runId={runId}
          terminal={TERMINAL_STATES.has(detail.run.state)}
          panel="metrics"
        />
      )}
    </main>
  );
}
