import Link from "next/link";
import { resolveProjectStage, type PipelineState } from "@/core/pipeline";

/**
 * OX-2: a project-wide "you are here → next step" banner with the single
 * primary action. Rendered once in the project layout so every stage page
 * shows where the project is and what to do next.
 */
export function ProjectNextAction({ projectId, state }: { projectId: string; state: PipelineState }) {
  const stage = resolveProjectStage(state);
  // Intake lives in the wizard, not a project sub-path.
  const href =
    stage.nextPath === "" ? `/projects/new?id=${projectId}` : `/projects/${projectId}/${stage.nextPath}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 font-mono text-xs text-ink/55">
      <span className="label-mono text-ink/45">Stage:</span>
      <span className="text-ink/75">{stage.stageLabel}</span>
      {stage.nextLabel && stage.nextPath !== null && (
        <>
          <span className="text-ink/30">→</span>
          <Link href={href} className="label-mono text-accent-ink hover:text-accent">
            {stage.nextLabel} →
          </Link>
        </>
      )}
    </div>
  );
}
