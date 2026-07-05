"use server";

import { revalidatePath } from "next/cache";
import {
  checkCostCap,
  computePlannedCalls,
  EXTRACTION_ENGINE_MOCK_COST_USD,
  type GenerationMode,
  isProviderAllowedForRunMode,
  type ProviderId,
  type RunMode,
} from "@/core/runner";
import { getActiveCredential } from "@/db/repositories/credentials";
import {
  cancelRun as cancelRunRepo,
  createRun as createRunRepo,
  type DebugFailureInjection,
  getApprovedMatrixCellCount,
  getApprovedVersionForRun,
  getAverageCellTextLength,
  getMatrixVersionForRun,
  getProjectStatus,
  getProviderSpendToday,
  getRunDetail,
  getRunFailureCounts,
  pauseRun as pauseRunRepo,
  requeueJob as requeueJobRepo,
  resumeRun as resumeRunRepo,
} from "@/db/repositories/runner";
import { embeddingProviderId, extractionProviderId, findExceededDailyBudget, readDailyBudgetUsd } from "@/modules/runner/budget";
import { anchorStatementSets, getSsrAnchorSet } from "@/core/ssr-anchors";
import { estimateExtractionCostUsd } from "@/providers/deepseek";
import { estimateOpenAIEmbeddingCostUsd } from "@/providers/openai/embeddings";
import { getProvider, listRegisteredProviders } from "@/providers/registry";

type ActionResult = { ok: true; runId?: string } | { ok: false; error: string };

export interface RunCreationInput {
  matrixVersionId?: string;
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
  const version = input.matrixVersionId
    ? await getMatrixVersionForRun(projectId, input.matrixVersionId)
    : await getApprovedVersionForRun(projectId);
  if (!version) return { ok: false as const, error: "No approved matrix version" };
  if (version.state !== "approved") return { ok: false as const, error: "Runs require an approved matrix version" };
  if (version.kind === "resonance" && (input.providers.length !== 1 || input.modes.length !== 1)) {
    return { ok: false as const, error: "A Resonance run must select exactly one provider and one generation mode (D-067)" };
  }
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

  // Cost is summed over the (provider, mode) pairs that actually get
  // planned, each estimated IN ITS OWN MODE — grounded pairs carry the
  // provider's web-search/grounding fee, which a blanket `mode:
  // "ungrounded"` estimate silently dropped (a grounded audit could pass
  // the cap while real spend was higher). Unsupported pairs (e.g.
  // deepseek+grounded) are skipped at planning, so they contribute $0.
  const callsPerPair = cellCount * input.repetitions;
  const isResonance = version.kind === "resonance";
  const extractionCostPerCall =
    input.runMode === "mock" || isResonance ? EXTRACTION_ENGINE_MOCK_COST_USD : estimateExtractionCostUsd();
  const embeddingCostPerCall =
    input.runMode === "mock" || !isResonance
      ? 0
      : estimateOpenAIEmbeddingCostUsd([
          "x".repeat(2_000),
          ...anchorStatementSets(getSsrAnchorSet("purchase_intent.v1")).flat(),
        ]);
  let projectedCostUsd = 0;
  for (const providerId of input.providers) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    for (const mode of input.modes) {
      const supported = mode === "grounded" ? provider.supportsGrounded : provider.supportsUngrounded;
      if (!supported) continue;
      const generationCostPerCall = provider.estimateCostUsd({ promptText: representativePrompt, mode });
      // D-022: one estimated extraction call per generation call.
      projectedCostUsd += callsPerPair * (generationCostPerCall + extractionCostPerCall + embeddingCostPerCall);
    }
  }
  // A1: surface today's spend vs daily budget per relevant provider (live
  // runs only) so the form can warn BEFORE submit — the worker's per-provider
  // daily-budget enforcement (C-2/D-012) was previously invisible until a
  // run paused mid-flight. Providers with no configured budget are omitted.
  const budgets: Array<{ providerId: string; spentUsd: number; budgetUsd: number }> = [];
  if (input.runMode !== "mock") {
    const secondaryProvider = isResonance ? embeddingProviderId() : extractionProviderId();
    for (const providerId of new Set<string>([...input.providers, secondaryProvider])) {
      if (providerId === "mock") continue;
      const budgetUsd = readDailyBudgetUsd(providerId);
      if (!Number.isFinite(budgetUsd)) continue;
      budgets.push({ providerId, spentUsd: await getProviderSpendToday(providerId), budgetUsd });
    }
  }

  return { ok: true as const, plannedCalls, projectedCostUsd, cellCount, versionId: version.id, budgets };
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

  // Preflight active credentials for a LIVE run so it can't burn real
  // generation money and then be unable to extract (or unable to generate
  // at all) for a key the operator never entered. Checks each selected
  // generation provider AND the extraction engine (D-041) — the latter is
  // the subtle one: without its key, generation succeeds and spends, then
  // every extraction dead-letters and the run yields no usable metrics.
  if (input.runMode !== "mock") {
    const projectionVersion = input.matrixVersionId
      ? await getMatrixVersionForRun(projectId, input.matrixVersionId)
      : await getApprovedVersionForRun(projectId);
    const secondaryProvider = projectionVersion?.kind === "resonance" ? embeddingProviderId() : extractionProviderId();
    const needed = new Set<string>([...input.providers, secondaryProvider]);
    const missing: string[] = [];
    for (const providerId of needed) {
      if (providerId === "mock") continue;
      const credential = await getActiveCredential(providerId as ProviderId);
      if (!credential) missing.push(providerId);
    }
    if (missing.length > 0) {
      return {
        ok: false,
        error: `No active credential in Settings for: ${missing.join(", ")} — a live run needs a key for every selected provider and the ${projectionVersion?.kind === "resonance" ? "embedding provider" : "extraction engine"} (${secondaryProvider}) before it can spend.`,
      };
    }
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

  // Daily-budget preflight (C-2/D-012): the worker enforces per-provider
  // daily budgets post-job and pauses a live run when a provider's spend
  // today crosses its budget. Without this check a run whose provider is
  // ALREADY over budget could be created, queued, and only pause on its
  // first finished job with zero progress — the same "fails at the terminal
  // gate, no earlier signal" shape as PM-9. Reject at creation instead,
  // over the same provider set the worker checks (selected + extraction
  // engine, D-041).
  if (input.runMode !== "mock") {
    const secondaryProvider = projection.versionId
      ? (await getMatrixVersionForRun(projectId, projection.versionId))?.kind === "resonance"
        ? embeddingProviderId()
        : extractionProviderId()
      : extractionProviderId();
    const trip = await findExceededDailyBudget([...input.providers, secondaryProvider]);
    if (trip) {
      return {
        ok: false,
        error: `${trip.providerId} has already spent $${trip.spentUsd.toFixed(4)} of its $${trip.budgetUsd.toFixed(2)} daily budget today (C-2) — this run would pause immediately. Wait for the budget to reset (UTC midnight) or raise ${trip.providerId.toUpperCase()}_DAILY_BUDGET_USD.`,
      };
    }
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
