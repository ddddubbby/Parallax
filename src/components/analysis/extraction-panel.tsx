"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Stamp } from "@/components/ui";
import { fetchExtractionAndMetrics } from "@/modules/extraction/actions";
import { recomputeMetrics } from "@/modules/analysis/actions";

const POLL_MS = 2000;
const EXTRACTION_STATES = ["pending", "retrying", "valid", "dead_lettered", "qa_reviewed"];

interface MetricRow {
  id: string;
  scopeType: string;
  scopeKey: string;
  metricKey: string;
  n: number;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
}

function formatMetric(m: MetricRow): string {
  const pct = m.metricKey.endsWith("_rate") || m.metricKey === "share_of_voice" || m.metricKey === "citation_share" || m.metricKey.startsWith("sentiment_") || m.metricKey.startsWith("attribute_");
  const value = pct ? `${(m.value * 100).toFixed(1)}%` : m.value.toFixed(2);
  const ci = m.ciLow !== null && m.ciHigh !== null ? ` [${(m.ciLow * 100).toFixed(0)}–${(m.ciHigh * 100).toFixed(0)}%]` : "";
  return `${value}${ci}`;
}

export function ExtractionPanel({ runId, terminal }: { runId: string; terminal: boolean }) {
  const [data, setData] = useState<{ progress: Record<string, number>; metrics: MetricRow[]; plannedResponses: number } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function poll() {
      fetchExtractionAndMetrics(runId).then(setData);
    }
    poll();
    if (terminal) return;
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [runId, terminal]);

  if (!data) return null;

  const overallMetrics = data.metrics.filter((m) => m.scopeType === "overall");
  const extracted = (data.progress.valid ?? 0) + (data.progress.qa_reviewed ?? 0);
  const deadLettered = data.progress.dead_lettered ?? 0;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="label-mono text-xs font-medium text-ink/60">Extraction</h2>
        {deadLettered > 0 && <Stamp tone="danger">{deadLettered} dead-lettered</Stamp>}
      </div>
      <div className="mb-6 grid grid-cols-5 gap-2 font-mono text-xs text-ink/60">
        {EXTRACTION_STATES.map((s) => (
          <div key={s}>
            {s}: {data.progress[s] ?? 0}
          </div>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="label-mono text-xs font-medium text-ink/60">
          Metrics preview <span className="text-ink/40">(overall scope — full dashboard is M6)</span>
        </h2>
        <Button
          variant="secondary"
          disabled={pending || extracted === 0}
          onClick={() =>
            startTransition(async () => {
              await recomputeMetrics(runId);
              fetchExtractionAndMetrics(runId).then(setData);
            })
          }
        >
          {pending ? "Recomputing…" : "Recompute metrics"}
        </Button>
      </div>
      {overallMetrics.length === 0 ? (
        <p className="font-mono text-xs text-ink/45">No metrics computed yet</p>
      ) : (
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-ink/20 text-left text-ink/50">
              <th className="py-1.5 pr-4">Metric</th>
              <th className="py-1.5 pr-4">n</th>
              <th className="py-1.5 pr-4">Value</th>
            </tr>
          </thead>
          <tbody>
            {overallMetrics.map((m) => (
              <tr key={m.id} className="border-b border-ink/10">
                <td className="py-1.5 pr-4">{m.metricKey}</td>
                <td className="py-1.5 pr-4 text-ink/50">{m.n}</td>
                <td className="py-1.5 pr-4">{formatMetric(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
