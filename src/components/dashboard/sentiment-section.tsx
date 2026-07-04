"use client";

import { Stamp } from "@/components/ui";
import type { MetricRow } from "./format";

const LABELS = ["positive", "neutral", "mixed", "negative"] as const;
const GROUPS: Array<{ key: "organic" | "solicited"; title: string; caption: string }> = [
  { key: "organic", title: "Organic", caption: "How AI describes the client when it brings the brand up (unbranded prompts)." },
  { key: "solicited", title: "Solicited", caption: "How AI answers a direct fit question (validation prompts)." },
];

/**
 * D-054 sentiment split shown on the dashboard: organic and solicited
 * distributions, never pooled. Objection cells feed no sentiment metric by
 * design. Point estimates (no interval, D-023).
 */
export function SentimentSection({ metrics }: { metrics: MetricRow[] }) {
  return (
    <div className="flex flex-col gap-5">
      <span className="label-mono text-xs font-medium text-ink/70">Sentiment</span>
      {GROUPS.map((group) => {
        const rows = LABELS.map((label) =>
          metrics.find((m) => m.scopeType === "overall" && m.metricKey === `sentiment_${group.key}_${label}`),
        );
        const n = rows.find((r) => r)?.n ?? 0;
        return (
          <div key={group.key}>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="label-mono text-[11px] text-ink/60">{group.title}</span>
              <span className="font-mono text-[11px] text-ink/40">n={n}</span>
            </div>
            <p className="mb-2 font-mono text-[11px] text-ink/45">{group.caption}</p>
            {n === 0 ? (
              <Stamp tone="ink">No mentions in this frame</Stamp>
            ) : (
              <div className="flex flex-col gap-1">
                {LABELS.map((label, i) => {
                  const v = rows[i]?.value ?? 0;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="label-mono w-20 text-[11px] text-ink/60">{label}</span>
                      <div className="h-3 flex-1 rounded-sm bg-paper-2">
                        <div
                          className="h-3 rounded-sm bg-ink/60"
                          style={{ width: `${Math.round(v * 100)}%` }}
                        />
                      </div>
                      <span className="w-12 text-right font-mono text-[11px] tabular-nums text-ink/70">
                        {(v * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
