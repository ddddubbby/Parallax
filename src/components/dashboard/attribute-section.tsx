"use client";

import { AttributeRadar, type AttributeRadarDatum } from "@/components/charts/AttributeRadar";
import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import { PILLARS } from "@/core/semantic";
import type { MetricRow } from "./format";

/** DB-1 attribute radar: client attribute-association rates (MT-10). */
export function AttributeSection({
  metrics,
  onViewEvidence,
}: {
  metrics: MetricRow[];
  onViewEvidence: () => void;
}) {
  const attrRows = metrics.filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("attribute_"));
  const sufficient = attrRows.length > 0 && isSufficientN(attrRows[0].n);

  const data: AttributeRadarDatum[] = attrRows.map((m) => ({
    attribute: m.metricKey.replace("attribute_", ""),
    rate: m.value,
  }));

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-mono text-xs font-medium text-ink/60">
          {PILLARS.perception.label} <span className="text-ink/40">— {PILLARS.perception.clientQuestion}</span>
        </h2>
        <button type="button" onClick={onViewEvidence} className="label-mono text-xs text-accent-ink hover:underline">
          View evidence →
        </button>
      </div>
      {attrRows.length === 0 ? (
        <p className="font-mono text-xs text-ink/45">No attribute data yet</p>
      ) : !sufficient ? (
        <Stamp tone="warn">Insufficient data</Stamp>
      ) : (
        <AttributeRadar data={data} />
      )}
    </section>
  );
}
