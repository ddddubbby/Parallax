"use client";

import type { ReactNode } from "react";
import {
  collectingStatusLine,
  formatElapsedShort,
  formatTookShort,
  type LiveActivity,
} from "@/core/run-live-activity";

function Lane({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasRows = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div>
      <h3 className="label-mono mb-2 text-xs font-medium text-ink/55">{title}</h3>
      {hasRows ? (
        <ul className="flex flex-col gap-2">{children}</ul>
      ) : (
        <p className="font-mono text-xs text-ink/40">{empty}</p>
      )}
    </div>
  );
}

function WorkRow({
  meta,
  body,
  pulse,
}: {
  meta: string;
  body: string;
  pulse?: boolean;
}) {
  return (
    <li
      className={`rounded-lg border border-ink/10 bg-paper-2/40 px-3 py-2 ${
        pulse ? "animate-pulse" : ""
      }`}
    >
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink/45">
        {meta}
      </p>
      <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink/85">
        {body}
      </p>
    </li>
  );
}

export function CollectingResponses({
  runState,
  matrixKind = "audit",
  workerOffline,
  liveActivity,
  suppressMotion,
  now,
}: {
  runState: string;
  matrixKind?: "audit" | "resonance";
  workerOffline?: boolean;
  liveActivity?: LiveActivity | null;
  suppressMotion?: boolean;
  now?: Date;
}) {
  const activity: LiveActivity = liveActivity ?? {
    asking: [],
    answered: [],
    secondary: [],
    showSecondary: true,
  };
  const clock = now ?? new Date();
  const secondaryPendingCount = activity.secondary.filter((row) => row.kind === "pending").length;
  const status = collectingStatusLine({
    runState,
    workerOffline,
    askingCount: activity.asking.length,
    answeredCount: activity.answered.length,
    secondaryPendingCount,
    showSecondary: activity.showSecondary,
  });

  const readingTitle = activity.secondary.some((row) => row.kind === "recommendation")
    ? "Reading recommendations"
    : matrixKind === "resonance" || activity.secondary.some((row) => row.kind === "ssr")
      ? "Scoring reactions"
      : "Reading answers";

  return (
    <section className="mb-6" data-testid="run-collecting-responses" aria-live="polite">
      <div className="mb-3">
        <h2 className="label-mono text-xs font-medium text-ink/60">Collecting responses</h2>
        <p className="mt-1 font-mono text-xs text-ink/55" data-testid="run-collecting-status">
          {status}
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-xl border border-ink/15 p-4">
        <Lane title="Asking now" empty="No prompt in flight right now">
          {activity.asking.map((row) => (
            <WorkRow
              key={row.jobId}
              meta={`${row.engineLabel} · ${formatElapsedShort(row.startedAt, clock)}`}
              body={row.promptPreview}
              pulse={!suppressMotion}
            />
          ))}
        </Lane>

        <Lane title="Just collected" empty="Waiting for the first responses…">
          {activity.answered.map((row) => {
            const took = formatTookShort(row.latencyMs);
            return (
              <WorkRow
                key={row.responseId}
                meta={took ? `${row.engineLabel} · ${took}` : row.engineLabel}
                body={row.responsePreview}
              />
            );
          })}
        </Lane>

        {activity.showSecondary && (
          <Lane title={readingTitle} empty="Nothing to read yet">
            {activity.secondary.map((row) => (
              <WorkRow
                key={`${row.jobId}-${row.state}-${row.label}`}
                meta={row.kind === "pending" ? "In progress" : "Just finished"}
                body={row.label}
                pulse={row.kind === "pending" && !suppressMotion}
              />
            ))}
          </Lane>
        )}
      </div>
    </section>
  );
}
