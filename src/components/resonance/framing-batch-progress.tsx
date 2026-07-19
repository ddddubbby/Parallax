"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatApproxRemaining,
  isFramingBatchTerminal,
  type FramingObservationBatchProgress,
} from "@/core/framing-batch";
import { Button, InlineStatus } from "@/components/ui";
import {
  fetchFramingBatchProgressAction,
  resumeFramingBatchAction,
} from "@/modules/resonance/actions";
import { reportError } from "@/observability";

const POLL_MS = 1500;
const RING_SIZE = 56;
const RING_STROKE = 5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function stateLabel(progress: FramingObservationBatchProgress): string {
  if (progress.workerOffline && (progress.state === "queued" || progress.state === "running")) {
    return "Worker offline — progress will resume when the worker is running";
  }
  switch (progress.state) {
    case "queued":
      return "Queued — waiting for the worker";
    case "running":
      return "Extracting framing observations";
    case "paused":
      return progress.pausedReason ?? "Paused";
    case "completed":
      return "Framing extraction complete";
    case "partial":
      return "Framing extraction finished with some failures";
    case "failed":
      return progress.error ?? "Framing extraction failed";
    default:
      return progress.state;
  }
}

export function FramingBatchProgress({
  projectId,
  studyId,
  initial,
  onTerminal,
}: {
  projectId: string;
  studyId: string;
  initial: FramingObservationBatchProgress;
  onTerminal?: (progress: FramingObservationBatchProgress) => void;
}) {
  const [progress, setProgress] = useState(initial);
  const [pollState, setPollState] = useState<"healthy" | "degraded">("healthy");
  const [suppressMotion, setSuppressMotion] = useState(false);
  const [resumePending, setResumePending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const terminalNotified = useRef(isFramingBatchTerminal(initial.state));
  const pollStateRef = useRef<"healthy" | "degraded">("healthy");

  const pct =
    progress.totalCount > 0
      ? Math.min(100, Math.round((progress.processedCount / progress.totalCount) * 100))
      : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
  const remainingLabel = formatApproxRemaining(progress.approxRemainingSeconds);

  const pollNow = useCallback(async () => {
    try {
      const next = await fetchFramingBatchProgressAction(projectId, progress.batchId);
      if (next) {
        if (pollStateRef.current === "degraded") {
          setSuppressMotion(true);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setSuppressMotion(false)),
          );
        }
        setProgress(next);
        pollStateRef.current = "healthy";
        setPollState("healthy");
        if (isFramingBatchTerminal(next.state) && !terminalNotified.current) {
          terminalNotified.current = true;
          onTerminal?.(next);
        }
      }
    } catch (err) {
      pollStateRef.current = "degraded";
      setPollState("degraded");
      reportError(err, {
        boundary: "framing-batch-progress-poll",
        projectId,
        batchId: progress.batchId,
      });
    }
  }, [projectId, progress.batchId, onTerminal]);

  useEffect(() => {
    if (!isFramingBatchTerminal(progress.state)) {
      timerRef.current = setInterval(() => void pollNow(), POLL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [progress.state, pollNow]);

  async function onResume() {
    setResumePending(true);
    setActionError(null);
    const res = await resumeFramingBatchAction(projectId, progress.batchId, studyId);
    setResumePending(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    terminalNotified.current = false;
    await pollNow();
  }

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-sm border border-rule/80 bg-paper px-3 py-3"
      aria-live="polite"
    >
      <svg
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.totalCount}
        aria-valuenow={progress.processedCount}
        aria-label={`Framing extraction ${progress.processedCount} of ${progress.totalCount}`}
        className="shrink-0"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          className="text-ink/15"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          strokeLinecap="square"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          className={`text-accent ${suppressMotion ? "" : "transition-standard"}`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-ink font-mono text-[11px]"
        >
          {pct}%
        </text>
      </svg>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-mono text-[12px] text-ink">{stateLabel(progress)}</p>
        <p className="font-mono text-[11px] text-ink/65">
          {progress.processedCount}/{progress.totalCount} processed
          {" · "}
          {progress.validCount} valid
          {" · "}
          {progress.failedCount} failed
          {remainingLabel ? ` · ${remainingLabel}` : ""}
        </p>
        {pollState === "degraded" && (
          <p className="font-mono text-[11px] text-ink/55">
            Connection degraded — showing last known progress
          </p>
        )}
        {actionError && (
          <InlineStatus tone="danger" className="mt-1">
            {actionError}
          </InlineStatus>
        )}
      </div>

      {progress.state === "paused" && (
        <Button
          type="button"
          variant="secondary"
          pending={resumePending}
          pendingLabel="Resuming"
          onClick={() => void onResume()}
        >
          Resume
        </Button>
      )}
    </div>
  );
}
