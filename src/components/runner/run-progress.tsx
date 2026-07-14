"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SimulatedBadge } from "@/components/simulated-badge";
import { Button, InlineStatus, Stamp } from "@/components/ui";
import { AppConfirmDialog } from "@/components/ui/dialog";
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
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [pollState, setPollState] = useState<"healthy" | "degraded">("healthy");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => new Date());
  const [suppressProgressMotion, setSuppressProgressMotion] = useState(false);
  const [terminalAnnouncement, setTerminalAnnouncement] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStateRef = useRef<"healthy" | "degraded">("healthy");
  const previousRunStateRef = useRef(initial.run.state);

  const pollNow = useCallback(async () => {
    try {
      const next = await fetchRunDetail(projectId, runId);
      if (next) {
        if (pollStateRef.current === "degraded") {
          setSuppressProgressMotion(true);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setSuppressProgressMotion(false)),
          );
        }
        setDetail(next as RunDetail);
        setLastUpdatedAt(new Date());
        pollStateRef.current = "healthy";
        setPollState("healthy");
      }
    } catch (err) {
      pollStateRef.current = "degraded";
      setPollState("degraded");
      reportError(err, { boundary: "run-progress-poll", projectId, runId });
    }
  }, [projectId, runId]);

  useEffect(() => {
    if (!TERMINAL_STATES.has(detail.run.state)) {
      timerRef.current = setInterval(() => void pollNow(), POLL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [detail.run.state, pollNow]);

  useEffect(() => {
    const previous = previousRunStateRef.current;
    if (TERMINAL_STATES.has(detail.run.state) && !TERMINAL_STATES.has(previous)) {
      setTerminalAnnouncement(`Run ${detail.run.state}.`);
    }
    previousRunStateRef.current = detail.run.state;
  }, [detail.run.state]);

  function run(key: string, action: () => Promise<unknown>, onSettled?: () => void) {
    setActionError(null);
    setActionKey(key);
    void (async () => {
      try {
        await action();
        const next = await fetchRunDetail(projectId, runId);
        if (next) setDetail(next as RunDetail);
      } catch (err) {
        // The mutation failed; the button re-enables (transition ends) and the
        // operator sees why, rather than a stuck spinner.
        reportError(err, { boundary: "run-progress-action", projectId, runId });
        setActionError("That action could not be completed. Check the worker and try again.");
      } finally {
        setActionKey(null);
        onSettled?.();
      }
    })();
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
            <div key={e.id} className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] gap-2 border-b border-ink/10 py-2">
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
              <span className="whitespace-pre-wrap break-words text-ink/80">{e.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {terminalAnnouncement}
      </p>
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
            className="interactive-press label-mono ml-auto inline-flex min-h-11 items-center rounded-full bg-accent px-4 py-2 text-xs text-ink transition-micro hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isResonance ? "Study results →" : "Evidence dashboard →"}
          </Link>
        )}
      </div>

      {detail.workerOffline && (
        <InlineStatus tone="warning" className="mb-4">
          <span>
            <span className="font-mono text-xs font-semibold">WORKER OFFLINE</span> — This run is
            queued but no worker is processing jobs. It will begin when processing resumes.
          </span>
        </InlineStatus>
      )}

      {pauseReason && (
        <InlineStatus tone="warning" className="mb-4">
          {pauseReason}
        </InlineStatus>
      )}

      {pollState === "degraded" && (
        <InlineStatus tone="warning" className="mb-4">
          <span>
            Live updates are degraded. Showing last-known data from{" "}
            <span className="font-mono tabular-nums">
              {lastUpdatedAt.toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            .
          </span>{" "}
          <button
            type="button"
            className="ml-1 rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => void pollNow()}
          >
            Retry now
          </button>
        </InlineStatus>
      )}

      <div className="mb-6 rounded-xl border border-ink/15 p-4">
        <div className="mb-2 flex items-center justify-between font-mono text-sm">
          <span>
            {finished} / {total} jobs
          </span>
          <span>{pct}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-paper-2"
          role="progressbar"
          aria-label="Run progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={finished}
          aria-valuetext={`${finished} of ${total} jobs complete`}
        >
          <div
            className={`h-full bg-accent ${suppressProgressMotion ? "" : "transition-standard"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs text-ink/60 sm:grid-cols-4">
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
            pending={actionKey === "pause"}
            pendingLabel="Pausing…"
            onClick={() => run("pause", () => pauseRun(projectId, runId))}
          >
            Pause
          </Button>
        )}
        {detail.run.state === "paused" && (
          <Button
            pending={actionKey === "resume"}
            pendingLabel="Resuming…"
            onClick={() => run("resume", () => resumeRun(projectId, runId))}
          >
            Resume
          </Button>
        )}
        {!TERMINAL_STATES.has(detail.run.state) && (
          <Button
            variant="danger"
            pending={actionKey === "cancel"}
            pendingLabel="Cancelling…"
            onClick={() => setCancelOpen(true)}
          >
            Cancel
          </Button>
        )}
      </div>

      {actionError && (
        <InlineStatus tone="danger" className="mb-6">
          {actionError}
        </InlineStatus>
      )}

      <AppConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel active run?"
        description="Queued jobs will be cancelled and no new work will start. Completed responses and incurred cost remain part of this run’s record."
        confirmLabel="Cancel run"
        pending={actionKey === "cancel"}
        onConfirm={() =>
          run("cancel", () => cancelRun(projectId, runId), () => setCancelOpen(false))
        }
      />
    </div>
  );
}
