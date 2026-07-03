"use server";

import { revalidatePath } from "next/cache";
import { getReportSections } from "@/db/repositories/report";
import { getRun } from "@/db/repositories/runner";
import { computeFindings, editSection, generateReport, regenerateOneSection } from "./service";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Generates findings + report sections. Idempotent: never overwrites an existing (possibly edited) section. */
export async function generateReportForRun(runId: string): Promise<ActionResult> {
  try {
    await computeFindings(runId);
    const result = await generateReport(runId);
    if (!result.ok) return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Report generation failed" };
  }
  const run = await getRun(runId);
  if (run) revalidatePath(`/projects/${run.projectId}/report`);
  return { ok: true };
}

export async function saveSectionEdit(runId: string, sectionId: string, editedMd: string): Promise<ActionResult> {
  await editSection(sectionId, editedMd);
  const run = await getRun(runId);
  if (run) revalidatePath(`/projects/${run.projectId}/report`);
  return { ok: true };
}

/** RB-3: regenerate exactly one section — the action layer enforces this by taking a single sectionId, never a list. */
export async function regenerateSectionAction(runId: string, sectionId: string, sectionKey: string): Promise<ActionResult> {
  try {
    await regenerateOneSection(runId, sectionId, sectionKey);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Regenerate failed" };
  }
  const run = await getRun(runId);
  if (run) revalidatePath(`/projects/${run.projectId}/report`);
  return { ok: true };
}

export async function fetchReportSections(runId: string) {
  return getReportSections(runId);
}
