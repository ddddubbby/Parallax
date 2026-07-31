import { isSufficientN } from "@/core/metrics";
import { resolveGlossary } from "@/core/semantic";

// UI-only formatting for metric surfaces (dashboard + run metrics preview).
// Domain math lives in src/core/metrics.ts — this file only shapes text.

export interface MetricRow {
  id: string;
  scopeType: string;
  scopeKey: string;
  metricKey: string;
  n: number;
  value: number;
  ciLow: number | null;
  ciHigh: number | null;
}

const RATE_METRIC_KEYS = new Set([
  "mention_rate",
  "recommendation_rate",
  "comparative_win_rate",
  "share_of_voice",
  "citation_share",
  "accuracy_rate",
]);

export function isRateMetric(metricKey: string): boolean {
  return (
    RATE_METRIC_KEYS.has(metricKey) ||
    metricKey.startsWith("sentiment_") ||
    metricKey.startsWith("attribute_")
  );
}

export function formatMetricValue(m: MetricRow): string {
  if (isRateMetric(m.metricKey)) return `${(m.value * 100).toFixed(1)}%`;
  if (m.metricKey === "stability_index") return m.value.toFixed(2);
  return m.value.toFixed(2);
}

export function formatCI(m: MetricRow): string | null {
  if (m.ciLow === null || m.ciHigh === null) return null;
  return `[${(m.ciLow * 100).toFixed(0)}–${(m.ciHigh * 100).toFixed(0)}%]`;
}

/** DB-3/SM-6: overall aggregate claims share one epistemic gate across surfaces. */
export type GatedMetricDisplay =
  | { kind: "insufficient"; n: number }
  | { kind: "value"; n: number; value: string; ci: string | null };

export function formatGatedMetricDisplay(m: Pick<MetricRow, "n" | "metricKey" | "value" | "ciLow" | "ciHigh">): GatedMetricDisplay {
  if (!isSufficientN(m.n)) return { kind: "insufficient", n: m.n };
  return {
    kind: "value",
    n: m.n,
    value: formatMetricValue(m as MetricRow),
    ci: formatCI(m as MetricRow),
  };
}

export function metricLabel(metricKey: string): string {
  return resolveGlossary(metricKey).label;
}
