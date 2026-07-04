"use client";

import { useEffect, useState } from "react";
import { AttributeSection } from "@/components/dashboard/attribute-section";
import { CitedSourcesSection } from "@/components/dashboard/cited-sources-section";
import { DrilldownPanel, type DrilldownRequest } from "@/components/dashboard/drilldown-panel";
import { FunnelSection } from "@/components/dashboard/funnel-section";
import { MisinformationRegister } from "@/components/dashboard/misinformation-register";
import { MetricCards } from "@/components/dashboard/scorecard";
import { ShareOfVoiceSection } from "@/components/dashboard/share-of-voice-section";
import { PillarSection } from "@/components/semantic/pillar";
import { Stamp } from "@/components/ui";
import { fetchDashboardData } from "@/modules/dashboard/actions";
import { metricLabel, type MetricRow } from "@/components/dashboard/format";

interface RunOption {
  id: string;
  state: string;
  runMode: string;
  createdAt: string | Date;
}

type DashboardData = Awaited<ReturnType<typeof fetchDashboardData>>;

export function DashboardClient({
  initialRuns,
  initialRunId,
  initialData,
}: {
  initialRuns: RunOption[];
  initialRunId: string | null;
  initialData: DashboardData;
}) {
  const [runs] = useState(initialRuns);
  const [runId, setRunId] = useState(initialRunId);
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState<DrilldownRequest | null>(null);

  useEffect(() => {
    if (!runId || runId === initialRunId) return;
    setLoading(true);
    fetchDashboardData(runId).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [runId, initialRunId]);

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
          {/* D-055: one numbered dossier section per pillar — the operator
              can tell which P any figure belongs to at a glance. */}
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
                  setDrilldown({ kind: "scope", label: `${intent} × persona evidence`, intent, personaId })
                }
              />
              <ShareOfVoiceSection metrics={metrics} brands={data.brands} onViewEvidence={onMetricEvidence} />
            </div>
          </PillarSection>

          <PillarSection pillar="position">
            <MetricCards
              metrics={metrics}
              keys={["recommendation_rate", "comparative_win_rate"]}
              onViewEvidence={onMetricEvidence}
            />
          </PillarSection>

          <PillarSection pillar="perception">
            <AttributeSection
              metrics={metrics}
              onViewEvidence={() => setDrilldown({ kind: "scope", label: "Attribute evidence" })}
            />
          </PillarSection>

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
                rows={data.misinformation}
                onRowClick={(responseId, claimText) =>
                  setDrilldown({ kind: "response", label: claimText.slice(0, 60), responseId })
                }
                onReviewed={() => {
                  if (runId) fetchDashboardData(runId).then((d) => d && setData(d));
                }}
              />
            </div>
          </PillarSection>

          {/* Confidence rail — deliberately NOT a fifth pillar (D-051):
              the layer under all four. */}
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
        </div>
      )}

      {drilldown && runId && (
        <DrilldownPanel runId={runId} request={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
