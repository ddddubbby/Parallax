"use server";

import { revalidatePath } from "next/cache";
import { getExtractionProgress, listDeadLetteredExtractions } from "@/db/repositories/extraction";
import { listMetrics } from "@/db/repositories/metrics";
import { getRun } from "@/db/repositories/runner";
import { reExtractResponse } from "./service";

type ActionResult = { ok: true } | { ok: false; error: string };

/** AD-2: Debug re-extract — a new extraction_version, never touching the prior one (C-3). */
export async function reExtract(responseId: string): Promise<ActionResult> {
  try {
    await reExtractResponse(responseId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-extraction failed" };
  }
  revalidatePath("/debug");
  return { ok: true };
}

export async function fetchExtractionAndMetrics(runId: string) {
  const [progress, metrics, run] = await Promise.all([
    getExtractionProgress(runId),
    listMetrics(runId),
    getRun(runId),
  ]);
  return { progress, metrics, plannedResponses: run?.plannedCalls ?? 0 };
}

export async function fetchDeadLetteredExtractions() {
  return listDeadLetteredExtractions();
}
