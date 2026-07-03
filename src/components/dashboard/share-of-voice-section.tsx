"use client";

import { SoVChart, type SoVDatum } from "@/components/charts/SoVChart";
import { Stamp } from "@/components/ui";
import { isSufficientN } from "@/core/metrics";
import type { MetricRow } from "./format";

/** DB-1 share of voice: client vs competitor mention share, DB-3 small-n guard. */
export function ShareOfVoiceSection({
  metrics,
  brands,
  onViewEvidence,
}: {
  metrics: MetricRow[];
  brands: Array<{ id: string; role: string; name: string }>;
  onViewEvidence: () => void;
}) {
  const sovRow = metrics.find((m) => m.scopeType === "overall" && m.metricKey === "share_of_voice");
  const mentionRow = metrics.find((m) => m.scopeType === "overall" && m.metricKey === "mention_rate");
  const client = brands.find((b) => b.role === "client");

  // Client's share is stored directly; competitors' implied shares are not
  // separately computed per-brand in MVP (M5 only computed client-vs-all).
  // Displaying the client bar against a "rest of field" bar is the honest
  // representation of what's actually measured, rather than fabricating
  // per-competitor splits the metrics table doesn't have.
  const data: SoVDatum[] = client
    ? [
        { brandId: client.id, name: client.name, isClient: true, share: sovRow?.value ?? 0 },
        { brandId: "__field__", name: "Rest of field", isClient: false, share: 1 - (sovRow?.value ?? 0) },
      ]
    : [];

  const sufficient = mentionRow ? isSufficientN(mentionRow.n) : false;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-mono text-xs font-medium text-ink/60">Share of Voice</h2>
        <button type="button" onClick={onViewEvidence} className="label-mono text-xs text-accent-ink hover:underline">
          View evidence →
        </button>
      </div>
      {!sovRow || !sufficient ? (
        <Stamp tone="warn">Insufficient data</Stamp>
      ) : (
        <SoVChart data={data} />
      )}
    </section>
  );
}
