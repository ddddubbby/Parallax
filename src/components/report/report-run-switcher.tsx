"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Select } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
import { useUnsavedEdit } from "@/components/unsaved-edit";
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
  const { dirty, clearDirty } = useUnsavedEdit();
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const view = searchParams.get("view") ?? undefined;
  if (runs.length < 2) return null;

  function navigate(nextRunId: string) {
    const href = view
      ? withViewParam(`/projects/${projectId}/report`, view, { runId: nextRunId })
      : `/projects/${projectId}/report?runId=${nextRunId}`;
    router.push(href);
  }

  return (
    <>
      <label className="mb-6 flex max-w-xl flex-col gap-1">
        <span className="label-mono text-xs text-ink/60">Report run</span>
        <Select
          ref={selectRef}
          className="font-mono text-xs"
          value={runId}
          onChange={(event) => {
            const nextRunId = event.target.value;
            if (dirty) {
              setPendingRunId(nextRunId);
              return;
            }
            navigate(nextRunId);
          }}
        >
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} · {r.matrixKind === "resonance" ? "SIM" : "AUDIT"} · {r.runMode} · {r.state}
            </option>
          ))}
        </Select>
      </label>
      <AppConfirmDialog
        open={pendingRunId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRunId(null);
            requestAnimationFrame(() => selectRef.current?.focus());
          }
        }}
        title="Discard this report edit?"
        description="The selected run cannot be opened until you save or discard the unsaved edit in this report section. Other saved sections remain unchanged."
        confirmLabel="Discard and switch run"
        onConfirm={() => {
          if (!pendingRunId) return;
          const next = pendingRunId;
          clearDirty();
          setPendingRunId(null);
          navigate(next);
        }}
      />
    </>
  );
}
