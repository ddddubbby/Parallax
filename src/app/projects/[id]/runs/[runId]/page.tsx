import Link from "next/link";
import { notFound } from "next/navigation";
import { RunProgress } from "@/components/runner/run-progress";
import { getRunDetail } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const detail = await getRunDetail(runId);
  if (!detail || detail.run.projectId !== id) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-1 font-mono text-xs text-ink/45">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}/matrix`} className="hover:text-ink">
          Matrix
        </Link>
      </div>
      <RunProgress projectId={id} runId={runId} initial={detail} />
    </main>
  );
}
