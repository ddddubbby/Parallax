"use client";

import { FunnelHeatmap, type HeatmapCell } from "@/components/charts/FunnelHeatmap";
import { isSufficientN } from "@/core/metrics";
import { PILLARS } from "@/core/semantic";
import type { MetricRow } from "./format";

/** DB-1 funnel heatmap: Mention Rate per intent x persona, DB-2 drill-down per cell. */
export function FunnelSection({
  metrics,
  personas,
  onCellClick,
}: {
  metrics: MetricRow[];
  personas: Array<{ id: string; title: string }>;
  onCellClick: (intent: string, personaId: string) => void;
}) {
  const personaLabels = new Map(personas.map((p) => [p.id, p.title]));
  const cells: HeatmapCell[] = metrics
    .filter((m) => m.scopeType === "intent_persona" && m.metricKey === "mention_rate")
    .map((m) => {
      const [intent, personaId] = m.scopeKey.split("|");
      return {
        intent,
        personaId,
        personaLabel: personaLabels.get(personaId) ?? personaId,
        n: m.n,
        // DB-3: cell-level figures still follow the small-n guard for
        // aggregate display, but a cell naturally has fewer samples than
        // overall scope — values below threshold render as "—" via null.
        value: isSufficientN(m.n) ? m.value : null,
      };
    });

  return (
    <section>
      <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">
        {PILLARS.presence.label} <span className="text-ink/40">— {PILLARS.presence.clientQuestion}</span>
      </h2>
      <FunnelHeatmap cells={cells} onCellClick={onCellClick} />
    </section>
  );
}
