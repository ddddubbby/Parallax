"use server";

import { isUuid } from "@/core/id";
import {
  getCitedSources,
  getMisinformationRegister,
  getProjectBrandNames,
  getProjectPersonasAndMarkets,
  getResponseDetail,
  getResponsesByIds,
  getResponsesForMetric,
  getResponsesForScope,
  getRunForDashboard,
  getUnresolvedMentionSummary,
  listCompletedRuns,
  reviewClaim as reviewClaimRepo,
} from "@/db/repositories/dashboard";
import { revalidatePath } from "next/cache";
import { addBrandAlias } from "@/db/repositories/setup";
import { reResolveRunBrands } from "@/modules/extraction/re-resolve";
import { listFindings } from "@/db/repositories/findings";
import { areMetricsStale, listMetrics, recomputeMetrics } from "@/db/repositories/metrics";
import { getRunFailureCounts, getRunMatrixKind } from "@/db/repositories/runner";
import { computeFindings } from "@/modules/analysis/findings";

const CLAIM_VERDICTS = ["supported", "contradicted", "outdated", "unsupported", "ambiguous", "not_checked"] as const;
const CLAIM_SEVERITIES = ["none", "low", "medium", "high"] as const;
type ClaimVerdict = (typeof CLAIM_VERDICTS)[number];
type ClaimSeverity = (typeof CLAIM_SEVERITIES)[number];

export type ReviewClaimInput =
  | { reviewState: "confirmed" }
  | { reviewState: "corrected"; operatorVerdict: ClaimVerdict; operatorSeverity: ClaimSeverity }
  | { reviewState: "unreviewed" };

type ActionResult = { ok: true } | { ok: false; error: string };

async function getDashboardRunForProject(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const run = await getRunForDashboard(runId);
  if (!run || run.projectId !== projectId) return null;
  if (run.state !== "completed" && run.state !== "paused") return null;
  return run;
}

/** SM-5 / D-024: operator review of a misinformation claim (confirm / correct / re-open). */
export async function reviewClaim(projectId: string, runId: string, claimId: string, input: ReviewClaimInput): Promise<ActionResult> {
  // Validate enum inputs server-side — this action sets values that end up
  // in the delivered evidence pack, so it never trusts the client blindly.
  if (!["confirmed", "corrected", "unreviewed"].includes(input.reviewState)) {
    return { ok: false, error: "Invalid review state" };
  }
  if (input.reviewState === "corrected") {
    if (!CLAIM_VERDICTS.includes(input.operatorVerdict) || !CLAIM_SEVERITIES.includes(input.operatorSeverity)) {
      return { ok: false, error: "Invalid verdict or severity" };
    }
  }
  if (!isUuid(claimId)) return { ok: false, error: "Invalid claim id" };
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return { ok: false, error: "Run not found for project" };
  const updated = await reviewClaimRepo(runId, claimId, input);
  if (updated === 0) return { ok: false, error: "Claim not found" };
  return { ok: true };
}

export async function fetchDashboardData(projectId: string, runId: string) {
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return null;

  // Self-heal stale metrics (C-5 idempotent): a completed run whose metrics
  // were built mid-extraction otherwise reads a stale/empty dashboard until a
  // report or the manual recompute button is triggered (D-044).
  if (await areMetricsStale(runId)) {
    await recomputeMetrics(runId);
  }

  // D-121: refresh audit findings through the same canonical function the
  // report uses — after metric self-heal — so claim-review changes surface
  // on the next dashboard fetch. Never for resonance runs (C-12).
  const kind = await getRunMatrixKind(runId);
  if (kind?.kind !== "resonance") {
    await computeFindings(runId);
  }

  const [brandRows, metricRows, misinformation, citedSources, failureCounts, personasMarkets, findings] =
    await Promise.all([
      getProjectBrandNames(run.projectId),
      listMetrics(runId),
      getMisinformationRegister(runId),
      getCitedSources(runId),
      getRunFailureCounts(runId),
      getProjectPersonasAndMarkets(run.projectId),
      kind?.kind === "resonance" ? Promise.resolve([]) : listFindings(runId),
    ]);

  return {
    run,
    brands: brandRows,
    metrics: metricRows,
    misinformation,
    citedSources,
    failureCounts,
    personasMarkets,
    findings,
  };
}

export async function fetchRunOptions(projectId: string) {
  if (!isUuid(projectId)) return [];
  return listCompletedRuns(projectId);
}

export async function fetchDrilldown(
  projectId: string,
  runId: string,
  filter: { intent?: string; personaId?: string; marketId?: string; providerId?: string; mode?: string },
) {
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return [];
  return getResponsesForScope(runId, filter);
}

export async function fetchMetricDrilldown(
  projectId: string,
  runId: string,
  filter: {
    metricKey: string;
    scopeType?: string;
    scopeKey?: string;
    intent?: string;
    personaId?: string;
    marketId?: string;
    providerId?: string;
    mode?: string;
  },
) {
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return [];
  return getResponsesForMetric(runId, filter);
}

export async function fetchResponseDetail(projectId: string, runId: string, responseId: string) {
  if (!isUuid(responseId)) return null;
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return null;
  return getResponseDetail(runId, responseId);
}

export async function fetchResponsesByIds(projectId: string, runId: string, responseIds: string[]) {
  if (responseIds.some((id) => !isUuid(id))) return [];
  const run = await getDashboardRunForProject(projectId, runId);
  if (!run) return [];
  return getResponsesByIds(runId, responseIds);
}

/** M45 / D-115: resolution-health card data. */
export async function fetchUnresolvedMentions(projectId: string, runId: string) {
  if (!isUuid(projectId) || !isUuid(runId)) return null;
  const run = await getRunForDashboard(runId);
  if (!run || run.projectId !== projectId) return null;
  const [summary, brandRows] = await Promise.all([
    getUnresolvedMentionSummary(runId),
    getProjectBrandNames(projectId),
  ]);
  return { summary, brands: brandRows };
}

/** M45 / D-115: re-run resolution under the CURRENT matcher/aliases — the
 * matcher-upgrade path, where the unresolved tail needs no alias at all. */
export async function reResolveRunAction(
  projectId: string,
  runId: string,
): Promise<{ ok: true; reResolved: number } | { ok: false; error: string }> {
  if (!isUuid(projectId) || !isUuid(runId)) return { ok: false, error: "Invalid id" };
  try {
    const summary = await reResolveRunBrands(projectId, runId);
    revalidatePath(`/projects/${projectId}/dashboard`);
    return { ok: true, reResolved: summary.reResolved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Re-resolve failed" };
  }
}

/**
 * M45 / D-115: one-click alias adoption — append the observed name as an
 * alias on the chosen brand (compact-collision guarded), then re-resolve the
 * run at $0 (new extraction versions, C-3) and recompute metrics.
 */
export async function adoptBrandAliasAction(
  projectId: string,
  runId: string,
  brandId: string,
  alias: string,
): Promise<{ ok: true; reResolved: number } | { ok: false; error: string }> {
  if (!isUuid(projectId) || !isUuid(runId) || !isUuid(brandId)) {
    return { ok: false, error: "Invalid id" };
  }
  const trimmed = alias.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return { ok: false, error: "Alias must be 1-120 characters" };
  }
  try {
    await addBrandAlias(projectId, brandId, trimmed);
    const summary = await reResolveRunBrands(projectId, runId);
    revalidatePath(`/projects/${projectId}/dashboard`);
    return { ok: true, reResolved: summary.reResolved };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Alias adoption failed" };
  }
}
