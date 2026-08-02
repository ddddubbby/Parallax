"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AttributeSection } from "@/components/dashboard/attribute-section";
import { EmptyState } from "@/components/empty-state";
import { CitedSourcesSection } from "@/components/dashboard/cited-sources-section";
import { DrilldownPanel, type DrilldownRequest } from "@/components/dashboard/drilldown-panel";
import { FindingsPanel } from "@/components/dashboard/findings-panel";
import { FunnelSection } from "@/components/dashboard/funnel-section";
import { CompetitiveSpectrumSection } from "@/components/dashboard/competitive-spectrum-section";
import { MisinformationRegister } from "@/components/dashboard/misinformation-register";
import { MetricCards } from "@/components/dashboard/scorecard";
import { SentimentSection } from "@/components/dashboard/sentiment-section";
import { RunModeStamp } from "@/components/run-mode-stamp";
import { PillarSection } from "@/components/semantic/pillar";
import { Button, InlineStatus, Select, Stamp } from "@/components/ui";
import { fetchDashboardData } from "@/modules/dashboard/actions";
import { metricLabel, type MetricRow } from "@/components/dashboard/format";
import { reportError } from "@/observability";
import { ResolutionHealthCard } from "@/components/dashboard/resolution-health";

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
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const evidenceTriggerRef = useRef<HTMLElement | null>(null);

  function openDrilldown(request: DrilldownRequest, trigger?: HTMLElement) {
    document.querySelector('[data-evidence-return="true"]')?.removeAttribute("data-evidence-return");
    if (trigger) {
      evidenceTriggerRef.current = trigger;
    } else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      evidenceTriggerRef.current = document.activeElement;
    }
    evidenceTriggerRef.current?.setAttribute("data-evidence-return", "true");
    setDrilldown(request);
    setDrilldownOpen(true);
  }

  function closeDrilldown() {
    setDrilldownOpen(false);
    finishDrilldownClose();
  }

  function finishDrilldownClose() {
    const trigger = document.querySelector<HTMLElement>('[data-evidence-return="true"]');
    setDrilldown(null);
    window.setTimeout(() => {
      trigger?.focus();
      trigger?.removeAttribute("data-evidence-return");
    }, 0);
  }

  useEffect(() => {
    // The currently displayed run is already loaded; refetch only for a
    // different selection or an explicit retry. Comparing against `data`
    // (not only the server's initial id) also makes switching back reliable.
    if (!runId || (runId === data?.run.id && reloadNonce === 0)) return;
    let cancelled = false;
    setLoading(true);
    setFetchFailed(false);
    fetchDashboardData(projectId, runId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setReloadNonce(0);
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
  }, [projectId, runId, data?.run.id, reloadNonce]);

  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-ink/15 p-10 text-center">
        <p className="label-mono text-sm text-ink/60">No completed runs yet</p>
        <p className="mt-1 text-sm text-ink/65">Complete an audit run to populate the evidence dashboard.</p>
        <Link
          href={`/projects/${projectId}/runs/new`}
          className="interactive-press label-mono mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Configure run →
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <InlineStatus tone="danger">
        This run could not be found. Choose another completed run from the run library.
      </InlineStatus>
    );
  }

  const metrics = data.metrics as MetricRow[];
  const stabilityRow = metrics.find((m) => m.scopeType === "overall" && m.metricKey === "stability_index");
  const isPartial = data.failureCounts.deadLettered > 0 || data.failureCounts.cancelled > 0;
  const modes = (data.run.selectedModesJson as string[]) ?? [];
  const isUngroundedOnly = modes.length > 0 && !modes.includes("grounded");
  const isLowStability = stabilityRow !== undefined && stabilityRow.value < 0.5;

  const onMetricEvidence = (metricKey: string, trigger?: HTMLElement) =>
    openDrilldown({
      kind: "metric",
      label: `${metricLabel(metricKey)} evidence`,
      metricKey,
      scopeType: "overall",
      scopeKey: "__all__",
    }, trigger);

  const brandName = (brandId: string) => data.brands.find((b) => b.id === brandId)?.name ?? "brand";
  const onBrandEvidence = (brandId: string, metricKey: string, trigger?: HTMLElement) =>
    openDrilldown({
      kind: "metric",
      label: `${brandName(brandId)} · ${metricLabel(metricKey)} evidence`,
      metricKey,
      scopeType: "brand",
      scopeKey: brandId,
    }, trigger);

  return (
    <div
      aria-busy={loading}
      data-stale={loading || fetchFailed || undefined}
      onPointerDownCapture={(event) => {
        const trigger = (event.target as HTMLElement).closest("button, a");
        if (trigger instanceof HTMLElement) evidenceTriggerRef.current = trigger;
      }}
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xl">
          <span className="label-mono text-xs text-ink/60">Audit run</span>
          <Select
            value={runId ?? ""}
            disabled={loading}
            className="font-mono text-xs disabled:cursor-wait"
            onChange={(e) => {
              setDrilldownOpen(false);
              setDrilldown(null);
              setRunId(e.target.value);
            }}
          >
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} · {r.runMode} · {r.state}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-2 sm:pb-2">
          <RunModeStamp runMode={data.run.runMode} />
          {isUngroundedOnly && <Stamp tone="ink">UNGROUNDED</Stamp>}
          {isPartial && <Stamp tone="warn">PARTIAL</Stamp>}
          {isLowStability && <Stamp tone="warn">LOW-STABILITY</Stamp>}
        </div>
      </div>

      {loading && (
        <InlineStatus className="mb-6">
          Loading the selected run. Figures below remain visible but are stale from run{" "}
          <span className="font-mono tabular-nums">{data.run.id.slice(0, 8)}</span> until the switch completes.
        </InlineStatus>
      )}
      {fetchFailed && (
        <InlineStatus tone="danger" className="mb-6">
          <span>
            The selected run could not be loaded. Still showing valid data from run{" "}
            <span className="font-mono tabular-nums">{data.run.id.slice(0, 8)}</span>.
          </span>{" "}
          <Button
            type="button"
            variant="ghost"
            className="ml-1 min-h-11 px-2 text-danger underline underline-offset-4"
            onClick={() => setReloadNonce((n) => n + 1)}
          >
            Retry
          </Button>
        </InlineStatus>
      )}

      {metrics.length === 0 ? (
        <EmptyState
          kind="unavailable"
          title="No metrics computed"
          action={{
            href: `/projects/${projectId}/runs/${data.run.id}?view=metrics`,
            label: "Review metrics →",
          }}
        >
          Review extraction state, then recompute the evidence metrics from the run detail.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-10">
          {/* D-055 / M32: one numbered dossier section per pillar. focusPillar
              (URL view) shows a single pillar; overview shows all. */}
          {(focusPillar === null || focusPillar === "presence") && (
          <PillarSection pillar="presence">
            <div className="flex flex-col gap-6">
              {runId && (
                <ResolutionHealthCard
                  projectId={projectId}
                  runId={runId}
                  onMetricsChanged={() => setReloadNonce((n) => n + 1)}
                />
              )}
              <MetricCards
                metrics={metrics}
                keys={["mention_rate", "share_of_voice", "avg_first_position"]}
                onViewEvidence={onMetricEvidence}
              />
              <FunnelSection
                metrics={metrics}
                personas={data.personasMarkets.personas}
                onCellClick={(intent, personaId, trigger) =>
                  openDrilldown({
                    kind: "metric",
                    label: `${intent} x persona mention evidence`,
                    metricKey: "mention_rate",
                    scopeType: "intent_persona",
                    scopeKey: `${intent}|${personaId}`,
                  }, trigger)
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
                onDomainClick={(responseIds, domain, trigger) =>
                  openDrilldown({ kind: "responses", label: `Cited by ${domain}`, responseIds }, trigger)
                }
              />
              <MisinformationRegister
                runId={data.run.id}
                projectId={projectId}
                rows={data.misinformation}
                onRowClick={(responseId, claimText, trigger) =>
                  openDrilldown({ kind: "response", label: claimText.slice(0, 60), responseId }, trigger)
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
                {stabilityRow ? ` (sample size: ${stabilityRow.n} prompt cells)` : ""}
              </span>
              <span>Repeats per prompt: {data.run.repetitions}</span>
              <span>aggregate claims need a sample size of 30 or more (directional below)</span>
              <button
                type="button"
                onClick={(event) => onMetricEvidence("stability_index", event.currentTarget)}
                className="label-mono inline-flex min-h-11 items-center rounded-sm text-xs text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Evidence →
              </button>
            </div>
          </div>
          )}

          {focusPillar === null && <FindingsPanel findings={data.findings ?? []} />}
        </div>
      )}

      {drilldown && runId && (
        <DrilldownPanel
          projectId={projectId}
          runId={runId}
          request={drilldown}
          open={drilldownOpen}
          onClose={closeDrilldown}
        />
      )}
    </div>
  );
}
