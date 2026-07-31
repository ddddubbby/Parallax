import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import {
  listFramingStudies,
} from "@/db/repositories/framing";
import { getProjectSummary } from "@/db/repositories/runner";

export const dynamic = "force-dynamic";


export default async function FramingLibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [project, studies] = await Promise.all([
    getProjectSummary(id),
    listFramingStudies(id),
  ]);
  if (!project) notFound();

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
        <Stamp tone="warn">HISTORICAL — RETIRED BY D-114</Stamp>
      </div>
      <p className="mb-7 max-w-3xl text-sm leading-6 text-ink/65">
        The codebook review workflow is retired (D-114). Reviews on file remain readable exactly as
        recorded — evidence is immutable (C-3) — but new reviews can no longer start. To test a
        message today, open Message Lift and pick the Current message directly from stored responses.
      </p>

      <section className="mb-8 rounded-xl border border-ink/15 bg-paper-2/25 p-4">
        <h2 className="label-mono mb-2 text-sm font-semibold">Message testing now happens in Message Lift</h2>
        <p className="max-w-2xl text-sm leading-6 text-ink/65">
          Create a Message Lift test and pick the stored AI response to test against — themes and
          recurrence counts are computed automatically from the audit&rsquo;s extractions.
        </p>
        <Link
          href={`/projects/${id}/resonance`}
          className="label-mono mt-3 inline-flex min-h-11 items-center rounded-md border border-accent bg-accent px-4 text-sm text-ink transition-micro hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open Message Lift →
        </Link>
      </section>

      <section>
        <h2 className="label-mono mb-3 text-sm font-semibold">Review library</h2>
        {studies.length === 0 ? (
          <EmptyState kind="completed-success" title="No framing reviews on file">
            Historical codebook reviews remain readable on file. New message testing lives in Message Lift.
          </EmptyState>
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
