"use client";

import { AttributeRadar, type AttributeRadarDatum } from "@/components/charts/AttributeRadar";
import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import type { MetricRow } from "./format";

/**
 * DB-1 attribute radar: client attribute-association rates (MT-10). Each
 * attribute drills to the responses behind its own metric denominator (audit
 * finding: a generic scope drilldown showed arbitrary responses, not the
 * attribute's numerator/denominator).
 */
export function AttributeSection({
  metrics,
  onAttributeEvidence,
}: {
  metrics: MetricRow[];
  onAttributeEvidence: (metricKey: string) => void;
}) {
  const attrRows = metrics.filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("attribute_"));
  const sufficient = attrRows.length > 0 && isSufficientN(attrRows[0].n);

  const data: AttributeRadarDatum[] = attrRows.map((m) => ({
    attribute: m.metricKey.replace("attribute_", ""),
    rate: m.value,
  }));

  return (
    <section>
      <span className="mb-2 block label-mono text-xs font-medium text-ink/70">Attribute associations</span>
      {attrRows.length === 0 ? (
        <p className="font-mono text-xs text-ink/45">No attribute data yet</p>
      ) : !sufficient ? (
        <Stamp tone="warn">Insufficient data</Stamp>
      ) : (
        <>
          <p className="label-mono mb-2 text-[11px] text-ink/45">n={attrRows[0].n} · click an attribute for its evidence</p>
          <AttributeRadar data={data} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {attrRows.map((m) => (
              <button
                key={m.metricKey}
                type="button"
                onClick={() => onAttributeEvidence(m.metricKey)}
                className="label-mono rounded-full border border-ink/20 px-2.5 py-1 text-[11px] text-ink/70 transition-micro hover:border-ink hover:text-ink"
              >
                {m.metricKey.replace("attribute_", "")} {(m.value * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
