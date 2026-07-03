"use client";

import { useEffect, useState } from "react";
import { AttributeSection } from "@/components/dashboard/attribute-section";
import { CitedSourcesSection } from "@/components/dashboard/cited-sources-section";
import { DrilldownPanel, type DrilldownRequest } from "@/components/dashboard/drilldown-panel";
import { FunnelSection } from "@/components/dashboard/funnel-section";
import { MisinformationRegister } from "@/components/dashboard/misinformation-register";
import { Scorecard } from "@/components/dashboard/scorecard";
import { ShareOfVoiceSection } from "@/components/dashboard/share-of-voice-section";
import { Stamp } from "@/components/ui";
import { fetchDashboardData } from "@/modules/dashboard/actions";
import type { MetricRow } from "@/components/dashboard/format";

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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          className="rounded-lg border border-ink/20 bg-paper px-3 py-1.5 font-mono text-xs"
          value={runId ?? ""}
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
          <Scorecard
            metrics={metrics}
            onViewEvidence={() => setDrilldown({ kind: "scope", label: "Scorecard evidence" })}
          />
          <FunnelSection
            metrics={metrics}
            personas={data.personasMarkets.personas}
            onCellClick={(intent, personaId) =>
              setDrilldown({ kind: "scope", label: `${intent} × persona evidence`, intent, personaId })
            }
          />
          <ShareOfVoiceSection
            metrics={metrics}
            brands={data.brands}
            onViewEvidence={() => setDrilldown({ kind: "scope", label: "Share of Voice evidence" })}
          />
          <AttributeSection
            metrics={metrics}
            onViewEvidence={() => setDrilldown({ kind: "scope", label: "Attribute evidence" })}
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
          />
        </div>
      )}

      {drilldown && runId && (
        <DrilldownPanel runId={runId} request={drilldown} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}
