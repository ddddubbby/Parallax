"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/core/id";
import {
  assertDeadLetterOwnedByRun,
  getExtractionProgress,
  listDeadLetteredExtractions,
  listDeadLettersForRun,
} from "@/db/repositories/extraction";
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

/**
 * Run-page re-extract: verifies project/run ownership and that the latest
 * extraction is dead-lettered before creating a new version (C-3).
 * May incur provider cost on live runs.
 */
export async function reExtractForRun(
  projectId: string,
  runId: string,
  responseId: string,
): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(runId) || !isUuid(responseId)) {
    return { ok: false, error: "Invalid id" };
  }
  try {
    const owned = await assertDeadLetterOwnedByRun(projectId, runId, responseId);
    if (!owned.ok) return owned;
    await reExtractResponse(responseId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-extraction failed" };
  }
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  revalidatePath("/debug");
  return { ok: true };
}

export async function fetchExtractionAndMetrics(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return null;
  const [progress, metrics, deadLetters] = await Promise.all([
    getExtractionProgress(runId),
    listMetrics(runId),
    listDeadLettersForRun(runId),
  ]);
  return { progress, metrics, plannedResponses: run.plannedCalls, deadLetters };
}

export async function fetchDeadLettersForRun(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return [];
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return [];
  return listDeadLettersForRun(runId);
}

export async function fetchDeadLetteredExtractions() {
  return listDeadLetteredExtractions();
}
