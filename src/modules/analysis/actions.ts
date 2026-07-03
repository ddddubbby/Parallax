"use server";

import { revalidatePath } from "next/cache";
import { recomputeMetrics as recomputeMetricsRepo } from "@/db/repositories/metrics";
import { getRun } from "@/db/repositories/runner";

type ActionResult = { ok: true; metricCount?: number } | { ok: false; error: string };

/** C-3: recompute is idempotent — deletes and rebuilds every metric row for the run. */
export async function recomputeMetrics(runId: string): Promise<ActionResult> {
  try {
    const metricCount = await recomputeMetricsRepo(runId);
    const run = await getRun(runId);
    if (run) revalidatePath(`/projects/${run.projectId}/runs/${runId}`);
    return { ok: true, metricCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Recompute failed" };
  }
}
