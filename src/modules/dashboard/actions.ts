"use server";

import {
  getCitedSources,
  getMisinformationRegister,
  getProjectBrandNames,
  getProjectPersonasAndMarkets,
  getResponseDetail,
  getResponsesByIds,
  getResponsesForScope,
  getRunForDashboard,
  listCompletedRuns,
} from "@/db/repositories/dashboard";
import { listMetrics } from "@/db/repositories/metrics";
import { getRunFailureCounts } from "@/db/repositories/runner";

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

export async function fetchResponseDetail(responseId: string) {
  return getResponseDetail(responseId);
}

export async function fetchResponsesByIds(responseIds: string[]) {
  return getResponsesByIds(responseIds);
}
