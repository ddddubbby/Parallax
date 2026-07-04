import { resolveGlossary } from "@/core/semantic";

// UI-only formatting for the dashboard. Not domain logic (that's
// src/core/metrics.ts) — just how a MetricResult renders as text.

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

export function metricLabel(metricKey: string): string {
  return resolveGlossary(metricKey).label;
}
