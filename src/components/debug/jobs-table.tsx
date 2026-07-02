"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Stamp } from "@/components/ui";
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRequeue(job: JobRow) {
    startTransition(async () => {
      await requeueJob(job.runId, job.id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
          Jobs (running / retryable / dead-lettered / skipped) · {jobs.length}
        </h2>
        <table className="w-full border-collapse font-mono text-xs">
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
                <td colSpan={7} className="py-4 text-paper/40">
                  No jobs in a working state
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-paper/10">
                <td className="py-1.5 pr-3">
                  <Stamp tone={stateTone(job.state)}>{job.state}</Stamp>
                </td>
                <td className="py-1.5 pr-3">{job.providerId}</td>
                <td className="py-1.5 pr-3">{job.generationMode}</td>
                <td className="py-1.5 pr-3">{job.repIndex}</td>
                <td className="py-1.5 pr-3">{job.attemptCount}</td>
                <td className="py-1.5 pr-3 text-paper/70">
                  {job.lastErrorType ? `${job.lastErrorType}: ${job.lastErrorMessage ?? ""}` : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {(job.state === "dead_lettered" || job.state === "retryable_failed") && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => onRequeue(job)}
                      className="label-mono cursor-pointer text-accent hover:underline"
                    >
                      Requeue
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="label-mono mb-2 text-xs font-medium text-paper/60">
          run_events tail · {events.length}
        </h2>
        <div className="flex flex-col gap-1 font-mono text-xs">
          {events.map((e) => (
            <div key={e.id} className="flex gap-2 border-b border-paper/10 py-1">
              <span className="text-paper/40">
                {new Date(e.createdAt).toLocaleTimeString("en-GB", { hour12: false })}
              </span>
              <span
                className={
                  e.level === "error"
                    ? "text-danger"
                    : e.level === "warn"
                      ? "text-warn"
                      : "text-paper/50"
                }
              >
                {e.level}
              </span>
              <span className="text-paper/40">{e.eventType}</span>
              <span className="text-paper/85">{e.message}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
