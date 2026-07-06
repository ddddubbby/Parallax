import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  recomputeMetricsRepo: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
}));
vi.mock("@/db/repositories/metrics", () => ({
  recomputeMetrics: mocks.recomputeMetricsRepo,
}));

import { recomputeMetrics } from "./actions";

describe("analysis action id guards", () => {
  it("rejects malformed project/run ids before DB-backed repositories", async () => {
    await expect(recomputeMetrics("project-id", "not-a-uuid")).resolves.toEqual({
      ok: false,
      error: "Invalid project or run id",
    });
    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.recomputeMetricsRepo).not.toHaveBeenCalled();
  });
});
