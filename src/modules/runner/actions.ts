"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/core/id";
import {
  checkCostCap,
  computePlannedCalls,
  EXTRACTION_ENGINE_MOCK_COST_USD,
  findUnsupportedEngineModePairs,
  type GenerationMode,
  isProviderAllowedForRunMode,
  isRunMode,
  type ProviderId,
  type RunMode,
  validateDebugFailureInjection,
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
  getRun,
  getRunDetail,
  getRunFailureCounts,
  getRunMatrixKind,
  pauseRun as pauseRunRepo,
  requeueJob as requeueJobRepo,
  resumeRun as resumeRunRepo,
} from "@/db/repositories/runner";
import {
  findExceededDailyBudget,
  findProjectedDailyBudgetTrip,
  type ProjectedBudget,
  readDailyBudgetUsd,
  secondaryProviderIdForKind,
  validateSecondaryProviderConfig,
} from "@/modules/runner/budget";
import { getResonanceStudyAnchorSetVersion } from "@/db/repositories/resonance";
import { anchorStatementSets, getSsrAnchorSet } from "@/core/ssr-anchors";
import { estimateExtractionCostUsd } from "@/providers/deepseek";
import { estimateOpenAIEmbeddingCostUsd } from "@/providers/openai/embeddings";
import { getProvider, listRegisteredProviders } from "@/providers/registry";
import { validateProviderBaseUrlOverride } from "@/providers/shared";

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
  if (!isRunMode(input.runMode)) {
    return `Unknown run mode: ${String(input.runMode)}`;
  }
  if (!Array.isArray(input.providers) || !Array.isArray(input.modes)) {
    return "Provider and generation mode selections must be arrays";
  }
  if (input.providers.length === 0) return "Select at least one provider";
  if (input.modes.length === 0) return "Select at least one generation mode";
  if (!Number.isInteger(input.repetitions) || input.repetitions < 1 || input.repetitions > 5) {
    return "Repetitions must be an integer from 1 to 5 — run creation never accepts a hidden higher-k RPC value";
  }
  if (!Number.isFinite(input.costCapUsd) || input.costCapUsd < 0) {
    return "Run dollar cap must be a finite non-negative number";
  }
  if (input.matrixVersionId !== undefined && !isUuid(input.matrixVersionId)) {
    return "Invalid matrix version id";
  }
  const knownProviders = new Set(listRegisteredProviders().map((provider) => provider.id));
  const unknownProviders = input.providers.filter((providerId) => !knownProviders.has(providerId));
  if (unknownProviders.length > 0) {
    return `Unknown provider selection: ${unknownProviders.join(", ")}`;
  }
  const validModes = new Set<GenerationMode>(["grounded", "ungrounded"]);
  const unknownModes = input.modes.filter((mode) => !validModes.has(mode));
  if (unknownModes.length > 0) {
    return `Unknown generation mode selection: ${unknownModes.join(", ")}`;
  }
  if (new Set(input.providers).size !== input.providers.length) {
    return "Provider selections must be unique";
  }
  if (new Set(input.modes).size !== input.modes.length) {
    return "Generation mode selections must be unique";
  }
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
  const injectionError = validateDebugFailureInjection(input.debugFailureInjection);
  if (injectionError) return injectionError;
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
  if (!isUuid(projectId)) return { ok: false as const, error: "Invalid project id" };
  const consistencyError = validateModeConsistency(input);
  if (consistencyError) return { ok: false as const, error: consistencyError };

  const version = input.matrixVersionId
    ? await getMatrixVersionForRun(projectId, input.matrixVersionId)
    : await getApprovedVersionForRun(projectId);
  if (!version) return { ok: false as const, error: "No approved matrix version" };
  if (version.state !== "approved") return { ok: false as const, error: "Runs require an approved matrix version" };
  if (version.kind === "resonance" && (input.providers.length !== 1 || input.modes.length !== 1)) {
    return { ok: false as const, error: "A Resonance run must select exactly one provider and one generation mode (D-067)" };
  }
  if (input.runMode !== "mock") {
    const secondaryError = validateSecondaryProviderConfig(version.kind);
    if (secondaryError) return { ok: false as const, error: secondaryError };
  }
  const capabilities = listRegisteredProviders().map((p) => ({
    id: p.id,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));
  const unsupportedPairs = findUnsupportedEngineModePairs(input.providers, input.modes, capabilities);
  if (unsupportedPairs.length > 0) {
    return {
      ok: false as const,
      error: `Unsupported provider/mode selection (C-10/PV-5): ${unsupportedPairs.map((pair) => `${pair.providerId}+${pair.mode}`).join(", ")}`,
    };
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
  // Use the study's PINNED anchor set (D-066: future sets differ in statement
  // count/length) rather than hardcoding v1, so the embedding-cost estimate
  // tracks the run's real anchor set.
  const anchorSetVersion =
    isResonance && version.resonanceStudyId
      ? (await getResonanceStudyAnchorSetVersion(version.resonanceStudyId)) ?? "purchase_intent.v1"
      : "purchase_intent.v1";
  const embeddingCostPerCall =
    input.runMode === "mock" || !isResonance
      ? 0
      : estimateOpenAIEmbeddingCostUsd([
          "x".repeat(2_000),
          ...anchorStatementSets(getSsrAnchorSet(anchorSetVersion)).flat(),
        ]);
  let projectedCostUsd = 0;
  const projectedByProvider = new Map<string, number>();
  const addProjectedSpend = (providerId: string, costUsd: number) => {
    if (providerId === "mock" || costUsd <= 0) return;
    projectedByProvider.set(providerId, (projectedByProvider.get(providerId) ?? 0) + costUsd);
  };
  const secondaryProvider = secondaryProviderIdForKind(version.kind);
  for (const providerId of input.providers) {
    const provider = getProvider(providerId);
    if (!provider) continue;
    for (const mode of input.modes) {
      const supported = mode === "grounded" ? provider.supportsGrounded : provider.supportsUngrounded;
      if (!supported) continue;
      const generationCostPerCall = provider.estimateCostUsd({ promptText: representativePrompt, mode });
      const generationProjectedUsd = callsPerPair * generationCostPerCall;
      const extractionProjectedUsd = callsPerPair * extractionCostPerCall;
      const embeddingProjectedUsd = callsPerPair * embeddingCostPerCall;
      // D-022: one estimated extraction call per generation call.
      projectedCostUsd += generationProjectedUsd + extractionProjectedUsd + embeddingProjectedUsd;
      addProjectedSpend(providerId, generationProjectedUsd);
      addProjectedSpend(secondaryProvider, extractionProjectedUsd + embeddingProjectedUsd);
    }
  }
  // A1: surface today's spend vs daily budget per relevant provider (live
  // runs only) so the form can warn BEFORE submit — the worker's per-provider
  // daily-budget enforcement (C-2/D-012) was previously invisible until a
  // run paused mid-flight. Providers with no configured budget are omitted.
  const budgets: ProjectedBudget[] = [];
  if (input.runMode !== "mock") {
    for (const providerId of new Set<string>([...input.providers, secondaryProvider])) {
      if (providerId === "mock") continue;
      const budgetUsd = readDailyBudgetUsd(providerId);
      if (!Number.isFinite(budgetUsd)) continue;
      budgets.push({
        providerId,
        spentUsd: await getProviderSpendToday(providerId),
        budgetUsd,
        projectedUsd: projectedByProvider.get(providerId) ?? 0,
      });
    }
  }

  return { ok: true as const, plannedCalls, projectedCostUsd, cellCount, versionId: version.id, budgets };
}

/** RN-2, RN-3, PV-5, C-9: validated, capped, mode-consistent run creation. */
export async function createRun(projectId: string, input: RunCreationInput): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid project id" };
  const consistencyError = validateModeConsistency(input);
  if (consistencyError) return { ok: false, error: consistencyError };

  const status = await getProjectStatus(projectId);
  if (status !== "active") return { ok: false, error: "Complete intake before starting a run" };

  const capabilities = listRegisteredProviders().map((p) => ({
    id: p.id,
    supportsGrounded: p.supportsGrounded,
    supportsUngrounded: p.supportsUngrounded,
  }));

  // C-10/PV-5: reject every unsupported selected engine-mode, not only
  // the degenerate "all skipped" case. A mixed run that silently skips
  // DeepSeek grounded while running OpenAI grounded misrepresents what the
  // operator selected and what the evidence covers.
  const unsupportedPairs = findUnsupportedEngineModePairs(input.providers, input.modes, capabilities);
  if (unsupportedPairs.length > 0) {
    return {
      ok: false,
      error: `Unsupported provider/mode selection (C-10/PV-5): ${unsupportedPairs.map((pair) => `${pair.providerId}+${pair.mode}`).join(", ")}`,
    };
  }

  // Preflight active credentials for a LIVE run so it can't burn real
  // generation money and then be unable to extract (or unable to generate
  // at all) for a key the operator never entered. Checks each selected
  // generation provider AND the extraction engine (D-041) — the latter is
  // the subtle one: without its key, generation succeeds and spends, then
  // every extraction dead-letters and the run yields no usable metrics.
  // Resolve the run's matrix kind ONCE (was fetched three times across the two
  // preflights and the cost projection) so the secondary-engine decision can't
  // desync between the credential and budget checks.
  const runMatrixVersion =
    input.runMode !== "mock"
      ? input.matrixVersionId
        ? await getMatrixVersionForRun(projectId, input.matrixVersionId)
        : await getApprovedVersionForRun(projectId)
      : null;
  const secondaryProvider = secondaryProviderIdForKind(runMatrixVersion?.kind);

  if (input.runMode !== "mock") {
    const secondaryError = validateSecondaryProviderConfig(runMatrixVersion?.kind);
    if (secondaryError) return { ok: false, error: secondaryError };
    const needed = new Set<string>([...input.providers, secondaryProvider]);
    const missing: string[] = [];
    for (const providerId of needed) {
      if (providerId === "mock") continue;
      const credential = await getActiveCredential(providerId as ProviderId);
      if (!credential) {
        missing.push(providerId);
        continue;
      }
      if (credential.baseUrl) {
        const baseUrlError = validateProviderBaseUrlOverride(providerId, credential.baseUrl);
        if (baseUrlError) return { ok: false, error: baseUrlError };
      }
    }
    if (missing.length > 0) {
      return {
        ok: false,
        error: `No active credential in Settings for: ${missing.join(", ")} — a live run needs a key for every selected provider and the ${runMatrixVersion?.kind === "resonance" ? "embedding provider" : "extraction engine"} (${secondaryProvider}) before it can spend.`,
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

  // Daily-budget preflight (C-2/D-012): block if the provider is already
  // over budget OR this run's provider-attributed projection would exceed
  // it. The worker still enforces post-job as the source of truth, but a
  // predictably over-budget run should not start and spend real money only
  // to pause mid-flight.
  if (input.runMode !== "mock") {
    const trip = findProjectedDailyBudgetTrip(projection.budgets);
    if (trip) {
      return {
        ok: false,
        error: `${trip.providerId} daily budget would be exceeded: spent $${trip.spentUsd.toFixed(4)} + projected $${trip.projectedUsd.toFixed(4)} = $${trip.projectedTotalUsd.toFixed(4)} / $${trip.budgetUsd.toFixed(2)} (C-2). Wait for the budget to reset (UTC midnight), raise ${trip.providerId.toUpperCase()}_DAILY_BUDGET_USD, or reduce the run.`,
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
  if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid project or run id" };
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return { ok: false, error: "Run not found for project" };
  const updated = await pauseRunRepo(runId);
  if (updated === 0) return { ok: false, error: "Run is not pausable" };
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

export async function resumeRun(projectId: string, runId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid project or run id" };
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return { ok: false, error: "Run not found for project" };
  if (run.runMode !== "mock") {
    // Resume uses >= (already REACHED the cap), not checkCostCap's <= (which
    // correctly allows a projection exactly AT the cap at creation): a run
    // sitting at its cap would exceed it on the very next paid call.
    const actualCostUsd = Number(run.actualCostUsd);
    const costCapUsd = Number(run.costCapUsd);
    if (actualCostUsd >= costCapUsd) {
      return {
        ok: false,
        error: `Run already reached its cost cap ($${actualCostUsd.toFixed(4)} / $${costCapUsd.toFixed(4)}). Create a new smaller run instead of resuming spend (C-2).`,
      };
    }
    try {
      const kind = await getRunMatrixKind(runId);
      const budgetProviders = [...((run.selectedProvidersJson as string[]) ?? []), secondaryProviderIdForKind(kind?.kind)];
      const trip = await findExceededDailyBudget(budgetProviders);
      if (trip) {
        return {
          ok: false,
          error: `${trip.providerId} daily budget is still exceeded ($${trip.spentUsd.toFixed(4)} / $${trip.budgetUsd.toFixed(2)}). Wait for the UTC reset or raise the budget before resuming (C-2).`,
        };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Budget configuration is invalid" };
    }
  }
  const updated = await resumeRunRepo(runId);
  if (updated === 0) return { ok: false, error: "Run is not paused" };
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

export async function cancelRun(projectId: string, runId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid project or run id" };
  const run = await getRun(runId);
  if (!run || run.projectId !== projectId) return { ok: false, error: "Run not found for project" };
  const updated = await cancelRunRepo(runId);
  if (updated === 0) return { ok: false, error: "Run is not cancellable" };
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true };
}

/** AD-1: Debug jobs table requeue action. */
export async function requeueJob(runId: string, jobId: string): Promise<ActionResult> {
  if (!isUuid(runId) || !isUuid(jobId)) return { ok: false, error: "Invalid run or job id" };
  const updated = await requeueJobRepo(runId, jobId);
  if (updated === 0) {
    return { ok: false, error: "Job not found for run, not repairable, or run is already finalized" };
  }
  revalidatePath(`/debug`);
  const run = await getRunDetail(runId);
  if (run) revalidatePath(`/projects/${run.run.projectId}/runs/${runId}`);
  return { ok: true };
}

export async function getRunSummary(runId: string) {
  if (!isUuid(runId)) return { succeeded: 0, deadLettered: 0, cancelled: 0 };
  return getRunFailureCounts(runId);
}

export async function fetchRunDetail(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const detail = await getRunDetail(runId);
  if (!detail || detail.run.projectId !== projectId) return null;
  return detail;
}
