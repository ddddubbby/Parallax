"use client";

import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import { formatCI, formatMetricValue, metricLabel, type MetricRow } from "./format";

/**
 * DB-1 metric cards, DB-3 small-n guard: each figure renders "insufficient
 * data" below the minimum sample size. Embeddable — the dashboard renders one grid per pillar
 * section (D-055), so the card grid carries no heading and no pillar badge
 * of its own (the section frame already says which P it is).
 */
export function MetricCards({
  metrics,
  keys,
  onViewEvidence,
}: {
  metrics: MetricRow[];
  keys: string[];
  onViewEvidence: (metricKey: string, trigger?: HTMLElement) => void;
}) {
  const overall = metrics.filter((m) => m.scopeType === "overall" && keys.includes(m.metricKey));
  const byKey = new Map(overall.map((m) => [m.metricKey, m]));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {keys.map((key) => {
        const m = byKey.get(key);
        const sufficient = m ? isSufficientN(m.n) : false;
        return (
          <div key={key} className="rounded-xl border border-ink/15 p-4">
            <div className="mb-2 label-mono text-[11px] text-ink/65">{metricLabel(key)}</div>
            {!m ? (
              <div className="font-mono text-sm text-ink/60">—</div>
            ) : !sufficient ? (
              <>
                <div className="font-mono text-lg text-ink/60">Sample size: {m.n}</div>
                <Stamp tone="warn">Insufficient data</Stamp>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl tabular-nums text-ink">{formatMetricValue(m)}</div>
                <div className="font-mono text-[11px] text-ink/65">
                  Sample size: {m.n}
                  {formatCI(m) ? ` ${formatCI(m)}` : ""}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={(event) => onViewEvidence(key, event.currentTarget)}
              className="label-mono mt-2 inline-flex min-h-11 items-center rounded-sm text-xs text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Evidence →
            </button>
          </div>
        );
      })}
    </div>
  );
}
