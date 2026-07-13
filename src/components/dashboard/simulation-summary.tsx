import Link from "next/link";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Stamp } from "@/components/ui";
import type { SimulationStudySummary } from "@/core/workspace";

function formatDelta(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

/**
 * M31 / D-087: walled Simulation section on the Dashboard. Summary cards
 * only — full per-engine tables stay on the Simulation page via link-through.
 * Never shares a chart, selector, or aggregate with the audit dashboard (C-12).
 */
export function SimulationSummarySection({
  projectId,
  summaries,
}: {
  projectId: string;
  summaries: SimulationStudySummary[];
}) {
  return (
    <section
      className="mt-10 border-t border-ink/15 pt-8"
      aria-label="Simulation Layer"
      data-testid="dashboard-simulation-section"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="label-mono text-sm font-semibold uppercase text-ink/80">Simulation</h2>
        <SimulatedBadge />
        <span className="text-sm text-ink/65">
          comparative ΔPI only · not pooled with audit metrics
        </span>
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-xl border border-ink/15 bg-paper-2/30 p-6">
          <p className="label-mono text-sm text-ink/60">No simulation results yet</p>
          <p className="mt-1 text-sm text-ink/65">
            Approve a study under Setup → Simulation studies, then complete its run.
          </p>
          <Link
            href={`/projects/${projectId}/resonance`}
            className="label-mono mt-3 inline-flex min-h-11 items-center rounded-sm text-xs text-accent-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Simulation studies →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {summaries.map((summary) => (
            <article
              key={summary.studyId}
              className="rounded-xl border border-ink/15 p-4"
              data-testid="dashboard-simulation-card"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="label-mono text-sm font-semibold text-ink/85">{summary.studyName}</h3>
                <SimulatedBadge />
                {summary.runMode && (
                  <Stamp tone={summary.runMode === "mock" ? "accent" : "ink"}>{summary.runMode}</Stamp>
                )}
                {summary.runId && (
                  <span className="font-mono text-[11px] text-ink/65">
                    run {summary.runId.slice(0, 8)}
                  </span>
                )}
                <Link
                  href={`/projects/${projectId}/resonance/${summary.studyId}?view=results`}
                  className="label-mono ml-auto inline-flex min-h-11 items-center rounded-sm text-xs text-accent-ink hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Full results →
                </Link>
              </div>
              {summary.engines.length === 0 ? (
                <p className="text-sm text-ink/65">Approved study — no completed run yet.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {summary.engines.map((engine) => (
                    <li
                      key={`${summary.studyId}-${engine.providerId}`}
                      className="rounded-lg border border-ink/10 bg-paper-2/40 px-3 py-2"
                    >
                      <div className="label-mono text-[11px] text-ink/65">
                        Engine · {engine.providerId}
                      </div>
                      {engine.topDeltaPiMean === null ? (
                        <p className="mt-1 font-mono text-xs text-ink/65">No ΔPI yet</p>
                      ) : (
                        <>
                          <p className="mt-1 font-mono text-base tabular-nums text-ink">
                            ΔPI {formatDelta(engine.topDeltaPiMean)}
                            {engine.directionalOnly && (
                              <span className="ml-2 label-mono text-[10px] text-ink/65">
                                DIRECTIONAL
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-ink/65">
                            {engine.topDeltaLabel}
                            {engine.baselineLabel ? ` vs ${engine.baselineLabel}` : ""}
                          </p>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
