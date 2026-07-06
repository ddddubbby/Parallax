"use client";

import { useEffect, useState } from "react";
import { Stamp } from "@/components/ui";
import { fetchDrilldown, fetchMetricDrilldown, fetchResponseDetail, fetchResponsesByIds } from "@/modules/dashboard/actions";

export type DrilldownRequest =
  | { kind: "scope"; label: string; intent?: string; personaId?: string }
  | { kind: "metric"; label: string; metricKey: string; scopeType: string; scopeKey: string }
  | { kind: "responses"; label: string; responseIds: string[] }
  | { kind: "response"; label: string; responseId: string };

interface ResponseRow {
  id: string;
  providerId: string;
  generationMode: string;
  rawText: string;
  createdAt: string | Date;
  numeratorLabel?: string;
  denominatorLabel?: string;
}

/**
 * DB-2: two clicks to raw text from any figure. Callers open this with a
 * DrilldownRequest (click 1 already performed by the caller's own click);
 * selecting a row here is click 2. A `kind: "response"` request skips
 * straight to the detail view since the caller already identified the
 * single response (e.g. one misinformation register row).
 */
export function DrilldownPanel({
  projectId,
  runId,
  request,
  onClose,
}: {
  projectId: string;
  runId: string;
  request: DrilldownRequest;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [selected, setSelected] = useState<{
    response: ResponseRow;
    extraction: { state: string; extractedJson: unknown } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelected(null);
    setRows(null);
    setLoading(true);
    async function load() {
      if (request.kind === "response") {
        const detail = await fetchResponseDetail(projectId, runId, request.responseId);
        if (detail) {
          setSelected({
            response: detail.response as ResponseRow,
            extraction: detail.extraction as { state: string; extractedJson: unknown } | null,
          });
        }
        setLoading(false);
        return;
      }
      const list =
        request.kind === "scope"
          ? await fetchDrilldown(projectId, runId, { intent: request.intent, personaId: request.personaId })
          : request.kind === "metric"
            ? await fetchMetricDrilldown(projectId, runId, {
                metricKey: request.metricKey,
                scopeType: request.scopeType,
                scopeKey: request.scopeKey,
              })
          : await fetchResponsesByIds(projectId, runId, request.responseIds);
      setRows(list as ResponseRow[]);
      setLoading(false);
    }
    load();
  }, [projectId, runId, request]);

  async function selectResponse(row: ResponseRow) {
    const detail = await fetchResponseDetail(projectId, runId, row.id);
    setSelected({
      response: row,
      extraction: detail?.extraction as { state: string; extractedJson: unknown } | null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-paper p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="label-mono text-sm font-semibold">{request.label}</h3>
          <button type="button" onClick={onClose} className="label-mono text-xs text-ink/50 hover:text-ink">
            Close
          </button>
        </div>

        {loading && <p className="font-mono text-xs text-ink/45">Loading…</p>}

        {!loading && selected && (
          <div>
            {rows && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="label-mono mb-3 text-xs text-accent-ink hover:underline"
              >
                ← Back to list
              </button>
            )}
            <div className="mb-2 flex gap-2">
              <Stamp tone="ink">{selected.response.providerId}</Stamp>
              <Stamp tone="ink">{selected.response.generationMode}</Stamp>
              {selected.extraction && <Stamp tone={selected.extraction.state === "valid" ? "ok" : "warn"}>{selected.extraction.state}</Stamp>}
            </div>
            <p className="whitespace-pre-wrap rounded-lg border border-ink/15 bg-paper-2/40 p-3 text-sm text-ink/85">
              {selected.response.rawText}
            </p>
          </div>
        )}

        {!loading && !selected && rows && (
          <div className="flex flex-col gap-2">
            {rows.length === 0 && <p className="font-mono text-xs text-ink/45">No matching responses</p>}
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => selectResponse(row)}
                className="rounded-lg border border-ink/15 p-3 text-left text-sm transition-micro hover:border-ink/40"
              >
                <div className="mb-1 flex gap-2">
                  <Stamp tone="ink">{row.providerId}</Stamp>
                  <Stamp tone="ink">{row.generationMode}</Stamp>
                </div>
                {(row.numeratorLabel || row.denominatorLabel) && (
                  <div className="mb-2 flex flex-col gap-1 font-mono text-[11px] text-ink/50">
                    {row.numeratorLabel && <span>{row.numeratorLabel}</span>}
                    {row.denominatorLabel && <span>{row.denominatorLabel}</span>}
                  </div>
                )}
                <p className="line-clamp-2 text-ink/70">{row.rawText}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
