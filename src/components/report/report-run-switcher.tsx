"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { withViewParam } from "@/core/views";

// D2: the report is scoped to one run via the ?runId= param. Without a
// switcher (the dashboard has one), viewing an older run's report meant
// hand-editing the URL. Navigates via the same param the page already reads,
// keeping the server-fetch model intact.
export function ReportRunSwitcher({
  projectId,
  runId,
  runs,
}: {
  projectId: string;
  runId: string;
  runs: Array<{ id: string; runMode: string; state: string; createdAt: Date; matrixKind?: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") ?? undefined;
  if (runs.length < 2) return null;
  return (
    <select
      className="mb-6 rounded-lg border border-ink/20 bg-paper px-3 py-1.5 font-mono text-xs"
      value={runId}
      onChange={(e) => {
        const nextRunId = e.target.value;
        // M32: keep the outline section when switching runs when possible.
        const href = view
          ? withViewParam(`/projects/${projectId}/report`, view, { runId: nextRunId })
          : `/projects/${projectId}/report?runId=${nextRunId}`;
        router.push(href);
      }}
    >
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} · {r.matrixKind === "resonance" ? "SIM" : "AUDIT"} · {r.runMode} · {r.state}
        </option>
      ))}
    </select>
  );
}
