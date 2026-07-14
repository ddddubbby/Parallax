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
  onAttributeEvidence: (metricKey: string, trigger?: HTMLElement) => void;
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
        <p className="font-mono text-xs text-ink/65">No attribute data yet</p>
      ) : !sufficient ? (
        <Stamp tone="warn">Insufficient data</Stamp>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink/65">
            n={attrRows[0].n} · Select an attribute below to inspect its evidence.
          </p>
          <div role="img" aria-label="Attribute association radar">
            <AttributeRadar data={data} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {attrRows.map((m) => (
              <button
                key={m.metricKey}
                type="button"
                onClick={(event) => onAttributeEvidence(m.metricKey, event.currentTarget)}
                className="interactive-press label-mono inline-flex min-h-11 items-center rounded-full border border-ink/20 px-3 py-2 text-xs text-ink/70 transition-micro hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                aria-label={`View evidence for ${m.metricKey.replace("attribute_", "")} association, ${(m.value * 100).toFixed(0)} percent, n ${m.n}`}
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
