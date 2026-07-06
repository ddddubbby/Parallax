"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/core/id";
import { getExtractionProgress, listDeadLetteredExtractions } from "@/db/repositories/extraction";
import { listMetrics } from "@/db/repositories/metrics";
import { getRun } from "@/db/repositories/runner";
import { reExtractResponse } from "./service";

type ActionResult = { ok: true } | { ok: false; error: string };

/** AD-2: Debug re-extract — a new extraction_version, never touching the prior one (C-3). */
export async function reExtract(responseId: string): Promise<ActionResult> {
  try {
    if (!isUuid(responseId)) return { ok: false, error: "Invalid response id" };
    await reExtractResponse(responseId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-extraction failed" };
  }
  revalidatePath("/debug");
  return { ok: true };
}

export async function fetchExtractionAndMetrics(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return null;
  const [progress, metrics] = await Promise.all([
    getExtractionProgress(runId),
    listMetrics(runId),
  ]);
  return { progress, metrics, plannedResponses: run.plannedCalls };
}

export async function fetchDeadLetteredExtractions() {
  return listDeadLetteredExtractions();
}
