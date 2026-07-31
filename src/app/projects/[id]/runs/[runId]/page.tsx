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

function EventLog({
  events,
}: {
  events: Array<{
    id: string;
    level: string;
    message: string;
    createdAt: string | Date;
  }>;
}) {
  return (
    <div className="flex flex-col gap-1 font-mono text-xs" data-testid="run-diagnostics-events">
      {events.length === 0 && <p className="text-ink/45">No events yet</p>}
      {events.map((e) => (
        <div
          key={e.id}
          className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] gap-2 border-b border-ink/10 py-2"
        >
          <span className="text-ink/40">
            {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
          </span>
          <span
            className={
              e.level === "error"
                ? "text-danger"
                : e.level === "warn"
                  ? "text-warn"
                  : "text-ink/50"
            }
          >
            {e.level}
          </span>
          <span className="whitespace-pre-wrap break-words text-ink/80">{e.message}</span>
        </div>
      ))}
    </div>
  );
}

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

  // M52 / D-122: Overview + Diagnostics; Metrics stays audit-only.
  const tabs = [
    { id: "overview", label: "Overview", href: withViewParam(base, "overview") },
    { id: "diagnostics", label: "Diagnostics", href: withViewParam(base, "diagnostics") },
    ...(!isResonance
      ? [{ id: "metrics", label: "Metrics", href: withViewParam(base, "metrics") }]
      : []),
  ];

  // Simulation runs have no metrics panel — fall back to overview.
  const effectiveView = isResonance && view === "metrics" ? "overview" : view;

  return (
    <main className="mx-auto min-w-0 max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
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

      {effectiveView === "overview" && (
        <RunProgress projectId={id} runId={runId} initial={detail} />
      )}

      {effectiveView === "diagnostics" && (
        <div data-testid="run-diagnostics">
          <h1 className="label-mono mb-6 text-lg font-semibold">Diagnostics</h1>
          <section className="mb-8">
            <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">Activity</h2>
            <EventLog events={detail.events} />
          </section>
          {!isResonance && (
            <ExtractionPanel
              projectId={id}
              runId={runId}
              terminal={TERMINAL_STATES.has(detail.run.state)}
              panel="extraction"
            />
          )}
        </div>
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
