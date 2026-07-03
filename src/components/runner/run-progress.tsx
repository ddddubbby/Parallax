"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Stamp } from "@/components/ui";
import { cancelRun, fetchRunDetail, pauseRun, resumeRun } from "@/modules/runner/actions";

const POLL_MS = 1500;
const JOB_STATES = ["queued", "running", "succeeded", "retryable_failed", "dead_lettered", "cancelled", "skipped"];

interface RunDetail {
  run: {
    id: string;
    projectId: string;
    runMode: string;
    state: string;
    plannedCalls: number;
    costCapUsd: string;
    actualCostUsd: string;
  };
  progress: Record<string, number>;
  failureCounts: { succeeded: number; deadLettered: number; cancelled: number };
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
}: {
  projectId: string;
  runId: string;
  initial: RunDetail;
}) {
  const [detail, setDetail] = useState<RunDetail>(initial);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function poll() {
      fetchRunDetail(runId).then((next) => {
        if (next) setDetail(next as RunDetail);
      });
    }
    if (!TERMINAL_STATES.has(detail.run.state)) {
      timerRef.current = setInterval(poll, POLL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [runId, detail.run.state]);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      const next = await fetchRunDetail(runId);
      if (next) setDetail(next as RunDetail);
    });
  }

  const total = detail.run.plannedCalls;
  const finished = (detail.progress.succeeded ?? 0) + (detail.progress.dead_lettered ?? 0) + (detail.progress.cancelled ?? 0) + (detail.progress.skipped ?? 0);
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  const isPartial = detail.failureCounts.deadLettered > 0 || detail.failureCounts.cancelled > 0;
  // A bare "paused" stamp with no reason is an anxiety generator — the
  // breaker's own event message says exactly why (cost cap, failure rate,
  // daily budget) and is already in the fetched events. Surface it.
  const pauseReason =
    detail.run.state === "paused"
      ? detail.events.find((e) => e.eventType === "circuit_breaker_paused")?.message ?? null
      : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Run</h1>
        {detail.run.runMode === "mock" && <Stamp tone="accent">MOCK</Stamp>}
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
            href={`/projects/${projectId}/dashboard`}
            className="label-mono ml-auto rounded-full bg-accent px-4 py-1.5 text-xs text-paper transition-micro hover:bg-accent/90"
          >
            View dashboard →
          </Link>
        )}
      </div>

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
          <div
            className="h-full bg-accent transition-standard"
            style={{ width: `${pct}%` }}
          />
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
            cost ${Number(detail.run.actualCostUsd).toFixed(4)} / ${Number(detail.run.costCapUsd).toFixed(2)} cap
          </span>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {(detail.run.state === "queued" || detail.run.state === "running") && (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => pauseRun(projectId, runId))}>
            Pause
          </Button>
        )}
        {detail.run.state === "paused" && (
          <Button disabled={pending} onClick={() => run(() => resumeRun(projectId, runId))}>
            Resume
          </Button>
        )}
        {!TERMINAL_STATES.has(detail.run.state) && (
          <Button variant="danger" disabled={pending} onClick={() => run(() => cancelRun(projectId, runId))}>
            Cancel
          </Button>
        )}
      </div>

      <h2 className="label-mono mb-2 text-xs font-medium text-ink/60">Recent events</h2>
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
