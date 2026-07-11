import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addResonanceStimulus: vi.fn(),
  approveAndCompileResonanceStudy: vi.fn(),
  createResonanceStudy: vi.fn(),
  createResonanceStudyFromTemplate: vi.fn(),
  deleteResonanceStimulus: vi.fn(),
  updateResonanceStimulus: vi.fn(),
  updateResonanceStudy: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/resonance", () => ({
  addResonanceStimulus: mocks.addResonanceStimulus,
  approveAndCompileResonanceStudy: mocks.approveAndCompileResonanceStudy,
  createResonanceStudy: mocks.createResonanceStudy,
  createResonanceStudyFromTemplate: mocks.createResonanceStudyFromTemplate,
  deleteResonanceStimulus: mocks.deleteResonanceStimulus,
  updateResonanceStimulus: mocks.updateResonanceStimulus,
  updateResonanceStudy: mocks.updateResonanceStudy,
}));

import {
  addStimulusAction,
  approveStudyAction,
  createStudyAction,
  createStudyFromTemplateAction,
  deleteStimulusAction,
  updateStimulusAction,
  updateStudyAction,
} from "./actions";

const VALID_ID = "00000000-0000-4000-8000-000000000000";

describe("resonance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed ids before repository calls can cast them as UUIDs", async () => {
    const form = new FormData();
    form.set("name", "Study");
    form.set("templateId", "ai_framing_repair");
    form.set("kind", "custom");
    form.set("label", "Variant A");
    form.set("body", "Stimulus body");

    await expect(createStudyAction("bad-project", form)).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(createStudyFromTemplateAction("bad-project", form)).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(updateStudyAction(VALID_ID, "bad-study", form)).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(addStimulusAction("bad-project", VALID_ID, form)).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(updateStimulusAction(VALID_ID, VALID_ID, "bad-stimulus", form)).resolves.toEqual({
      ok: false,
      error: "Invalid id",
    });
    await expect(deleteStimulusAction(VALID_ID, VALID_ID, "bad-stimulus")).resolves.toEqual({
      ok: false,
      error: "Invalid id",
    });
    await expect(approveStudyAction(VALID_ID, "bad-study")).resolves.toEqual({ ok: false, error: "Invalid id" });
    expect(mocks.createResonanceStudy).not.toHaveBeenCalled();
    expect(mocks.createResonanceStudyFromTemplate).not.toHaveBeenCalled();
  });

  it("rejects malformed evidence response ids before stimulus repository mutation", async () => {
    const form = new FormData();
    form.set("kind", "custom");
    form.set("label", "Variant A");
    form.set("body", "Stimulus body");
    form.append("evidenceResponseIds", "not-a-response-id");

    await expect(addStimulusAction(VALID_ID, VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Invalid evidence response id",
    });
    await expect(updateStimulusAction(VALID_ID, VALID_ID, VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Invalid evidence response id",
    });
  });

  it("rejects malformed framing snapshot ids before stimulus repository mutation", async () => {
    const form = new FormData();
    form.set("kind", "measured_ai");
    form.set("label", "Measured baseline");
    form.set("body", "Verbatim response");
    form.set("framingEvidenceSnapshotId", "not-a-snapshot-id");

    await expect(addStimulusAction(VALID_ID, VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Invalid framing evidence snapshot id",
    });
    await expect(updateStimulusAction(VALID_ID, VALID_ID, VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Invalid framing evidence snapshot id",
    });
    expect(mocks.addResonanceStimulus).not.toHaveBeenCalled();
    expect(mocks.updateResonanceStimulus).not.toHaveBeenCalled();
  });

  it("rejects direct study updates with an empty name before repository mutation", async () => {
    const form = new FormData();
    form.set("name", "");
    form.set("panelPersonas", "Budget holder | 35-44 | $100k-$150k | Singapore | Compares vendors");

    const result = await updateStudyAction(VALID_ID, VALID_ID, form);

    expect(result).toEqual({ ok: false, error: "Study name is required" });
  });

  it("rejects direct stimulus updates with empty text before repository mutation", async () => {
    const form = new FormData();
    form.set("kind", "custom");
    form.set("label", "Variant A");
    form.set("body", "");

    const result = await updateStimulusAction(VALID_ID, VALID_ID, VALID_ID, form);

    expect(result).toEqual({ ok: false, error: "Stimulus label and body are required" });
  });

  it("returns a controlled error when direct study creation fails", async () => {
    const form = new FormData();
    form.set("name", "Study");
    mocks.createResonanceStudy.mockRejectedValue(new Error("Project not found"));

    await expect(createStudyAction(VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Project not found",
    });
  });

  it("returns a controlled error when template study creation fails", async () => {
    const form = new FormData();
    form.set("templateId", "ai_framing_repair");
    mocks.createResonanceStudyFromTemplate.mockRejectedValue(new Error("Project not found"));

    await expect(createStudyFromTemplateAction(VALID_ID, form)).resolves.toEqual({
      ok: false,
      error: "Project not found",
    });
  });
});
