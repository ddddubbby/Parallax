import Link from "next/link";
import { notFound } from "next/navigation";
import { StartReviewControl } from "@/components/framing/start-review-control";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import {
  listFramingSourceRuns,
  listFramingStudies,
} from "@/db/repositories/framing";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  return value ? value.toISOString().slice(0, 10).replaceAll("-", ".") : "DATE UNKNOWN";
}

export default async function FramingLibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [project, studies, sourceRuns] = await Promise.all([
    getProjectSummary(id),
    listFramingStudies(id),
    listFramingSourceRuns(id),
  ]);
  if (!project) notFound();
  const readyRuns = sourceRuns.filter((run) => run.ready);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/65">
        <Link href="/projects" className="hover:text-ink">Projects</Link>
        {" / "}
        <Link href={`/projects/${id}`} className="hover:text-ink">{project.name}</Link>
        {" / Results / Framing evidence"}
      </div>
      <div className="mb-3 mt-4 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Framing evidence</h1>
        <Stamp tone="ink">HUMAN REVIEWED</Stamp>
      </div>
      <p className="mb-7 max-w-3xl text-sm leading-6 text-ink/65">
        Review how sampled AI answers described the brand, lock a project-specific association
        codebook before positioning is revealed, and identify the narrative gap worth correcting
        and testing next. Results are descriptive evidence, not a population estimate.
      </p>

      <section className="mb-8 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="label-mono text-sm font-semibold">Start from a completed audit</h2>
          <Stamp tone={readyRuns.length > 0 ? "ok" : "warn"}>{readyRuns.length} READY</Stamp>
        </div>
        {readyRuns.length === 0 ? (
          <p className="text-sm text-ink/60">
            No completed consumer audit contains all five pinned representation prompts yet.
            Generate and run a new consumer matrix first; B2B remains outside this workflow.
          </p>
        ) : (
          <div className="grid gap-2">
            {readyRuns.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 bg-paper p-3">
                <div>
                  <div className="font-mono text-xs text-ink/75">
                    RUN {run.id.slice(0, 8).toUpperCase()} · {dateLabel(run.completedAt)}
                  </div>
                  <div className="mt-1 font-mono text-xs text-ink/65">
                    {run.representationCells} prompts · {run.representationJobs} denominator jobs · {run.runMode}
                  </div>
                </div>
                <StartReviewControl projectId={id} sourceRunId={run.id} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="label-mono mb-3 text-sm font-semibold">Review library</h2>
        {studies.length === 0 ? (
          <div className="rounded-xl border border-ink/15 p-8 text-center">
            <p className="label-mono text-sm text-ink/60">No framing reviews on file</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {studies.map((study) => (
              <article key={study.id} className="rounded-xl border border-ink/15 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="label-mono text-sm font-semibold">FRAMING {study.id.slice(0, 8).toUpperCase()}</h3>
                  <Stamp tone={study.state === "completed" ? "ok" : study.state === "draft" ? "ink" : "warn"}>{study.state}</Stamp>
                  <Link href={`/projects/${id}/framing/${study.id}`} className="label-mono ml-auto inline-flex min-h-11 items-center rounded-full border border-ink/30 px-4 py-2 text-xs hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    Open →
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink/65">
                  <span>{study.reviewed}/{study.denominator} denominator jobs reviewed</span>
                  <span>{study.promptProtocolVersion}</span>
                  {study.reviewMethod && <span>{study.reviewMethod.replaceAll("_", " ")}</span>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
