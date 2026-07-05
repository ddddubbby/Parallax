import Link from "next/link";
import { notFound } from "next/navigation";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import { getProjectSummary, listRunsWithProgress } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

function stateTone(state: string): "ink" | "warn" | "danger" | "ok" {
  if (state === "completed") return "ok";
  if (state === "failed" || state === "cancelled") return "danger";
  if (state === "paused") return "warn";
  return "ink";
}

export default async function RunsIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProjectSummary(id);
  if (!project) notFound();
  const runs = await listRunsWithProgress(id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Runs
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="label-mono text-lg font-semibold">Runs</h1>
        <Link
          href={`/projects/${id}/runs/new`}
          className="label-mono text-xs text-accent-ink hover:text-accent"
        >
          New run →
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-ink/15 p-10 text-center">
          <p className="label-mono text-sm text-ink/60">No runs yet</p>
          <p className="mt-1 mb-4 font-mono text-xs text-ink/45">
            start a run from an approved matrix
          </p>
          <Link
            href={`/projects/${id}/runs/new`}
            className="label-mono text-xs text-accent-ink hover:text-accent"
          >
            New run →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/projects/${id}/runs/${run.id}`}
              className="flex items-center justify-between rounded-xl border border-ink/15 p-3 transition-micro hover:border-ink"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink/85">
                  Run {run.id.slice(0, 8)}
                </span>
                {run.runMode === "mock" && <Stamp tone="accent">MOCK</Stamp>}
                {run.matrixKind === "resonance" && <SimulatedBadge />}
                {run.runMode === "live_validation" && (
                  <Stamp tone="warn">VALIDATION-ONLY</Stamp>
                )}
                <Stamp tone={stateTone(run.state)}>{run.state}</Stamp>
              </span>
              <span className="flex items-center gap-4 font-mono text-xs text-ink/45">
                <span>
                  {run.succeeded} / {run.total} jobs
                </span>
                <span>
                  {run.createdAt.toISOString().slice(0, 10).replaceAll("-", ".")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
