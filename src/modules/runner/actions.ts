"use server";

import { revalidatePath } from "next/cache";
import {
  checkCostCap,
  computePlannedCalls,
  estimateRunCostUsd,
  EXTRACTION_ENGINE_MOCK_COST_USD,
  type GenerationMode,
  isProviderAllowedForRunMode,
  type ProviderId,
  type RunMode,
} from "@/core/runner";
import {
  cancelRun as cancelRunRepo,
  createRun as createRunRepo,
  type DebugFailureInjection,
  getApprovedMatrixCellCount,
  getApprovedVersionForRun,
  getAverageCellTextLength,
  getProjectStatus,
  getRunDetail,
  getRunFailureCounts,
  pauseRun as pauseRunRepo,
  requeueJob as requeueJobRepo,
  resumeRun as resumeRunRepo,
} from "@/db/repositories/runner";
import { estimateExtractionCostUsd } from "@/providers/deepseek";
import { getProvider, listRegisteredProviders } from "@/providers/registry";

type ActionResult = { ok: true; runId?: string } | { ok: false; error: string };

export interface RunCreationInput {
  runMode: RunMode;
  providers: ProviderId[];
  modes: GenerationMode[];
  repetitions: number;
  costCapUsd: number;
  debugFailureInjection?: DebugFailureInjection | null;
}

/**
 * C-9/C-11 boundary checks shared by projection and creation: run mode and
 * provider set must be consistent (no real spend under a MOCK label, no
 * fixtures in live aggregates), and audit-grade runs keep k=5 (C-1).
 */
function validateModeConsistency(input: RunCreationInput): string | null {
  const disallowed = input.providers.filter((p) => !isProviderAllowedForRunMode(input.runMode, p));
  if (disallowed.length > 0) {
    return input.runMode === "mock"
      ? `A mock run can only use the mock provider — ${disallowed.join(", ")} would spend real money under a MOCK label (C-9)`
      : `A live run cannot include the mock provider — fixture output must never mix into live aggregates (C-9)`;
  }
  if (input.runMode === "live_audit" && input.repetitions !== 5) {
    return "Audit-grade runs are locked to k=5 repetitions (C-1) — cut coverage, not repetitions";
  }
  if (input.runMode !== "mock" && input.debugFailureInjection) {
    return "Failure injection is a mock-run test tool (D-027) — not available on runs that spend real money";
  }
  return null;
}

/** C-7: the UI gets provider metadata through this action, never from /src/providers directly. */
export async function listProviderOptions() {
  return listRegisteredProviders().map((p) => ({
    id: p.id,
    displayName: p.displayName,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));
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
  // Estimate from the version's real average prompt length, not an empty
  // string — "" projected near-zero input cost for every live run (RN-2).
  const avgPromptChars = await getAverageCellTextLength(version.id);
  const representativePrompt = "x".repeat(avgPromptChars);
  const generationCostPerCall =
    input.providers.reduce(
      (sum, id) => sum + (getProvider(id)?.estimateCostUsd({ promptText: representativePrompt, mode: "ungrounded" }) ?? 0),
      0,
    ) / Math.max(input.providers.length, 1);
  // D-022: one estimated extraction call per generation call. Mock runs use
  // fixture-backed extraction at $0; live extraction reuses the generation
  // provider (D-036), currently always DeepSeek.
  const extractionCostPerCall =
    input.runMode === "mock" ? EXTRACTION_ENGINE_MOCK_COST_USD : estimateExtractionCostUsd();
  const projectedCostUsd = estimateRunCostUsd(plannedCalls, generationCostPerCall, extractionCostPerCall);
  return { ok: true as const, plannedCalls, projectedCostUsd, cellCount, versionId: version.id };
}

/** RN-2, RN-3, PV-5, C-9: validated, capped, mode-consistent run creation. */
export async function createRun(projectId: string, input: RunCreationInput): Promise<ActionResult> {
  if (input.providers.length === 0) return { ok: false, error: "Select at least one provider" };
  if (input.modes.length === 0) return { ok: false, error: "Select at least one generation mode" };
  if (input.repetitions < 1) return { ok: false, error: "Repetitions must be at least 1" };

  const consistencyError = validateModeConsistency(input);
  if (consistencyError) return { ok: false, error: consistencyError };

  const status = await getProjectStatus(projectId);
  if (status !== "active") return { ok: false, error: "Complete intake before starting a run" };

  const capabilities = listRegisteredProviders().map((p) => ({
    id: p.id,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));

  // PV-5: reject a selection where every planned job would be skipped —
  // such a run has no job that can ever finish, so it would sit in
  // 'queued' forever (the repo throws on this too, as a script backstop).
  const anySupportedPair = input.providers.some((providerId) =>
    input.modes.some((mode) => {
      const cap = capabilities.find((c) => c.id === providerId);
      if (!cap) return false;
      return mode === "grounded" ? cap.supportsGrounded : cap.supportsUngrounded;
    }),
  );
  if (!anySupportedPair) {
    return {
      ok: false,
      error: "No selected provider supports any selected generation mode (PV-5) — e.g. DeepSeek has no grounded/citation path",
    };
  }

  const projection = await projectRunCost(projectId, input);
  if (!projection.ok) return { ok: false, error: projection.error };

  const capCheck = checkCostCap(projection.projectedCostUsd, input.costCapUsd);
  if (!capCheck.ok) {
    return {
      ok: false,
      error: `Projected cost $${projection.projectedCostUsd.toFixed(4)} exceeds the $${input.costCapUsd} cap by $${capCheck.overBy?.toFixed(4)} (RN-2)`,
    };
  }

  let run;
  try {
    run = await createRunRepo(
      {
        projectId,
        matrixVersionId: projection.versionId,
        runMode: input.runMode,
        repetitions: input.repetitions,
        providers: input.providers,
        modes: input.modes,
        costCapUsd: input.costCapUsd,
        debugFailureInjection: input.debugFailureInjection,
      },
      capabilities,
      projection.plannedCalls,
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Run creation failed" };
  }
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
