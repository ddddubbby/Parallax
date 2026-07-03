import { isProviderDown } from "@/core/runner";
import {
  appendRunEvent,
  getProviderOutcomeCounts,
  skipRemainingJobsForProvider,
} from "@/db/repositories/runner";

/**
 * D-042 graceful degradation: called by the worker after every dead-letter.
 * If the failing job's provider now matches the down rule (repeated
 * dead-letters, zero successes in this run), its remaining queued jobs are
 * skipped so the run's other providers finish and the run completes as
 * PARTIAL instead of retrying a dead provider into the run-wide breaker.
 * Idempotent — later invocations find no queued jobs left to skip and stay
 * silent. Kept out of worker/index.ts so it's directly testable (that file
 * self-invokes main() on import).
 */
export async function handleProviderDownAfterDeadLetter(
  runId: string,
  providerId: string,
): Promise<{ providerDown: boolean; skippedJobs: number }> {
  const counts = await getProviderOutcomeCounts(runId, providerId);
  if (!isProviderDown(counts.succeeded, counts.deadLettered)) {
    return { providerDown: false, skippedJobs: 0 };
  }

  const skippedJobs = await skipRemainingJobsForProvider(runId, providerId);
  if (skippedJobs > 0) {
    await appendRunEvent({
      runId,
      level: "error",
      eventType: "provider_down",
      message: `Provider ${providerId} detected down (${counts.deadLettered} dead-letters, 0 successes) — skipped its remaining ${skippedJobs} queued job(s); other providers continue (D-042)`,
    });
  }
  return { providerDown: true, skippedJobs };
}
