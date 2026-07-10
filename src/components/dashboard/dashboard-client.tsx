"use client";

import { useEffect, useState } from "react";
import { AttributeSection } from "@/components/dashboard/attribute-section";
import { CitedSourcesSection } from "@/components/dashboard/cited-sources-section";
import { DrilldownPanel, type DrilldownRequest } from "@/components/dashboard/drilldown-panel";
import { FunnelSection } from "@/components/dashboard/funnel-section";
import { CompetitiveSpectrumSection } from "@/components/dashboard/competitive-spectrum-section";
import { MisinformationRegister } from "@/components/dashboard/misinformation-register";
import { MetricCards } from "@/components/dashboard/scorecard";
import { SentimentSection } from "@/components/dashboard/sentiment-section";
import { PillarSection } from "@/components/semantic/pillar";
import { Stamp } from "@/components/ui";
import { fetchDashboardData } from "@/modules/dashboard/actions";
import { metricLabel, type MetricRow } from "@/components/dashboard/format";
import { reportError } from "@/observability";

interface RunOption {
  id: string;
  state: string;
  runMode: string;
  createdAt: string | Date;
}

type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>;

export function DashboardClient({
  projectId,
  initialRuns,
  initialRunId,
  initialData,
  focusPillar = null,
}: {
  projectId: string;
  initialRuns: RunOption[];
  initialRunId: string | null;
  initialData: DashboardData;
  /** M32: when set, render only that pillar; null = overview (all pillars). */
  focusPillar?: "presence" | "position" | "perception" | "proof" | null;
}) {
  const [runs] = useState(initialRuns);
  const [runId, setRunId] = useState(initialRunId);
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [drilldown, setDrilldown] = useState<DrilldownRequest | null>(null);

  useEffect(() => {
    // Initial run's data is already server-rendered; only refetch on a run
    // switch or an explicit retry (reloadNonce bump).
    if (!runId || (runId === initialRunId && reloadNonce === 0)) return;
    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    fetchDashboardData(projectId, runId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Keep the previously loaded run's data on screen (aria-busy clears);
        // surface a retryable inline warning rather than blanking the page.
        reportError(err, { boundary: "dashboard-client", projectId, runId });
        setFetchFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId, initialRunId, reloadNonce]);

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-ink/15 p-10 text-center">
        <p className="label-mono text-sm text-ink/60">No completed runs yet</p>
        <p className="mt-1 font-mono text-xs text-ink/45">start and complete a run to see the dashboard</p>
      </div>
    );
  }

  if (!data) {
    return <p className="font-mono text-xs text-ink/45">Run not found</p>;
  }

  const metrics = data.metrics as MetricRow[];
  const stabilityRow = metrics.find((m) => m.scopeType === "overall" && m.metricKey === "stability_index");
  const isPartial = data.failureCounts.deadLettered > 0 || data.failureCounts.cancelled > 0;
  const modes = (data.run.selectedModesJson as string[]) ?? [];
  const isUngroundedOnly = modes.length > 0 && !modes.includes("grounded");
  const isLowStability = stabilityRow !== undefined && stabilityRow.value < 0.5;

  const onMetricEvidence = (metricKey: string) =>
    setDrilldown({
      kind: "metric",
      label: `${metricLabel(metricKey)} evidence`,
      metricKey,
      scopeType: "overall",
      scopeKey: "__all__",
    });

  const brandName = (brandId: string) => data.brands.find((b) => b.id === brandId)?.name ?? "brand";
  const onBrandEvidence = (brandId: string, metricKey: string) =>
    setDrilldown({
      kind: "metric",
      label: `${brandName(brandId)} · ${metricLabel(metricKey)} evidence`,
      metricKey,
      scopeType: "brand",
      scopeKey: brandId,
    });

  return (
    // Dimming while a different run's data loads: for an evidence tool,
    // numbers that might belong to the PREVIOUS run must be visibly stale,
    // not just accompanied by a small "Loading…" label. aria-busy + the
    // disabled select make the state unambiguous.
    <div className={loading ? "opacity-50 transition-standard" : "transition-standard"} aria-busy={loading}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-ink/20 bg-paper px-3 py-1.5 font-mono text-xs disabled:cursor-wait"
          value={runId ?? ""}
          disabled={loading}
          onChange={(e) => setRunId(e.target.value)}
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} · {r.runMode} · {r.state}
            </option>
          ))}
        </select>
        {loading && <span className="font-mono text-xs text-ink/45">Loading…</span>}
        {fetchFailed && (
          <span className="flex items-center gap-2 font-mono text-xs text-danger">
            Could not load this run — showing the last loaded data.
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="label-mono text-[11px] text-accent-ink hover:underline"
            >
              Retry →
            </button>
          </span>
        )}
        <div className="flex gap-2">
          {data.run.runMode === "mock" && <Stamp tone="accent">MOCK</Stamp>}
          {data.run.runMode === "live_validation" && <Stamp tone="warn">VALIDATION-ONLY</Stamp>}
          {isUngroundedOnly && <Stamp tone="ink">UNGROUNDED</Stamp>}
          {isPartial && <Stamp tone="warn">PARTIAL</Stamp>}
          {isLowStability && <Stamp tone="warn">LOW-STABILITY</Stamp>}
        </div>
      </div>

      {metrics.length === 0 ? (
        <div className="rounded-xl border border-warn p-6">
          <p className="font-mono text-sm text-ink/70">
            No metrics computed for this run yet — recompute from the run&rsquo;s detail page first.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* D-055 / M32: one numbered dossier section per pillar. focusPillar
              (URL view) shows a single pillar; overview shows all. */}
          {(focusPillar === null || focusPillar === "presence") && (
          <PillarSection pillar="presence">
            <div className="flex flex-col gap-6">
              <MetricCards
                metrics={metrics}
                keys={["mention_rate", "share_of_voice", "avg_first_position"]}
                onViewEvidence={onMetricEvidence}
              />
              <FunnelSection
                metrics={metrics}
                personas={data.personasMarkets.personas}
                onCellClick={(intent, personaId) =>
                  setDrilldown({
                    kind: "metric",
                    label: `${intent} x persona mention evidence`,
                    metricKey: "mention_rate",
                    scopeType: "intent_persona",
                    scopeKey: `${intent}|${personaId}`,
                  })
                }
              />
              <CompetitiveSpectrumSection
                title="Share of voice — the client vs each competitor"
                caption="Each brand's share of tracked-brand mentions in open, unbranded answers. Shares sum to 100%."
                metricKey="share_of_voice"
                metrics={metrics}
                brands={data.brands}
                onBrandEvidence={onBrandEvidence}
              />
            </div>
          </PillarSection>
          )}

          {(focusPillar === null || focusPillar === "position") && (
          <PillarSection pillar="position">
            <div className="flex flex-col gap-6">
              <MetricCards
                metrics={metrics}
                keys={["recommendation_rate", "comparative_win_rate"]}
                onViewEvidence={onMetricEvidence}
              />
              <CompetitiveSpectrumSection
                title="Head-to-head — who AI picks when forced to compare"
                caption="Each brand's recommendation rate in direct comparison prompts. Brands are independent, so these need not sum to 100%."
                metricKey="comparative_win_rate"
                metrics={metrics}
                brands={data.brands}
                onBrandEvidence={onBrandEvidence}
              />
            </div>
          </PillarSection>
          )}

          {(focusPillar === null || focusPillar === "perception") && (
          <PillarSection pillar="perception">
            <div className="flex flex-col gap-6">
              <AttributeSection metrics={metrics} onAttributeEvidence={onMetricEvidence} />
              <SentimentSection metrics={metrics} />
            </div>
          </PillarSection>
          )}

          {(focusPillar === null || focusPillar === "proof") && (
          <PillarSection pillar="proof">
            <div className="flex flex-col gap-6">
              <MetricCards
                metrics={metrics}
                keys={["citation_share", "accuracy_rate"]}
                onViewEvidence={onMetricEvidence}
              />
              <CitedSourcesSection
                sources={data.citedSources}
                onDomainClick={(responseIds, domain) =>
                  setDrilldown({ kind: "responses", label: `Cited by ${domain}`, responseIds })
                }
              />
              <MisinformationRegister
                runId={data.run.id}
                projectId={projectId}
                rows={data.misinformation}
                onRowClick={(responseId, claimText) =>
                  setDrilldown({ kind: "response", label: claimText.slice(0, 60), responseId })
                }
                onReviewed={() => {
                  if (runId)
                    fetchDashboardData(projectId, runId)
                      .then((d) => d && setData(d))
                      .catch((err) =>
                        reportError(err, { boundary: "dashboard-review-refresh", projectId, runId }),
                      );
                }}
              />
            </div>
          </PillarSection>
          )}

          {/* Confidence rail — deliberately NOT a fifth pillar (D-051):
              the layer under all four. Shown on overview only. */}
          {focusPillar === null && (
          <div className="rounded-xl border border-ink/15 p-4">
            <div className="mb-2 label-mono text-xs font-medium uppercase text-ink/60">
              Confidence rail — spans all four
            </div>
            <div className="flex flex-wrap items-center gap-6 font-mono text-xs text-ink/60">
              <span>
                Stability Index:{" "}
                <span className="text-ink tabular-nums">
                  {stabilityRow ? stabilityRow.value.toFixed(2) : "—"}
                </span>
                {stabilityRow ? ` (n=${stabilityRow.n} cells)` : ""}
              </span>
              <span>k={data.run.repetitions} repetitions per cell</span>
              <span>aggregate claims gated at n≥30 (directional below)</span>
              <button
                type="button"
                onClick={() => onMetricEvidence("stability_index")}
                className="label-mono text-[11px] text-accent-ink hover:underline"
              >
                Evidence →
              </button>
            </div>
          </div>
          )}
        </div>
      )}

      {drilldown && runId && (
        <DrilldownPanel projectId={projectId} runId={runId} request={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
