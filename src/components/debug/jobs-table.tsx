"use client";

import { useState, useTransition } from "react";
import { Button, InlineStatus, Stamp } from "@/components/ui";
import { requeueJob } from "@/modules/runner/actions";

interface JobRow {
  id: string;
  runId: string;
  cellId: string;
  providerId: string;
  generationMode: string;
  repIndex: number;
  state: string;
  attemptCount: number;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  updatedAt: string | Date;
}

interface EventRow {
  id: string;
  runId: string;
  jobId: string | null;
  level: string;
  eventType: string;
  message: string;
  createdAt: string | Date;
}

function stateTone(state: string) {
  if (state === "dead_lettered") return "danger" as const;
  if (state === "retryable_failed") return "warn" as const;
  if (state === "skipped") return "ink" as const;
  return "ok" as const;
}

export function DebugJobsTable({ jobs, events }: { jobs: JobRow[]; events: EventRow[] }) {
  const [pending, startTransition] = useTransition();
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{
    jobId: string;
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  function onRequeue(job: JobRow) {
    setActionKey(job.id);
    setActionStatus(null);
    startTransition(async () => {
      const result = await requeueJob(job.runId, job.id).catch(() => ({
        ok: false as const,
        error: "Requeue did not complete. Retry.",
      }));
      setActionKey(null);
      setActionStatus({
        jobId: job.id,
        tone: result.ok ? "success" : "danger",
        message: result.ok ? `Job ${job.id.slice(0, 8)} requeued.` : result.error,
      });
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
          Jobs (running / retryable / dead-lettered / skipped) · {jobs.length}
        </h2>
        {actionStatus && (
          <InlineStatus
            tone={actionStatus.tone}
            className="mb-3 border-paper/20 bg-paper/[0.06] text-paper"
          >
            {actionStatus.message}
          </InlineStatus>
        )}
        <div
          role="region"
          aria-label="Debug jobs table"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-paper/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
        <table className="w-full min-w-[46rem] border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-paper/20 text-left text-paper/50">
              <th className="py-1.5 pr-3">State</th>
              <th className="py-1.5 pr-3">Provider</th>
              <th className="py-1.5 pr-3">Mode</th>
              <th className="py-1.5 pr-3">Rep</th>
              <th className="py-1.5 pr-3">Attempts</th>
              <th className="py-1.5 pr-3">Last error</th>
              <th className="py-1.5 pr-3" />
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-paper/55">
                  No jobs in a working state
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-paper/10 align-top">
                <td className="py-1.5 pr-3">
                  <span className="[&>span]:text-paper">
                    <Stamp tone={stateTone(job.state)}>{job.state}</Stamp>
                  </span>
                </td>
                <td className="py-1.5 pr-3">{job.providerId}</td>
                <td className="py-1.5 pr-3">{job.generationMode}</td>
                <td className="py-1.5 pr-3">{job.repIndex}</td>
                <td className="py-1.5 pr-3">{job.attemptCount}</td>
                <td className="max-w-80 break-words py-1.5 pr-3 text-paper/70">
                  {job.lastErrorType ? `${job.lastErrorType}: ${job.lastErrorMessage ?? ""}` : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {(job.state === "dead_lettered" || job.state === "retryable_failed") && (
                    <Button
                      type="button"
                      variant="ghost"
                      pending={pending && actionKey === job.id}
                      pendingLabel="Requeueing…"
                      onClick={() => onRequeue(job)}
                      className="min-h-11 px-3 text-accent hover:text-accent"
                    >
                      Requeue
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </section>

      <section>
        <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
          run_events tail · {events.length}
        </h2>
        <div
          role="region"
          aria-label="Run events tail"
          tabIndex={0}
          className="max-h-[28rem] overflow-auto rounded-lg border border-paper/15 px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {events.length === 0 && (
            <p className="py-2 text-paper/50">No recent run events</p>
          )}
          {events.map((e) => (
            <div key={e.id} className="grid gap-x-2 border-b border-paper/10 py-2 sm:grid-cols-[5rem_3rem_minmax(7rem,auto)_minmax(0,1fr)]">
              <span className="text-paper/55">
                {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
              <span
                className="text-paper/80"
              >
                {e.level}
              </span>
              <span className="break-words text-paper/55">{e.eventType}</span>
              <span className="min-w-0 break-words text-paper/85">{e.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
