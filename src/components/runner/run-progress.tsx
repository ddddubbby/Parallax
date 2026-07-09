"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Button, Stamp } from "@/components/ui";
import type { RunDetailView } from "@/core/views";
import { resolvePauseReason } from "@/core/runner";
import { cancelRun, fetchRunDetail, pauseRun, resumeRun } from "@/modules/runner/actions";
import { reportError } from "@/observability";

const POLL_MS = 1500;
const JOB_STATES = [
  "queued",
  "running",
  "succeeded",
  "retryable_failed",
  "dead_lettered",
  "cancelled",
  "skipped",
];

interface RunDetail {
  run: {
    id: string;
    projectId: string;
    runMode: string;
    state: string;
    plannedCalls: number;
    costCapUsd: string;
    actualCostUsd: string;
    matrixKind?: "audit" | "resonance";
    resonanceStudyId?: string | null;
  };
  progress: Record<string, number>;
  failureCounts: { succeeded: number; deadLettered: number; cancelled: number };
  workerOffline?: boolean;
  events: Array<{
    id: string;
    level: string;
    eventType: string;
    message: string;
    createdAt: string | Date;
  }>;
}

const TERMINAL_STATES = new Set(["completed", "failed", "cancelled"]);

export function RunProgress({
  projectId,
  runId,
  initial,
  view = "overview",
}: {
  projectId: string;
  runId: string;
  initial: RunDetail;
  /** M32 / D-088: overview = state/cost/controls; events = log only. */
  view?: Extract<RunDetailView, "overview" | "events">;
}) {
  const [detail, setDetail] = useState<RunDetail>(initial);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function poll() {
      fetchRunDetail(projectId, runId)
        .then((next) => {
          if (next) setDetail(next as RunDetail);
        })
        // A transient poll failure must not blank the page or stop the loop:
        // keep the last known detail and try again on the next tick.
        .catch((err) => reportError(err, { boundary: "run-progress-poll", projectId, runId }));
    }
    if (!TERMINAL_STATES.has(detail.run.state)) {
      timerRef.current = setInterval(poll, POLL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [projectId, runId, detail.run.state]);

  function run(action: () => Promise<unknown>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await action();
        const next = await fetchRunDetail(projectId, runId);
        if (next) setDetail(next as RunDetail);
      } catch (err) {
        // The mutation failed; the button re-enables (transition ends) and the
        // operator sees why, rather than a stuck spinner.
        reportError(err, { boundary: "run-progress-action", projectId, runId });
        setActionError("That action could not be completed. Check the worker and try again.");
      }
    });
  }

  const total = detail.run.plannedCalls;
  const finished =
    (detail.progress.succeeded ?? 0) +
    (detail.progress.dead_lettered ?? 0) +
    (detail.progress.cancelled ?? 0) +
    (detail.progress.skipped ?? 0);
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  const isPartial = detail.failureCounts.deadLettered > 0 || detail.failureCounts.cancelled > 0;
  const isResonance = detail.run.matrixKind === "resonance";
  // A bare "paused" stamp with no reason is an anxiety generator; the
  // priority logic (automated event > operator_paused > neutral fallback)
  // lives in core/runner.ts so it's covered by a pure unit test.
  const pauseReason = resolvePauseReason(detail.run.state, detail.events);

  const resultsHref = isResonance
    ? detail.run.resonanceStudyId
      ? `/projects/${projectId}/resonance/${detail.run.resonanceStudyId}?view=results`
      : `/projects/${projectId}/resonance`
    : `/projects/${projectId}/dashboard`;

  if (view === "events") {
    return (
      <div>
        <h2 className="label-mono mb-3 text-xs font-medium text-ink/60">Event log</h2>
        <div className="flex flex-col gap-1 font-mono text-xs">
          {detail.events.length === 0 && <p className="text-ink/45">No events yet</p>}
          {detail.events.map((e) => (
            <div key={e.id} className="flex gap-2 border-b border-ink/10 py-1">
              <span className="text-ink/40">
                {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
              <span
                className={
                  e.level === "error"
                    ? "text-danger"
                    : e.level === "warn"
                      ? "text-warn"
                      : "text-ink/50"
                }
              >
                {e.level}
              </span>
              <span className="text-ink/80">{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Run</h1>
        {detail.run.runMode === "mock" && <Stamp tone="accent">MOCK</Stamp>}
        {isResonance && <SimulatedBadge />}
        {detail.run.runMode === "live_validation" && <Stamp tone="warn">VALIDATION-ONLY</Stamp>}
        <Stamp
          tone={
            detail.run.state === "completed"
              ? "ok"
              : detail.run.state === "failed" || detail.run.state === "cancelled"
                ? "danger"
                : detail.run.state === "paused"
                  ? "warn"
                  : "ink"
          }
        >
          {detail.run.state}
        </Stamp>
        {isPartial && <Stamp tone="warn">PARTIAL</Stamp>}
        {detail.run.state === "completed" && (
          <Link
            href={resultsHref}
            className="label-mono ml-auto rounded-full bg-accent px-4 py-1.5 text-xs text-paper transition-micro hover:bg-accent/90"
          >
            {isResonance ? "Study results →" : "Evidence dashboard →"}
          </Link>
        )}
      </div>

      {detail.workerOffline && (
        <p className="mb-4 rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">
          WORKER OFFLINE — this run is queued but no worker is processing jobs. Start it with{" "}
          <code className="font-semibold">pnpm dev:all</code> (app + worker) or run{" "}
          <code className="font-semibold">pnpm worker</code> in a second terminal. This clears once
          the worker sends a heartbeat.
        </p>
      )}

      {pauseReason && (
        <p className="mb-4 rounded-lg border border-warn px-3 py-2 font-mono text-xs text-warn">
          {pauseReason}
        </p>
      )}

      <div className="mb-6 rounded-xl border border-ink/15 p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-sm">
          <span>
            {finished} / {total} jobs
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
          <div className="h-full bg-accent transition-standard" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 font-mono text-xs text-ink/60">
          {JOB_STATES.map((s) => (
            <div key={s}>
              {s}: {detail.progress[s] ?? 0}
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-xs text-ink/60">
          <span>
            cost ${Number(detail.run.actualCostUsd).toFixed(4)} / $
            {Number(detail.run.costCapUsd).toFixed(2)} cap
          </span>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {(detail.run.state === "queued" || detail.run.state === "running") && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => pauseRun(projectId, runId))}
          >
            Pause
          </Button>
        )}
        {detail.run.state === "paused" && (
          <Button disabled={pending} onClick={() => run(() => resumeRun(projectId, runId))}>
            Resume
          </Button>
        )}
        {!TERMINAL_STATES.has(detail.run.state) && (
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => run(() => cancelRun(projectId, runId))}
          >
            Cancel
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mb-6 rounded-lg border border-danger px-3 py-2 font-mono text-xs text-danger">
          {actionError}
        </p>
      )}
    </div>
  );
}
