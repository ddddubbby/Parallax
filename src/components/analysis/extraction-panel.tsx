"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { PageLoading } from "@/components/page-loading";
import {
  formatGatedMetricDisplay,
  type MetricRow,
} from "@/components/dashboard/format";
import { Button, InlineStatus, Stamp } from "@/components/ui";
import { PILLARS, resolveGlossary, type Pillar } from "@/core/semantic";
import { fetchExtractionAndMetrics, reExtractForRun } from "@/modules/extraction/actions";
import { recomputeMetrics } from "@/modules/analysis/actions";
import { reportError } from "@/observability";

const POLL_MS = 2000;
const EXTRACTION_STATES = ["pending", "retrying", "valid", "dead_lettered", "qa_reviewed"];
const PILLAR_ORDER: Pillar[] = ["presence", "position", "perception", "proof"];

type DeadLetterRow = {
  id: string;
  responseId: string;
  extractionVersion: number;
  validationError: string | null;
  updatedAt: Date;
  providerId: string;
};

export function ExtractionPanel({
  projectId,
  runId,
  terminal,
  panel = "both",
}: {
  projectId: string;
  runId: string;
  terminal: boolean;
  /** M32 / D-088: run detail views render extraction or metrics alone. */
  panel?: "extraction" | "metrics" | "both";
}) {
  const [data, setData] = useState<{
    progress: Record<string, number>;
    metrics: MetricRow[];
    plannedResponses: number;
    deadLetters: DeadLetterRow[];
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [pollDegraded, setPollDegraded] = useState(false);
  const [recomputePending, startRecompute] = useTransition();
  const [reExtractPending, startReExtract] = useTransition();
  const [reExtractingId, setReExtractingId] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const next = await fetchExtractionAndMetrics(projectId, runId);
      setData(next);
      setPollDegraded(false);
    } catch (err) {
      setPollDegraded(true);
      reportError(err, { boundary: "extraction-panel-poll", projectId, runId });
    }
  }, [projectId, runId]);

  useEffect(() => {
    void poll();
    if (terminal) return;
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll, terminal]);

  if (!data && !pollDegraded) return <PageLoading label="Loading extraction and metric records" />;
  if (!data) {
    return (
      <InlineStatus tone="warning">
        Extraction and metric records are unavailable.{" "}
        <button
          type="button"
          className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => void poll()}
        >
          Retry
        </button>
      </InlineStatus>
    );
  }

  const overallMetrics = data.metrics.filter((m) => m.scopeType === "overall");
  const metricsByPillar = PILLAR_ORDER.map((pillar) => ({
    pillar,
    metrics: overallMetrics.filter((m) => resolveGlossary(m.metricKey).pillar === pillar),
  })).filter((group) => group.metrics.length > 0);
  const extracted = (data.progress.valid ?? 0) + (data.progress.qa_reviewed ?? 0);
  const deadLettered = data.progress.dead_lettered ?? 0;

  const showExtraction = panel === "extraction" || panel === "both";
  const showMetrics = panel === "metrics" || panel === "both";

  return (
    <div className={panel === "both" ? "mt-8" : undefined}>
      {pollDegraded && (
        <InlineStatus tone="warning" className="mb-4">
          Live updates are degraded. Last-known extraction and metric data remains visible.{" "}
          <button
            type="button"
            className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => void poll()}
          >
            Retry now
          </button>
        </InlineStatus>
      )}
      {showExtraction && (
        <>
          <div className="mb-3 flex items-center gap-3">
            <h2 className="label-mono text-xs font-medium text-ink/60">Extraction & scoring</h2>
            {deadLettered > 0 && <Stamp tone="danger">{deadLettered} dead-lettered</Stamp>}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 font-mono text-xs text-ink/60 sm:grid-cols-3 lg:grid-cols-5">
            {EXTRACTION_STATES.map((s) => (
              <div key={s}>
                {s}: {data.progress[s] ?? 0}
              </div>
            ))}
          </div>
          {(data.deadLetters?.length ?? 0) > 0 && (
            <div className="mb-6 rounded-xl border border-danger/25 p-4">
              <p className="label-mono mb-1 text-xs text-ink/60">Dead-lettered responses</p>
              <p className="mb-3 text-sm text-ink/65">
                Re-extraction creates a new extraction version (C-3) and may incur provider cost on
                live runs.
              </p>
              <ul className="flex flex-col gap-2">
                {data.deadLetters.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 font-mono text-xs text-ink/70">
                      <span className="text-ink/85">{row.providerId}</span>
                      <span className="mx-2 text-ink/35">·</span>
                      <span>v{row.extractionVersion}</span>
                      {row.validationError ? (
                        <p className="mt-1 truncate font-sans text-ink/55" title={row.validationError}>
                          {row.validationError}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      pending={reExtractPending && reExtractingId === row.responseId}
                      pendingLabel="Re-extracting…"
                      disabled={
                        recomputePending ||
                        (reExtractPending && reExtractingId !== row.responseId)
                      }
                      onClick={() => {
                        setActionError(null);
                        setActionSuccess(null);
                        setReExtractingId(row.responseId);
                        startReExtract(async () => {
                          try {
                            const result = await reExtractForRun(
                              projectId,
                              runId,
                              row.responseId,
                            );
                            if (!result.ok) {
                              setActionError(result.error);
                            } else {
                              setActionSuccess("Re-extraction completed as a new version.");
                              const next = await fetchExtractionAndMetrics(projectId, runId);
                              if (next) setData(next);
                            }
                          } catch (err) {
                            reportError(err, {
                              boundary: "extraction-panel-reextract",
                              projectId,
                              runId,
                              responseId: row.responseId,
                            });
                            setActionError(
                              "Re-extraction failed — the existing extraction is unchanged. Try again.",
                            );
                          } finally {
                            setReExtractingId(null);
                          }
                        });
                      }}
                    >
                      Re-extract
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {showMetrics && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label-mono text-xs font-medium text-ink/60">
              Metrics preview <span className="text-ink/40">(overall scope)</span>
            </h2>
            <Button
              variant="secondary"
              disabled={extracted === 0 || reExtractPending}
              pending={recomputePending}
              pendingLabel="Recomputing…"
              onClick={() => {
                setActionError(null);
                setActionSuccess(null);
                startRecompute(async () => {
                  try {
                    await recomputeMetrics(projectId, runId);
                    const next = await fetchExtractionAndMetrics(projectId, runId);
                    setData(next);
                    setActionSuccess("Metrics recomputed from the current valid extractions.");
                  } catch (err) {
                    reportError(err, { boundary: "extraction-panel-recompute", projectId, runId });
                    setActionError(
                      "Recompute failed — the existing metrics are unchanged. Try again.",
                    );
                  }
                });
              }}
            >
              Recompute metrics
            </Button>
          </div>
          {actionError && (
            <InlineStatus tone="danger" className="mb-3">
              {actionError}
            </InlineStatus>
          )}
          {actionSuccess && (
            <InlineStatus tone="success" className="mb-3">
              {actionSuccess}
            </InlineStatus>
          )}
          {overallMetrics.length === 0 ? (
            <p className="font-mono text-xs text-ink/45">No metrics computed yet</p>
          ) : (
            <div className="flex flex-col gap-4">
              {metricsByPillar.map(({ pillar, metrics }) => (
                <section key={pillar} className="rounded-xl border border-ink/15 p-3">
                  <div className="mb-2">
                    <h3 className="label-mono text-xs text-ink/70">{PILLARS[pillar].label}</h3>
                    <p className="font-mono text-[11px] text-ink/45">
                      {PILLARS[pillar].clientQuestion}
                    </p>
                  </div>
                  <div
                    className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    role="region"
                    aria-label={`${PILLARS[pillar].label} metrics table`}
                    tabIndex={0}
                  >
                  <table className="w-full min-w-[36rem] border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-ink/20 text-left text-ink/50">
                        <th className="py-1.5 pr-4">Metric</th>
                        <th className="py-1.5 pr-4">Meaning</th>
                        <th className="py-1.5 pr-4">n</th>
                        <th className="py-1.5 pr-4">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => {
                        const glossary = resolveGlossary(m.metricKey);
                        const display = formatGatedMetricDisplay(m);
                        return (
                          <tr key={m.id} className="border-b border-ink/10">
                            <td className="py-1.5 pr-4 text-ink/80">{glossary.label}</td>
                            <td className="py-1.5 pr-4 font-sans text-ink/60">{glossary.definition}</td>
                            <td className="py-1.5 pr-4 text-ink/50">{m.n}</td>
                            <td className="py-1.5 pr-4">
                              {display.kind === "insufficient" ? (
                                <Stamp tone="warn">Insufficient data</Stamp>
                              ) : (
                                <span className="tabular-nums">
                                  {display.value}
                                  {display.ci ? ` ${display.ci}` : ""}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
