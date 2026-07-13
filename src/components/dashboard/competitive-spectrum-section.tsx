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
  onBrandEvidence: (brandId: string, metricKey: string, trigger?: HTMLElement) => void;
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

  return (
    <div>
      <span className="mb-2 block label-mono text-xs font-medium text-ink/70">{title}</span>
      <p className="mb-2 text-sm leading-relaxed text-ink/65">{caption}</p>
      {data.length === 0 || !isSufficientN(n) ? (
        <Stamp tone="warn">Insufficient data{n > 0 ? ` (n=${n})` : ""}</Stamp>
      ) : (
        <>
          {/* CS-4: every bar drills to that brand's evidence, not just the client. */}
          <SoVChart
            data={data}
            height={Math.max(120, data.length * 42 + 40)}
            onBarClick={(brandId) => onBrandEvidence(brandId, metricKey)}
          />
          <div className="mt-2 overflow-x-auto" role="region" aria-label={`${title} evidence table`} tabIndex={0}>
            <table className="min-w-[32rem] w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-ink/15 text-left text-ink/65">
                  <th className="py-2 pr-3">Brand</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Sample</th>
                  <th className="py-2 text-right">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => (
                  <tr key={row.brandId} className="border-b border-ink/10">
                    <td className="py-2 pr-3">{row.name}{row.isClient ? " · client" : ""}</td>
                    <td className="py-2 pr-3 tabular-nums">{(row.value * 100).toFixed(1)}%</td>
                    <td className="py-2 pr-3 tabular-nums">n={row.n}</td>
                    <td className="py-1 text-right">
                      <button
                        type="button"
                        onClick={(event) => onBrandEvidence(row.brandId, metricKey, event.currentTarget)}
                        className="inline-flex min-h-11 items-center rounded-sm text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
