import Link from "next/link";
import { notFound } from "next/navigation";
import { ExtractionPanel } from "@/components/analysis/extraction-panel";
import { RunProgress } from "@/components/runner/run-progress";
import { getProjectSummary, getRunDetail } from "@/db/repositories/runner";

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const detail = await getRunDetail(runId);
  if (!detail || detail.run.projectId !== id) notFound();
  const project = await getProjectSummary(id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          {project?.name ?? "Project"}
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/runs`} className="hover:text-ink">
          Runs
        </Link>{" "}
        / Run {runId.slice(0, 8)}
      </div>
      <RunProgress projectId={id} runId={runId} initial={detail} />
      {detail.run.matrixKind !== "resonance" && (
        <ExtractionPanel runId={runId} terminal={TERMINAL_STATES.has(detail.run.state)} />
      )}
    </main>
  );
}
