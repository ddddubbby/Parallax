"use client";

import { SoVChart, type SoVDatum } from "@/components/charts/SoVChart";
import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import type { MetricRow } from "./format";

/**
 * CS-2: ranks the client against every tracked competitor on one metric,
 * from the per-brand metric scope (CS-1). Replaces the old "client vs rest
 * of the field" bar — the operator sees exactly where the client sits in
 * the full competitive spectrum. Rows arrive ranked (client highlighted in
 * accent regardless of rank).
 */
export function CompetitiveSpectrumSection({
  title,
  caption,
  metricKey,
  metrics,
  brands,
  onBrandEvidence,
}: {
  title: string;
  caption: string;
  metricKey: string;
  metrics: MetricRow[];
  brands: Array<{ id: string; role: string; name: string }>;
  onBrandEvidence: (brandId: string, metricKey: string) => void;
}) {
  const ranked = brands
    .map((b) => {
      const row = metrics.find((m) => m.scopeType === "brand" && m.scopeKey === b.id && m.metricKey === metricKey);
      if (!row) return null;
      return { brandId: b.id, name: b.name, isClient: b.role === "client", value: row.value, n: row.n };
    })
    .filter((d): d is { brandId: string; name: string; isClient: boolean; value: number; n: number } => d !== null)
    .sort((a, b) => b.value - a.value);

  const data: SoVDatum[] = ranked.map(({ brandId, name, isClient, value }) => ({ brandId, name, isClient, value }));
  // Every brand row shares the same denominator (unbranded or comparison
  // sample count), so one n gates the whole chart.
  const n = ranked[0]?.n ?? 0;
  const client = ranked.find((d) => d.isClient);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="label-mono text-xs font-medium text-ink/70">{title}</span>
        {client && (
          <button
            type="button"
            onClick={() => onBrandEvidence(client.brandId, metricKey)}
            className="label-mono text-[11px] text-accent-ink hover:underline"
          >
            Evidence →
          </button>
        )}
      </div>
      <p className="mb-2 font-mono text-[11px] text-ink/45">{caption}</p>
      {data.length === 0 || !isSufficientN(n) ? (
        <Stamp tone="warn">Insufficient data{n > 0 ? ` (n=${n})` : ""}</Stamp>
      ) : (
        <>
          <SoVChart data={data} height={Math.max(120, data.length * 42 + 40)} />
          <p className="label-mono mt-1 text-[11px] text-ink/45">n={n}</p>
        </>
      )}
    </div>
  );
}
