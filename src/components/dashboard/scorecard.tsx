"use client";

import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import { PILLARS, resolveGlossary } from "@/core/semantic";
import { formatCI, formatMetricValue, metricLabel, type MetricRow } from "./format";

const SCORECARD_KEYS = [
  "mention_rate",
  "recommendation_rate",
  "share_of_voice",
  "avg_first_position",
  "citation_share",
  "accuracy_rate",
  "stability_index",
];

/** DB-1 scorecard, DB-3 small-n guard: each figure renders "insufficient data" below n=30. */
export function Scorecard({
  metrics,
  onViewEvidence,
}: {
  metrics: MetricRow[];
  onViewEvidence: () => void;
}) {
  const overall = metrics.filter((m) => m.scopeType === "overall" && SCORECARD_KEYS.includes(m.metricKey));
  const byKey = new Map(overall.map((m) => [m.metricKey, m]));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-mono text-xs font-medium text-ink/60">Four P&apos;s Scorecard</h2>
        <button type="button" onClick={onViewEvidence} className="label-mono text-xs text-accent-ink hover:underline">
          View evidence →
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {SCORECARD_KEYS.map((key) => {
          const m = byKey.get(key);
          const glossary = resolveGlossary(key);
          const sufficient = m ? isSufficientN(m.n) : false;
          return (
            <div key={key} className="rounded-xl border border-ink/15 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="label-mono text-[11px] text-ink/50">{metricLabel(key)}</div>
                <Stamp tone="ink">{PILLARS[glossary.pillar].label}</Stamp>
              </div>
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
