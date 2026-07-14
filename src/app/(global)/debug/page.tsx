import { DeadLettersTable } from "@/components/debug/dead-letters-table";
import { DebugJobsTable } from "@/components/debug/jobs-table";
import {
  getLastHeartbeat,
  hasActiveRun,
  listRecentJobs,
  listRecentRunEvents,
} from "@/db/repositories/debug";
import { listDeadLetteredExtractions } from "@/db/repositories/extraction";
import { HEARTBEAT_STALE_MS } from "@/core/worker-timing";

export const dynamic = "force-dynamic";

// RN-9 staleness window is shared with the run-page worker-offline banner
// via src/core/worker-timing.ts (single source of truth).

// AD-1 (jobs + requeue), AD-2 (extraction dead-letters + re-extract), AD-3
// (run_events tail). AD-4's recompute/fixture-reload live on the run detail
// page (recompute) or aren't yet needed (fixture reload — fixtures are
// read fresh from disk every request already).
export default async function DebugPage() {
  const [jobsList, events, lastHeartbeat, activeRun, deadLetters] = await Promise.all([
    listRecentJobs(),
    listRecentRunEvents(),
    getLastHeartbeat(),
    hasActiveRun(),
    listDeadLetteredExtractions(),
  ]);

  const heartbeatAgeMs = lastHeartbeat ? Date.now() - new Date(lastHeartbeat).getTime() : null;
  const stale = activeRun && (heartbeatAgeMs === null || heartbeatAgeMs > HEARTBEAT_STALE_MS);

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-paper sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Debug</h1>
        <span
          className={`label-mono rounded-xs border px-1.5 py-0.5 text-[11px] ${
            activeRun
              ? stale
                ? "border-danger text-paper"
                : "border-ok text-paper"
              : "border-paper/35 text-paper/70"
          }`}
        >
          {!activeRun
            ? "no active run"
            : heartbeatAgeMs === null
              ? "no heartbeat"
              : `heartbeat ${Math.round(heartbeatAgeMs / 1000)}s ago`}
        </span>
      </div>
      <DebugJobsTable jobs={jobsList} events={events} />
      <div className="mt-8">
        <DeadLettersTable rows={deadLetters} />
      </div>
    </main>
  );
}
