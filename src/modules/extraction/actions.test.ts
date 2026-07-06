import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  reExtractResponse: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/extraction", () => ({
  getExtractionProgress: vi.fn(),
  listDeadLetteredExtractions: vi.fn(),
}));
vi.mock("@/db/repositories/metrics", () => ({
  listMetrics: vi.fn(),
}));
vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
}));
vi.mock("./service", () => ({
  reExtractResponse: mocks.reExtractResponse,
}));

import { fetchExtractionAndMetrics, reExtract } from "./actions";

describe("extraction action id guards", () => {
  it("rejects malformed ids before DB-backed repositories", async () => {
    await expect(reExtract("not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid response id" });
    await expect(fetchExtractionAndMetrics("project-id", "not-a-uuid")).resolves.toBeNull();
    await expect(fetchExtractionAndMetrics("project-id", "00000000-0000-4000-8000-000000000001")).resolves.toBeNull();
    expect(mocks.reExtractResponse).not.toHaveBeenCalled();
    expect(mocks.getRun).not.toHaveBeenCalled();
  });
});
