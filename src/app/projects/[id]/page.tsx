import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/core/id";
import { resolveProjectStage } from "@/core/pipeline";
import { NextStepCard } from "@/components/next-step-card";
import { workspaceHubSections } from "@/core/workspace";
import { listResonanceStudies } from "@/db/repositories/resonance";
import {
  getProjectPipelineState,
  getProjectSummary,
  listRunsWithProgress,
} from "@/db/repositories/runner";

export const dynamic = "force-dynamic";

/**
 * M31 / D-087: project workspace hub. `/projects/[id]` previously 404'd
 * (layout only). Numbered dossier sections point into the four top-level
 * areas; status lines come from getProjectPipelineState (already
 * resonance-aware) plus run/study counts.
 */
export default async function ProjectHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [project, pipeline, runs, studies] = await Promise.all([
    getProjectSummary(id),
    getProjectPipelineState(id),
    listRunsWithProgress(id),
    listResonanceStudies(id),
  ]);
  if (!project) notFound();

  const auditRuns = runs.filter((r) => r.matrixKind === "audit").length;
  const resonanceRuns = runs.filter((r) => r.matrixKind === "resonance").length;
  const approvedStudies = studies.filter((s) => s.study.state === "approved").length;
  const sections = workspaceHubSections(pipeline, {
    auditRuns,
    resonanceRuns,
    studies: studies.length,
    approvedStudies,
  });
  const stage = resolveProjectStage(pipeline);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 text-sm text-ink/60">
        <Link
          href="/projects"
          className="rounded-sm hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Projects
        </Link>{" "}
        / {project.name}
      </div>
      <h1 className="label-mono mb-2 text-lg font-semibold">{project.name}</h1>
      <p className="mb-4 text-sm text-ink/65">Project workspace · {stage.stageLabel}</p>
      <div className="mb-8">
        <NextStepCard stage={stage} projectId={id} />
      </div>

      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={`/projects/${id}/${section.href}`}
            className="group rounded-r-lg border-l-2 border-ink/20 py-2 pl-4 pr-2 transition-micro hover:border-accent hover:bg-paper-2/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="label-mono text-sm font-medium uppercase text-ink/80 group-hover:text-ink">
                {section.number} · {section.label}
              </h2>
              <span className="label-mono text-[11px] text-accent-ink transition-micro group-hover:text-accent">
                Open →
              </span>
            </div>
            <p className="mt-1 text-sm text-ink/65">{section.status}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
