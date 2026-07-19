import { JOURNEY_STEPS, type JourneyStep } from "@/core/pipeline";
import { cn } from "@/core/cn";

/**
 * M44 / D-114: the four-step operator journey rail. Purely presentational —
 * position comes from resolveProjectStage so every surface agrees on where
 * the operator is. Renders nothing when the project is still in audit setup
 * (journey null) so it never competes with intake/matrix/run guidance.
 */
export function JourneyRail({ current }: { current: JourneyStep | null }) {
  if (current === null) return null;
  const currentIndex = JOURNEY_STEPS.findIndex((s) => s.key === current);
  return (
    <ol aria-label="Journey progress" className="flex flex-wrap items-center gap-1 font-mono text-[11px]">
      {JOURNEY_STEPS.map((step, i) => {
        const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
        return (
          <li key={step.key} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true" className="text-ink/30">→</span>}
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "rounded-sm border px-1.5 py-0.5 tracking-wide",
                state === "current" && "border-accent bg-accent text-ink",
                state === "done" && "border-ink/30 text-ink/70",
                state === "todo" && "border-ink/20 text-ink/60",
              )}
            >
              {state === "done" ? `${step.label} ✓` : step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
