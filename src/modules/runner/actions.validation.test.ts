import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const VALID_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const VALID_RUN_ID = "00000000-0000-4000-8000-000000000002";

describe("runner action input validation", () => {
  it("rejects malformed matrix version ids before UUID-backed DB queries", async () => {
    const { createRun, projectRunCost } = await import("./actions");
    const input = {
      matrixVersionId: "not-a-uuid",
      runMode: "mock" as const,
      providers: ["mock" as const],
      modes: ["ungrounded" as const],
      repetitions: 1,
      costCapUsd: 25,
    };

    await expect(projectRunCost(VALID_PROJECT_ID, input)).resolves.toMatchObject({
      ok: false,
      error: "Invalid matrix version id",
    });
    await expect(createRun(VALID_PROJECT_ID, input)).resolves.toEqual({
      ok: false,
      error: "Invalid matrix version id",
    });
  });

  it("rejects malformed project ids on lifecycle reads and mutations", async () => {
    const { cancelRun, fetchRunDetail, pauseRun, resumeRun } = await import("./actions");

    await expect(pauseRun("not-a-uuid", VALID_RUN_ID)).resolves.toEqual({
      ok: false,
      error: "Invalid project or run id",
    });
    await expect(resumeRun("not-a-uuid", VALID_RUN_ID)).resolves.toEqual({
      ok: false,
      error: "Invalid project or run id",
    });
    await expect(cancelRun("not-a-uuid", VALID_RUN_ID)).resolves.toEqual({
      ok: false,
      error: "Invalid project or run id",
    });
    await expect(fetchRunDetail("not-a-uuid", VALID_RUN_ID)).resolves.toBeNull();
  });
});
