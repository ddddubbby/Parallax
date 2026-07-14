"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, InlineStatus, Stamp } from "@/components/ui";
import { PageLoading } from "@/components/page-loading";
import { fetchDrilldown, fetchMetricDrilldown, fetchResponseDetail, fetchResponsesByIds } from "@/modules/dashboard/actions";
import { reportError } from "@/observability";

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
  open,
  onClose,
}: {
  projectId: string;
  runId: string;
  request: DrilldownRequest;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ResponseRow[] | null>(null);
  const [selected, setSelected] = useState<{
    response: ResponseRow;
    extraction: { state: string; extractedJson: unknown } | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setRows(null);
    setLoading(true);
    setFailed(false);
    async function load() {
      if (request.kind === "response") {
        const detail = await fetchResponseDetail(projectId, runId, request.responseId);
        if (cancelled) return;
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
      if (cancelled) return;
      setRows(list as ResponseRow[]);
      setLoading(false);
    }
    load().catch((err) => {
      if (cancelled) return;
      reportError(err, { boundary: "drilldown-load", projectId, runId });
      setFailed(true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, runId, request, reloadNonce]);

  async function selectResponse(row: ResponseRow) {
    setDetailLoading(true);
    setFailed(false);
    try {
      const detail = await fetchResponseDetail(projectId, runId, row.id);
      setSelected({
        response: row,
        extraction: detail?.extraction as { state: string; extractedJson: unknown } | null,
      });
    } catch (err) {
      reportError(err, { boundary: "drilldown-select", projectId, runId });
      setFailed(true);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="app-dialog-overlay fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content
          className="evidence-sheet fixed inset-y-0 right-0 z-50 flex h-full w-[min(100%,34rem)] flex-col overflow-y-auto border-l border-ink/15 bg-paper p-4 shadow-lg focus:outline-none sm:p-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-ink/10 pb-4">
            <div className="min-w-0">
              <Dialog.Title className="label-mono text-sm font-semibold text-ink">
                {request.label}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-ink/65">
                Raw sampled answers and their extraction state for run {runId.slice(0, 8)}.
              </Dialog.Description>
            </div>
            <Dialog.Close className="interactive-press -m-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ink/65 transition-micro hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Close evidence">
              <X className="h-4 w-4" aria-hidden />
            </Dialog.Close>
          </div>

          {loading && <PageLoading label="Loading raw evidence" />}

          {!loading && failed && (
            <div className="flex flex-col items-start gap-3">
              <InlineStatus tone="danger">
                This evidence could not be loaded. Your dashboard context remains unchanged.
              </InlineStatus>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => setReloadNonce((n) => n + 1)}>
                  Retry
                </Button>
                <Dialog.Close asChild>
                  <Button type="button" variant="secondary">Close</Button>
                </Dialog.Close>
              </div>
            </div>
          )}

          {!loading && !failed && selected && (
            <div>
              {rows && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mb-3 -ml-3 px-3"
                  onClick={() => setSelected(null)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to evidence list
                </Button>
              )}
              <div className="mb-2 flex flex-wrap gap-2">
                <Stamp tone="ink">{selected.response.providerId}</Stamp>
                <Stamp tone="ink">{selected.response.generationMode}</Stamp>
                {selected.extraction && <Stamp tone={selected.extraction.state === "valid" ? "ok" : "warn"}>{selected.extraction.state}</Stamp>}
              </div>
              <p className="whitespace-pre-wrap break-words rounded-lg border border-ink/15 bg-paper-2/40 p-3 text-sm leading-relaxed text-ink/85">
                {selected.response.rawText}
              </p>
            </div>
          )}

          {!loading && !selected && rows && (
            <div className="flex flex-col gap-2" aria-busy={detailLoading || undefined}>
              {detailLoading && <InlineStatus>Loading the selected raw answer…</InlineStatus>}
              {rows.length === 0 && (
                <p className="rounded-lg border border-ink/15 p-4 text-sm text-ink/65">
                  No sampled answers match this figure.
                </p>
              )}
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={detailLoading}
                  onClick={() => selectResponse(row)}
                  className="rounded-lg border border-ink/15 p-3 text-left text-sm transition-micro hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50"
                >
                  <div className="mb-1 flex flex-wrap gap-2">
                    <Stamp tone="ink">{row.providerId}</Stamp>
                    <Stamp tone="ink">{row.generationMode}</Stamp>
                  </div>
                  {(row.numeratorLabel || row.denominatorLabel) && (
                    <div className="mb-2 flex flex-col gap-1 font-mono text-[11px] text-ink/65">
                      {row.numeratorLabel && <span>{row.numeratorLabel}</span>}
                      {row.denominatorLabel && <span>{row.denominatorLabel}</span>}
                    </div>
                  )}
                  <p className="line-clamp-2 break-words leading-relaxed text-ink/70">{row.rawText}</p>
                </button>
              ))}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
