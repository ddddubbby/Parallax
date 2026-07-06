import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeIntake: vi.fn(),
  createDraftProject: vi.fn(),
  getProjectIntake: vi.fn(),
  updateDraft: vi.fn(),
}));

vi.mock("@/db/repositories/intake", () => ({
  completeIntake: mocks.completeIntake,
  createDraftProject: mocks.createDraftProject,
  getProjectIntake: mocks.getProjectIntake,
  updateDraft: mocks.updateDraft,
}));

import { autosaveStep, completeStep } from "./actions";

const BASICS = {
  name: "Boundary Intake",
  category_archetype: "b2b",
  category: "Accounts payable automation",
  job_to_be_done: "Compare AI visibility across payment workflow tools",
};

describe("intake action persistence boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries first draft creation when the generated slug collides once", async () => {
    mocks.createDraftProject
      .mockRejectedValueOnce(new Error("duplicate key value violates unique constraint projects_slug_unique"))
      .mockResolvedValueOnce("00000000-0000-4000-8000-000000000001");

    await expect(autosaveStep(null, "basics", BASICS)).resolves.toMatchObject({
      projectId: "00000000-0000-4000-8000-000000000001",
    });

    expect(mocks.createDraftProject).toHaveBeenCalledTimes(2);
  });

  it("returns an unsaved result if a draft update races with project activation", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    mocks.getProjectIntake.mockResolvedValue({
      id: projectId,
      status: "draft",
      intakeDraftJson: { basics: BASICS },
    });
    mocks.updateDraft.mockResolvedValue(0);

    await expect(autosaveStep(projectId, "basics", { ...BASICS, name: "Race" })).resolves.toEqual({
      projectId: null,
      savedAt: null,
    });
  });

  it("fails step completion if the validated write loses the draft-only race", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    mocks.getProjectIntake.mockResolvedValue({
      id: projectId,
      status: "draft",
      intakeStep: 1,
      intakeDraftJson: { basics: BASICS },
    });
    mocks.updateDraft.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(completeStep(projectId, "basics", BASICS)).resolves.toEqual({
      ok: false,
      fieldErrors: { _root: ["Could not save draft"] },
    });
  });
});
