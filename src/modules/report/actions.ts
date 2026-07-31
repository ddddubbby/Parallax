"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/core/id";
import { REPORT_SECTIONS, RESONANCE_REPORT_SECTIONS } from "@/core/report-templates";
import { isReportableRunState } from "@/core/runner";
import { getMisinformationRegister } from "@/db/repositories/dashboard";
import { listFindings } from "@/db/repositories/findings";
import { recomputeMetrics } from "@/db/repositories/metrics";
import { getReportFreshness, getReportSections } from "@/db/repositories/report";
import { getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { computeFindings } from "@/modules/analysis/findings";
import {
  isKnownReportSectionKey,
  editSection,
  generateReport,
  generateResonanceReport,
  regenerateOneSection,
} from "./service";

export type ReportAdvisoryChecklist = {
  findingsCount: number;
  unreviewedMisinfoCount: number;
  reportStale: boolean;
};

type ActionResult = { ok: true } | { ok: false; error: string };
type RegenerateResult = { ok: true; generatedMd: string } | { ok: false; error: string };

async function assertRunForProject(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return null;
  return run;
}

function sectionKeyMatchesKind(sectionKey: string, kind: string | null | undefined) {
  const sections = kind === "resonance" ? RESONANCE_REPORT_SECTIONS : REPORT_SECTIONS;
  return sections.some((section) => section.key === sectionKey);
}

/** Generates findings + report sections. Idempotent: never overwrites an existing (possibly edited) section. */
export async function generateReportForRun(projectId: string, runId: string): Promise<ActionResult> {
  try {
    if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid project or run id" };
    const run = await assertRunForProject(projectId, runId);
    if (!run) return { ok: false, error: "Run not found for project" };
    if (!isReportableRunState(run.state)) return { ok: false, error: "Run must be completed before generating a report" };
    const kind = await getRunMatrixKind(runId);
    await recomputeMetrics(runId);
    if (kind?.kind === "resonance") {
      const result = await generateResonanceReport(runId);
      if (!result.ok) return result;
    } else {
      await computeFindings(runId);
      const result = await generateReport(runId);
      if (!result.ok) return result;
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Report generation failed" };
  }
  revalidatePath(`/projects/${projectId}/report`);
  return { ok: true };
}

export async function saveSectionEdit(projectId: string, runId: string, sectionId: string, editedMd: string): Promise<ActionResult> {
  try {
    if (!isUuid(projectId) || !isUuid(runId) || !isUuid(sectionId)) return { ok: false, error: "Invalid project, run, or section id" };
    const run = await assertRunForProject(projectId, runId);
    if (!run) return { ok: false, error: "Run not found for project" };
    if (!isReportableRunState(run.state)) return { ok: false, error: "Run must be completed before editing a report" };
    await editSection(runId, sectionId, editedMd);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Section edit failed" };
  }
  revalidatePath(`/projects/${projectId}/report`);
  return { ok: true };
}

/** RB-3: regenerate exactly one section — the action layer enforces this by taking a single sectionId, never a list. */
export async function regenerateSectionAction(projectId: string, runId: string, sectionId: string, sectionKey: string): Promise<RegenerateResult> {
  let generatedMd: string;
  try {
    if (!isUuid(projectId) || !isUuid(runId) || !isUuid(sectionId)) return { ok: false, error: "Invalid project, run, or section id" };
    if (!isKnownReportSectionKey(sectionKey)) return { ok: false, error: "Unknown report section key" };
    const run = await assertRunForProject(projectId, runId);
    if (!run) return { ok: false, error: "Run not found for project" };
    if (!isReportableRunState(run.state)) return { ok: false, error: "Run must be completed before regenerating a report" };
    const kind = await getRunMatrixKind(runId);
    if (!sectionKeyMatchesKind(sectionKey, kind?.kind)) {
      return { ok: false, error: "Report section does not belong to this run type" };
    }
    await recomputeMetrics(runId);
    if (kind?.kind !== "resonance") await computeFindings(runId);
    generatedMd = await regenerateOneSection(runId, sectionId, sectionKey);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Regenerate failed" };
  }
  revalidatePath(`/projects/${projectId}/report`);
  return { ok: true, generatedMd };
}

export async function fetchReportSections(projectId: string, runId: string) {
  const run = await assertRunForProject(projectId, runId);
  if (!run) return [];
  if (!isReportableRunState(run.state)) return [];
  return getReportSections(runId);
}

/**
 * D-121: advisory pre-export checklist. Never disables Export — operators
 * may still download; the banner only names residual review debt.
 */
export async function fetchReportAdvisoryChecklist(
  projectId: string,
  runId: string,
): Promise<ReportAdvisoryChecklist | null> {
  const run = await assertRunForProject(projectId, runId);
  if (!run || !isReportableRunState(run.state)) return null;
  const kind = await getRunMatrixKind(runId);
  const freshness = await getReportFreshness(runId);
  if (kind?.kind === "resonance") {
    return {
      findingsCount: 0,
      unreviewedMisinfoCount: 0,
      reportStale: freshness.stale,
    };
  }
  await computeFindings(runId);
  const [findings, misinfo] = await Promise.all([
    listFindings(runId),
    getMisinformationRegister(runId),
  ]);
  return {
    findingsCount: findings.length,
    unreviewedMisinfoCount: misinfo.filter((row) => row.reviewState === "unreviewed").length,
    reportStale: freshness.stale,
  };
}
