import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  reExtractResponse: vi.fn(),
  assertDeadLetterOwnedByRun: vi.fn(),
  listDeadLettersForRun: vi.fn(),
  getExtractionProgress: vi.fn(),
  listMetrics: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db/repositories/extraction", () => ({
  getExtractionProgress: mocks.getExtractionProgress,
  listDeadLetteredExtractions: vi.fn(),
  listDeadLettersForRun: mocks.listDeadLettersForRun,
  assertDeadLetterOwnedByRun: mocks.assertDeadLetterOwnedByRun,
}));
vi.mock("@/db/repositories/metrics", () => ({
  listMetrics: mocks.listMetrics,
}));
vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
}));
vi.mock("./service", () => ({
  reExtractResponse: mocks.reExtractResponse,
}));

import { fetchExtractionAndMetrics, reExtract, reExtractForRun } from "./actions";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const RUN = "00000000-0000-4000-8000-000000000002";
const RESPONSE = "00000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extraction action id guards", () => {
  it("rejects malformed ids before DB-backed repositories", async () => {
    await expect(reExtract("not-a-uuid")).resolves.toEqual({ ok: false, error: "Invalid response id" });
    await expect(fetchExtractionAndMetrics("project-id", "not-a-uuid")).resolves.toBeNull();
    await expect(fetchExtractionAndMetrics("project-id", PROJECT)).resolves.toBeNull();
    expect(mocks.reExtractResponse).not.toHaveBeenCalled();
    expect(mocks.getRun).not.toHaveBeenCalled();
  });
});

describe("reExtractForRun ownership", () => {
  it("rejects cross-project or non-dead-letter responses before extract", async () => {
    mocks.assertDeadLetterOwnedByRun.mockResolvedValueOnce({
      ok: false,
      error: "Response is not part of this project run",
    });
    await expect(reExtractForRun(PROJECT, RUN, RESPONSE)).resolves.toEqual({
      ok: false,
      error: "Response is not part of this project run",
    });
    expect(mocks.reExtractResponse).not.toHaveBeenCalled();
  });

  it("revalidates the run route after a successful owned re-extract", async () => {
    mocks.assertDeadLetterOwnedByRun.mockResolvedValueOnce({ ok: true });
    mocks.reExtractResponse.mockResolvedValueOnce({ outcome: "valid", attempts: 1 });
    await expect(reExtractForRun(PROJECT, RUN, RESPONSE)).resolves.toEqual({ ok: true });
    expect(mocks.reExtractResponse).toHaveBeenCalledWith(RESPONSE);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT}/runs/${RUN}`);
  });

  it("returns ownership lookup failures as an action result", async () => {
    mocks.assertDeadLetterOwnedByRun.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(reExtractForRun(PROJECT, RUN, RESPONSE)).resolves.toEqual({
      ok: false,
      error: "database unavailable",
    });
    expect(mocks.reExtractResponse).not.toHaveBeenCalled();
  });
});
