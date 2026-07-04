"use server";

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
import { listMetrics } from "@/db/repositories/metrics";
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

/** SM-5 / D-024: operator review of a misinformation claim (confirm / correct / re-open). */
export async function reviewClaim(claimId: string, input: ReviewClaimInput): Promise<ActionResult> {
  // Validate enum inputs server-side — this action sets values that end up
  // in the delivered evidence pack, so it never trusts the client blindly.
  if (input.reviewState === "corrected") {
    if (!CLAIM_VERDICTS.includes(input.operatorVerdict) || !CLAIM_SEVERITIES.includes(input.operatorSeverity)) {
      return { ok: false, error: "Invalid verdict or severity" };
    }
  }
  const updated = await reviewClaimRepo(claimId, input);
  if (updated === 0) return { ok: false, error: "Claim not found" };
  return { ok: true };
}

export async function fetchDashboardData(runId: string) {
  const run = await getRunForDashboard(runId);
  if (!run) return null;

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
  return listCompletedRuns(projectId);
}

export async function fetchDrilldown(
  runId: string,
  filter: { intent?: string; personaId?: string; marketId?: string; providerId?: string; mode?: string },
) {
  return getResponsesForScope(runId, filter);
}

export async function fetchMetricDrilldown(
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
  return getResponsesForMetric(runId, filter);
}

export async function fetchResponseDetail(responseId: string) {
  return getResponseDetail(responseId);
}

export async function fetchResponsesByIds(responseIds: string[]) {
  return getResponsesByIds(responseIds);
}
