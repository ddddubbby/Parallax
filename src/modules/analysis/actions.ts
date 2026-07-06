"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/core/id";
import { recomputeMetrics as recomputeMetricsRepo } from "@/db/repositories/metrics";
import { getRun } from "@/db/repositories/runner";

type ActionResult = { ok: true; metricCount?: number } | { ok: false; error: string };

/** C-3: recompute is idempotent — deletes and rebuilds every metric row for the run. */
export async function recomputeMetrics(projectId: string, runId: string): Promise<ActionResult> {
  try {
    if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid project or run id" };
    const run = await getRun(runId);
    if (!run || run.projectId !== projectId) return { ok: false, error: "Run not found for project" };
    const metricCount = await recomputeMetricsRepo(runId);
    revalidatePath(`/projects/${projectId}/runs/${runId}`);
    return { ok: true, metricCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Recompute failed" };
  }
}
