import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { NewStudyDialog } from "@/components/resonance/new-study-dialog";
import { BaselineProvenance } from "@/components/resonance/baseline-provenance";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import { isUuid } from "@/core/id";
import { type PanelPersona } from "@/core/resonance";
import { listResonanceStudies } from "@/db/repositories/resonance";
import { getProjectPipelineState, getProjectSummary } from "@/db/repositories/runner";
import { resolveProjectStage } from "@/core/pipeline";
import { JourneyRail } from "@/components/journey-rail";
import { NextStepCard } from "@/components/next-step-card";

export const dynamic = "force-dynamic";

/**
 * M32 / D-088: Simulation study library only — no per-study results fetch.
 * Detail workspace lives at `/resonance/[studyId]`. Keep `id="study-<id>"`
 * anchors so legacy hash links still land on the record.
 */
export default async function ResonanceLibraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [project, studies, pipeline] = await Promise.all([
    getProjectSummary(id),
    listResonanceStudies(id),
    getProjectPipelineState(id),
  ]);
  if (project === null) notFound();
  const stage = resolveProjectStage(pipeline);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-1 font-mono text-xs text-ink/65">
        <Link href="/projects" className="hover:text-ink">
          Projects
        </Link>{" "}
        /{" "}
        <Link href={`/projects/${id}`} className="hover:text-ink">
          {project.name}
        </Link>{" "}
        / Message Lift
      </div>
      <div className="mb-4 mt-4 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Message Lift</h1>
        <SimulatedBadge />
        <div className="ml-auto">
          <NewStudyDialog projectId={id} />
        </div>
      </div>
      <div className="mb-4"><JourneyRail current={stage.journey} /></div>
      <p className="mb-6 max-w-3xl text-sm leading-6 text-ink/70">
        Compare the current message with one new message and measure the lift. Choose buyer response or
        AI recommendation; both use the same transparent A/B workflow.
      </p>

      {studies.length === 0 ? (
        <section className="space-y-4">
          <EmptyState kind="first-use" title="No Message Lift tests yet" className="bg-paper-2/30">
            {pipeline.hasCompletedRun
              ? "Create a test to compare a current message with one new message. Use “New test” above to start."
              : "Tests use a verbatim response and brand-neutral contexts from an approved Evidence audit, so the audit comes first."}
          </EmptyState>
          {!pipeline.hasCompletedRun && <NextStepCard stage={stage} projectId={id} />}
        </section>
      ) : (
        <div className="flex flex-col gap-3">
          {studies.map(({ study, baselineProvenance, stimuli, matrixVersion, latestRun }) => {
            const personas = study.panelPersonasJson as PanelPersona[];
            const isDraft = study.state === "draft";
            const href = `/projects/${id}/resonance/${study.id}${isDraft ? "?view=design" : ""}`;
            return (
              <section
                key={study.id}
                id={`study-${study.id}`}
                className="scroll-mt-6 rounded-xl border border-ink/15 bg-paper p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="label-mono text-sm font-semibold">{study.name}</h2>
                  <Stamp tone={study.state === "approved" ? "ok" : "ink"}>{study.state}</Stamp>
                  <SimulatedBadge />
                  <Stamp tone="ink">
                    {study.testType === "ai_recommendation" ? "AI recommendation" : "Buyer response"}
                  </Stamp>
                  {study.genericUnconditioned && <Stamp tone="warn">GENERIC</Stamp>}
                  <Link
                    href={href}
                    className="interactive-press label-mono ml-auto inline-flex min-h-11 items-center rounded-full bg-accent px-4 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {isDraft ? "Continue →" : "Open →"}
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink/65">
                  <span>
                    {study.testType === "ai_recommendation"
                      ? `${Array.isArray(study.recommendationScenariosJson) ? study.recommendationScenariosJson.length : 0} shopping situations`
                      : `${personas.length} buyer profile${personas.length === 1 ? "" : "s"}`}
                  </span>
                  <span>
                    {stimuli.length} message{stimuli.length === 1 ? "" : "s"}
                  </span>
                  {matrixVersion && (
                    <span>
                      matrix v{matrixVersion.version} · {matrixVersion.cellCount} cells
                    </span>
                  )}
                  {latestRun ? (
                    <span>
                      latest run {latestRun.state}
                      {latestRun.runMode ? ` · ${latestRun.runMode}` : ""}
                    </span>
                  ) : study.state === "approved" ? (
                    <span>no run yet</span>
                  ) : null}
                </div>
                <div className="mt-3"><BaselineProvenance provenance={baselineProvenance} /></div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
