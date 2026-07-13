import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import { getProjectSummary, listRunsWithProgress } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

function stateTone(state: string): "ink" | "warn" | "danger" | "ok" {
  if (state === "completed") return "ok";
  if (state === "failed" || state === "cancelled") return "danger";
  if (state === "paused") return "warn";
  return "ink";
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function RunRow({
  projectId,
  run,
}: {
  projectId: string;
  run: Awaited<ReturnType<typeof listRunsWithProgress>>[number];
}) {
  const providers = asStringList(run.selectedProvidersJson);
  const modes = asStringList(run.selectedModesJson);
  const primaryLabel =
    run.matrixKind === "resonance" && run.studyName
      ? run.studyName
      : `Matrix V${run.matrixVersion}`;

  return (
    <Link
      href={`/projects/${projectId}/runs/${run.id}`}
      className="flex min-h-11 flex-col gap-3 rounded-xl border border-ink/15 p-4 transition-micro hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm text-ink/90">{primaryLabel}</span>
          {run.runMode === "mock" && <Stamp tone="accent">MOCK</Stamp>}
          {run.matrixKind === "resonance" && <SimulatedBadge />}
          {run.runMode === "live_validation" && <Stamp tone="warn">VALIDATION-ONLY</Stamp>}
          <Stamp tone={stateTone(run.state)}>{run.state}</Stamp>
        </span>
        <span className="font-mono text-xs text-ink/45">
          {run.matrixKind === "resonance" ? `V${run.matrixVersion} · ` : ""}
          {providers.join(", ") || "—"} · {modes.join(", ") || "—"} · Run {run.id.slice(0, 8)}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-ink/55">
        <span>
          {run.succeeded} / {run.total} jobs
        </span>
        <span>{run.createdAt.toISOString().slice(0, 10).replaceAll("-", ".")}</span>
        <span className="label-mono text-accent-ink">Open →</span>
      </span>
    </Link>
  );
}

export default async function RunsIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const project = await getProjectSummary(id);
  if (!project) notFound();
  const runs = await listRunsWithProgress(id);
  // M31 / D-087: group the existing flat list — no query change; matrixKind
  // already comes from listRunsWithProgress.
  const auditRuns = runs.filter((r) => r.matrixKind === "audit");
  const simulationRuns = runs.filter((r) => r.matrixKind === "resonance");

  return (
    <main className="mx-auto min-w-0 max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Runs
      </div>

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="label-mono text-lg font-semibold">Runs</h1>
        <Link
          href={`/projects/${id}/runs/new`}
          className="interactive-press label-mono inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-5 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Configure run →
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-ink/15 px-5 py-10 text-center">
          <p className="label-mono text-sm text-ink/70">No runs yet</p>
          <p className="mx-auto mt-2 mb-4 max-w-md text-sm text-ink/60">
            Start an audit or Simulation run from an approved matrix.
          </p>
          <Link
            href={`/projects/${id}/runs/new`}
            className="interactive-press label-mono inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Configure run →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-label="Audit runs">
            <h2 className="label-mono mb-3 text-xs font-semibold uppercase text-ink/60">
              Audit runs
              <span className="text-ink/40"> · {auditRuns.length}</span>
            </h2>
            {auditRuns.length === 0 ? (
              <p className="text-sm text-ink/60">No audit runs on file.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {auditRuns.map((run) => (
                  <RunRow key={run.id} projectId={id} run={run} />
                ))}
              </div>
            )}
          </section>

          <section aria-label="Simulation runs">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="label-mono text-xs font-semibold uppercase text-ink/60">
                Simulation runs
                <span className="text-ink/40"> · {simulationRuns.length}</span>
              </h2>
              <SimulatedBadge />
            </div>
            {simulationRuns.length === 0 ? (
              <p className="text-sm text-ink/60">No Simulation runs on file.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {simulationRuns.map((run) => (
                  <RunRow key={run.id} projectId={id} run={run} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
