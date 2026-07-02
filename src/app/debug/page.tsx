import { Stamp } from "@/components/ui";
import { DebugJobsTable } from "@/components/debug/jobs-table";
import {
  getLastHeartbeat,
  hasActiveRun,
  listRecentJobs,
  listRecentRunEvents,
} from "@/db/repositories/debug";

export const dynamic = "force-dynamic";

// RN-9: a run is active but no heartbeat in 3x the interval means the
// worker process itself is hung or dead (distinct from stale job locks).
const HEARTBEAT_STALE_MS = 90_000;

// AD-1 (jobs + requeue), AD-3 (run_events tail). AD-2 (dead-letter
// re-extract) and AD-4's recompute/fixture-reload arrive with M5, once
// extraction exists to act on.
export default async function DebugPage() {
  const [jobsList, events, lastHeartbeat, activeRun] = await Promise.all([
    listRecentJobs(),
    listRecentRunEvents(),
    getLastHeartbeat(),
    hasActiveRun(),
  ]);

  const heartbeatAgeMs = lastHeartbeat ? Date.now() - new Date(lastHeartbeat).getTime() : null;
  const stale = activeRun && (heartbeatAgeMs === null || heartbeatAgeMs > HEARTBEAT_STALE_MS);

  return (
    <main className="min-h-screen bg-ink px-6 py-8 text-paper">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="label-mono text-lg font-semibold">Debug</h1>
        {activeRun && (
          <Stamp tone={stale ? "danger" : "ok"}>
            {heartbeatAgeMs === null
              ? "no heartbeat"
              : `heartbeat ${Math.round(heartbeatAgeMs / 1000)}s ago`}
          </Stamp>
        )}
      </div>
      <DebugJobsTable jobs={jobsList} events={events} />
    </main>
  );
}
