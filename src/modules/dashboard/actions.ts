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
  listCompletedRuns,
  reviewClaim as reviewClaimRepo,
} from "@/db/repositories/dashboard";
import { areMetricsStale, listMetrics, recomputeMetrics } from "@/db/repositories/metrics";
import { getRunFailureCounts } from "@/db/repositories/runner";

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

  const [brandRows, metricRows, misinformation, citedSources, failureCounts, personasMarkets] = await Promise.all([
    getProjectBrandNames(run.projectId),
    listMetrics(runId),
    getMisinformationRegister(runId),
    getCitedSources(runId),
    getRunFailureCounts(runId),
    getProjectPersonasAndMarkets(run.projectId),
  ]);

  return { run, brands: brandRows, metrics: metricRows, misinformation, citedSources, failureCounts, personasMarkets };
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
