import Link from "next/link";
import type { PipelineStage } from "@/core/pipeline";
import { JourneyRail } from "@/components/journey-rail";

/**
 * M44 / D-114: the single NEXT STEP card. Every surface that shows primary
 * guidance renders this component fed by resolveProjectStage — never
 * hand-written per-page copy — so the "always one next action, never a dead
 * end" contract holds product-wide by construction.
 */
export function NextStepCard({ stage, projectId }: { stage: PipelineStage; projectId: string }) {
  if (stage.nextLabel === null || stage.nextPath === null) return null;
  const href = stage.nextPath === "" ? `/projects/new?id=${projectId}` : `/projects/${projectId}/${stage.nextPath}`;
  return (
    <section
      aria-label="Next step"
      className="rounded-xl border border-accent/50 bg-paper-2/40 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label-mono text-[11px] uppercase tracking-wide text-ink/55">
            Next step · {stage.stageLabel}
          </p>
          <p className="mt-1 text-sm leading-6 text-ink/75">{stage.hint}</p>
        </div>
        <Link
          href={href}
          className="label-mono shrink-0 rounded-md border border-accent bg-accent px-4 py-2.5 text-sm text-ink transition-micro hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {stage.nextLabel} →
        </Link>
      </div>
      <div className="mt-3">
        <JourneyRail current={stage.journey} />
      </div>
    </section>
  );
}
