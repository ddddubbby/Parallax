import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCitedSources: vi.fn(),
  getMisinformationRegister: vi.fn(),
  getProjectBrandNames: vi.fn(),
  getProjectPersonasAndMarkets: vi.fn(),
  getResponseDetail: vi.fn(),
  getResponsesByIds: vi.fn(),
  getResponsesForMetric: vi.fn(),
  getResponsesForScope: vi.fn(),
  getRunForDashboard: vi.fn(),
  listMetrics: vi.fn(),
  getRunFailureCounts: vi.fn(),
  reviewClaimRepo: vi.fn(),
}));

vi.mock("@/db/repositories/dashboard", () => ({
  getCitedSources: mocks.getCitedSources,
  getMisinformationRegister: mocks.getMisinformationRegister,
  getProjectBrandNames: mocks.getProjectBrandNames,
  getProjectPersonasAndMarkets: mocks.getProjectPersonasAndMarkets,
  getResponseDetail: mocks.getResponseDetail,
  getResponsesByIds: mocks.getResponsesByIds,
  getResponsesForMetric: mocks.getResponsesForMetric,
  getResponsesForScope: mocks.getResponsesForScope,
  getRunForDashboard: mocks.getRunForDashboard,
  listCompletedRuns: vi.fn(),
  reviewClaim: mocks.reviewClaimRepo,
}));
vi.mock("@/db/repositories/metrics", () => ({
  listMetrics: mocks.listMetrics,
}));
vi.mock("@/db/repositories/runner", () => ({
  getRunFailureCounts: mocks.getRunFailureCounts,
}));

import {
  fetchDashboardData,
  fetchDrilldown,
  fetchMetricDrilldown,
  fetchResponseDetail,
  fetchResponsesByIds,
  reviewClaim,
} from "./actions";

describe("dashboard action id guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed project/run ids before dashboard repositories", async () => {
    const validRunId = "00000000-0000-4000-8000-000000000001";
    const validClaimId = "00000000-0000-4000-8000-000000000002";
    const validResponseId = "00000000-0000-4000-8000-000000000003";

    await expect(fetchDashboardData("project-id", validRunId)).resolves.toBeNull();
    await expect(fetchDrilldown("project-id", validRunId, {})).resolves.toEqual([]);
    await expect(fetchMetricDrilldown("project-id", validRunId, { metricKey: "mention_rate" })).resolves.toEqual([]);
    await expect(fetchResponseDetail("project-id", validRunId, validResponseId)).resolves.toBeNull();
    await expect(fetchResponsesByIds("project-id", validRunId, [validResponseId])).resolves.toEqual([]);
    await expect(reviewClaim("project-id", validRunId, validClaimId, { reviewState: "confirmed" })).resolves.toEqual({
      ok: false,
      error: "Run not found for project",
    });

    expect(mocks.getRunForDashboard).not.toHaveBeenCalled();
    expect(mocks.reviewClaimRepo).not.toHaveBeenCalled();
  });

  it("rejects in-progress dashboard runs before returning partial data or mutations", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const claimId = "00000000-0000-4000-8000-000000000003";
    const responseId = "00000000-0000-4000-8000-000000000004";
    mocks.getRunForDashboard.mockResolvedValue({ id: runId, projectId, state: "running" });

    await expect(fetchDashboardData(projectId, runId)).resolves.toBeNull();
    await expect(fetchDrilldown(projectId, runId, {})).resolves.toEqual([]);
    await expect(fetchMetricDrilldown(projectId, runId, { metricKey: "mention_rate" })).resolves.toEqual([]);
    await expect(fetchResponseDetail(projectId, runId, responseId)).resolves.toBeNull();
    await expect(fetchResponsesByIds(projectId, runId, [responseId])).resolves.toEqual([]);
    await expect(reviewClaim(projectId, runId, claimId, { reviewState: "confirmed" })).resolves.toEqual({
      ok: false,
      error: "Run not found for project",
    });

    expect(mocks.getProjectBrandNames).not.toHaveBeenCalled();
    expect(mocks.listMetrics).not.toHaveBeenCalled();
    expect(mocks.getResponsesForScope).not.toHaveBeenCalled();
    expect(mocks.getResponseDetail).not.toHaveBeenCalled();
    expect(mocks.reviewClaimRepo).not.toHaveBeenCalled();
  });
});
