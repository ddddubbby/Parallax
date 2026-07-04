"use client";

import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import { formatCI, formatMetricValue, metricLabel, type MetricRow } from "./format";

/**
 * DB-1 metric cards, DB-3 small-n guard: each figure renders "insufficient
 * data" below n=30. Embeddable — the dashboard renders one grid per pillar
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
  onViewEvidence: (metricKey: string) => void;
}) {
  const overall = metrics.filter((m) => m.scopeType === "overall" && keys.includes(m.metricKey));
  const byKey = new Map(overall.map((m) => [m.metricKey, m]));

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {keys.map((key) => {
        const m = byKey.get(key);
        const sufficient = m ? isSufficientN(m.n) : false;
        return (
          <div key={key} className="rounded-xl border border-ink/15 p-4">
            <div className="mb-2 label-mono text-[11px] text-ink/50">{metricLabel(key)}</div>
            {!m ? (
              <div className="font-mono text-sm text-ink/30">—</div>
            ) : !sufficient ? (
              <>
                <div className="font-mono text-lg text-ink/30">n={m.n}</div>
                <Stamp tone="warn">Insufficient data</Stamp>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl tabular-nums text-ink">{formatMetricValue(m)}</div>
                <div className="font-mono text-[11px] text-ink/45">
                  n={m.n}
                  {formatCI(m) ? ` ${formatCI(m)}` : ""}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => onViewEvidence(key)}
              className="label-mono mt-3 text-[11px] text-accent-ink hover:underline"
            >
              Evidence →
            </button>
          </div>
        );
      })}
    </div>
  );
}
