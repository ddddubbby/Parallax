"use server";

import { revalidatePath } from "next/cache";
import {
  checkCostCap,
  computePlannedCalls,
  estimateRunCostUsd,
} from "@/core/runner";
import {
  cancelRun as cancelRunRepo,
  createRun as createRunRepo,
  type DebugFailureInjection,
  getApprovedMatrixCellCount,
  getApprovedVersionForRun,
  getProjectStatus,
  getRunDetail,
  getRunFailureCounts,
  pauseRun as pauseRunRepo,
  requeueJob as requeueJobRepo,
  resumeRun as resumeRunRepo,
} from "@/db/repositories/runner";
import { getProvider, listRegisteredProviders } from "@/providers/registry";
import type { GenerationMode, ProviderId } from "@/providers/types";

type ActionResult = { ok: true; runId?: string } | { ok: false; error: string };

export interface RunCreationInput {
  providers: ProviderId[];
  modes: GenerationMode[];
  repetitions: number;
  costCapUsd: number;
  debugFailureInjection?: DebugFailureInjection | null;
}

/** RN-1/RN-2: plan and validate before touching the database. */
export async function projectRunCost(projectId: string, input: RunCreationInput) {
  const version = await getApprovedVersionForRun(projectId);
  if (!version) return { ok: false as const, error: "No approved matrix version" };
  const cellCount = await getApprovedMatrixCellCount(version.id);
  const plannedCalls = computePlannedCalls(
    cellCount,
    input.providers.length,
    input.modes.length,
    input.repetitions,
  );
  const generationCostPerCall =
    input.providers.reduce((sum, id) => sum + (getProvider(id)?.estimateCostUsd({ promptText: "", mode: "ungrounded" }) ?? 0), 0) /
    Math.max(input.providers.length, 1);
  const projectedCostUsd = estimateRunCostUsd(plannedCalls, generationCostPerCall);
  return { ok: true as const, plannedCalls, projectedCostUsd, cellCount, versionId: version.id };
}

/** RN-2, RN-3, PV-5: validated, capped run creation. */
export async function createRun(projectId: string, input: RunCreationInput): Promise<ActionResult> {
  if (input.providers.length === 0) return { ok: false, error: "Select at least one provider" };
  if (input.modes.length === 0) return { ok: false, error: "Select at least one generation mode" };
  if (input.repetitions < 1) return { ok: false, error: "Repetitions must be at least 1" };

  const status = await getProjectStatus(projectId);
  if (status !== "active") return { ok: false, error: "Complete intake before starting a run" };

  const projection = await projectRunCost(projectId, input);
  if (!projection.ok) return { ok: false, error: projection.error };

  const capCheck = checkCostCap(projection.projectedCostUsd, input.costCapUsd);
  if (!capCheck.ok) {
    return {
      ok: false,
      error: `Projected cost $${projection.projectedCostUsd.toFixed(4)} exceeds the $${input.costCapUsd} cap by $${capCheck.overBy?.toFixed(4)} (RN-2)`,
    };
  }

  const capabilities = listRegisteredProviders().map((p) => ({
    id: p.id,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));

  const run = await createRunRepo(
    {
      projectId,
      matrixVersionId: projection.versionId,
      runMode: "mock",
      repetitions: input.repetitions,
      providers: input.providers,
      modes: input.modes,
      costCapUsd: input.costCapUsd,
      debugFailureInjection: input.debugFailureInjection,
    },
    capabilities,
    projection.plannedCalls,
  );
  revalidatePath(`/projects/${projectId}/runs/${run.id}`);
  return { ok: true, runId: run.id };
}

export async function pauseRun(projectId: string, runId: string): Promise<ActionResult> {
  await pauseRunRepo(runId);
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

export async function resumeRun(projectId: string, runId: string): Promise<ActionResult> {
  await resumeRunRepo(runId);
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

export async function cancelRun(projectId: string, runId: string): Promise<ActionResult> {
  await cancelRunRepo(runId);
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

/** AD-1: Debug jobs table requeue action. */
export async function requeueJob(runId: string, jobId: string): Promise<ActionResult> {
  await requeueJobRepo(jobId);
  revalidatePath(`/debug`);
  const run = await getRunDetail(runId);
  if (run) revalidatePath(`/projects/${run.run.projectId}/runs/${runId}`);
  return { ok: true };
}

export async function getRunSummary(runId: string) {
  return getRunFailureCounts(runId);
}

export async function fetchRunDetail(runId: string) {
  return getRunDetail(runId);
}
