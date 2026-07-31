import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRunForDashboard: vi.fn(),
  getProjectBrandNames: vi.fn(),
  getMisinformationRegister: vi.fn(),
  getCitedSources: vi.fn(),
  getRunFailureCounts: vi.fn(),
  getProjectPersonasAndMarkets: vi.fn(),
  areMetricsStale: vi.fn(),
  recomputeMetrics: vi.fn(),
  listMetrics: vi.fn(),
  getRunMatrixKind: vi.fn(),
  computeFindings: vi.fn(),
  listFindings: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/dashboard", () => ({
  getRunForDashboard: mocks.getRunForDashboard,
  getProjectBrandNames: mocks.getProjectBrandNames,
  getMisinformationRegister: mocks.getMisinformationRegister,
  getCitedSources: mocks.getCitedSources,
  getProjectPersonasAndMarkets: mocks.getProjectPersonasAndMarkets,
  getResponseDetail: vi.fn(),
  getResponsesByIds: vi.fn(),
  getResponsesForMetric: vi.fn(),
  getResponsesForScope: vi.fn(),
  getUnresolvedMentionSummary: vi.fn(),
  listCompletedRuns: vi.fn(),
  reviewClaim: vi.fn(),
}));
vi.mock("@/db/repositories/metrics", () => ({
  areMetricsStale: mocks.areMetricsStale,
  recomputeMetrics: mocks.recomputeMetrics,
  listMetrics: mocks.listMetrics,
}));
vi.mock("@/db/repositories/runner", () => ({
  getRunFailureCounts: mocks.getRunFailureCounts,
  getRunMatrixKind: mocks.getRunMatrixKind,
}));
vi.mock("@/db/repositories/findings", () => ({
  listFindings: mocks.listFindings,
}));
vi.mock("@/db/repositories/setup", () => ({ addBrandAlias: vi.fn() }));
vi.mock("@/modules/extraction/re-resolve", () => ({ reResolveRunBrands: vi.fn() }));
vi.mock("@/modules/analysis/findings", () => ({
  computeFindings: mocks.computeFindings,
}));

import { fetchDashboardData } from "./actions";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";

describe("fetchDashboardData findings freshness (D-121)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRunForDashboard.mockResolvedValue({
      id: RUN_ID,
      projectId: PROJECT_ID,
      state: "completed",
    });
    mocks.areMetricsStale.mockResolvedValue(true);
    mocks.getProjectBrandNames.mockResolvedValue([]);
    mocks.listMetrics.mockResolvedValue([]);
    mocks.getMisinformationRegister.mockResolvedValue([]);
    mocks.getCitedSources.mockResolvedValue([]);
    mocks.getRunFailureCounts.mockResolvedValue({
      succeeded: 0,
      deadLettered: 0,
      cancelled: 0,
    });
    mocks.getProjectPersonasAndMarkets.mockResolvedValue({
      personas: [],
      markets: [],
    });
    mocks.listFindings.mockResolvedValue([]);
  });

  it("self-heals metrics, then recomputes and returns fresh audit findings", async () => {
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "audit" });
    mocks.listFindings.mockResolvedValue([{ id: "fresh-finding" }]);

    const result = await fetchDashboardData(PROJECT_ID, RUN_ID);

    expect(result?.findings).toEqual([{ id: "fresh-finding" }]);
    expect(mocks.recomputeMetrics).toHaveBeenCalledWith(RUN_ID);
    expect(mocks.computeFindings).toHaveBeenCalledWith(RUN_ID);
    expect(mocks.recomputeMetrics.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.computeFindings.mock.invocationCallOrder[0],
    );
    expect(mocks.computeFindings.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listFindings.mock.invocationCallOrder[0],
    );
  });

  it("never computes or lists audit findings for resonance runs (C-12)", async () => {
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "resonance" });

    const result = await fetchDashboardData(PROJECT_ID, RUN_ID);

    expect(result?.findings).toEqual([]);
    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.listFindings).not.toHaveBeenCalled();
  });
});
