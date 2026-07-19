import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createSnapshot: vi.fn(),
  saveCodebook: vi.fn(),
  lockCodebook: vi.fn(),
  reveal: vi.fn(),
  saveReview: vi.fn(),
  complete: vi.fn(),
  saveGaps: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/db/repositories/framing", () => ({
  createFramingStudy: mocks.create,
  createFramingEvidenceSnapshot: mocks.createSnapshot,
  saveFramingCodebookDraft: mocks.saveCodebook,
  lockFramingCodebook: mocks.lockCodebook,
  revealFramingPositioning: mocks.reveal,
  saveFramingResponseReview: mocks.saveReview,
  completeFramingReview: mocks.complete,
  saveFramingGapClassifications: mocks.saveGaps,
}));

import {
  completeFramingReviewAction,
  createFramingEvidenceSnapshotAction,
  createFramingStudyAction,
  lockFramingCodebookAction,
  revealFramingPositioningAction,
  saveFramingCodebookAction,
  saveFramingGapsAction,
  saveFramingResponseReviewAction,
} from "./actions";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";
const STUDY_ID = "00000000-0000-4000-8000-000000000003";
const REVIEW_ID = "00000000-0000-4000-8000-000000000004";
const ANNOTATION_ID = "00000000-0000-4000-8000-000000000005";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000006";
const GAP_ID = "00000000-0000-4000-8000-000000000007";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: STUDY_ID });
  mocks.createSnapshot.mockResolvedValue({ snapshot: { id: SNAPSHOT_ID } });
  mocks.saveCodebook.mockResolvedValue({ id: STUDY_ID });
  mocks.lockCodebook.mockResolvedValue({ id: STUDY_ID });
  mocks.reveal.mockResolvedValue({ id: STUDY_ID });
  mocks.saveReview.mockResolvedValue({ id: REVIEW_ID });
  mocks.complete.mockResolvedValue({ id: STUDY_ID });
  mocks.saveGaps.mockResolvedValue(1);
});

describe("framing action RPC boundaries", () => {
  it("rejects malformed ownership ids before repository access", async () => {
    // M44 / D-114: creation is retired at the boundary — before any id work.
    await expect(createFramingStudyAction("bad", RUN_ID)).resolves.toEqual({
      ok: false,
      error: "The Framing Evidence codebook workflow is retired (D-114) — pick a Simulation baseline directly from stored responses instead",
    });
    await expect(lockFramingCodebookAction(PROJECT_ID, "bad", true)).resolves.toEqual({
      ok: false,
      error: "Invalid id",
    });
    await expect(
      createFramingEvidenceSnapshotAction(PROJECT_ID, STUDY_ID, "bad", GAP_ID),
    ).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(
      saveFramingResponseReviewAction({
        projectId: PROJECT_ID,
        studyId: STUDY_ID,
        reviewId: "bad",
        outcome: "none",
        reviewedBy: "analyst",
        annotations: [],
      }),
    ).resolves.toEqual({ ok: false, error: "Invalid id" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.lockCodebook).not.toHaveBeenCalled();
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });

  it("threads valid writes through ownership-scoped repositories and revalidates", async () => {
    // M44 / D-114: even well-formed create requests are refused — the codebook
    // workflow is retired; every other action still threads through.
    await expect(createFramingStudyAction(PROJECT_ID, RUN_ID)).resolves.toEqual({
      ok: false,
      error: "The Framing Evidence codebook workflow is retired (D-114) — pick a Simulation baseline directly from stored responses instead",
    });
    await expect(
      saveFramingCodebookAction({
        projectId: PROJECT_ID,
        studyId: STUDY_ID,
        createdBy: "analyst",
        associations: [
          { associationId: "durability", label: "Durability", definition: "Durable equipment." },
        ],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(lockFramingCodebookAction(PROJECT_ID, STUDY_ID, true)).resolves.toEqual({ ok: true });
    await expect(
      revealFramingPositioningAction({
        projectId: PROJECT_ID,
        studyId: STUDY_ID,
        positioningText: "Positioning",
        revealedBy: "analyst",
        reviewerIdentity: "analyst",
        reviewMethod: "single_analyst",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      saveFramingResponseReviewAction({
        projectId: PROJECT_ID,
        studyId: STUDY_ID,
        reviewId: REVIEW_ID,
        outcome: "none",
        reviewedBy: "analyst",
        annotations: [],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(completeFramingReviewAction(PROJECT_ID, STUDY_ID)).resolves.toEqual({ ok: true });
    await expect(
      createFramingEvidenceSnapshotAction(PROJECT_ID, STUDY_ID, ANNOTATION_ID, GAP_ID),
    ).resolves.toEqual({ ok: true, id: SNAPSHOT_ID });
    await expect(
      saveFramingGapsAction({
        projectId: PROJECT_ID,
        studyId: STUDY_ID,
        classifiedBy: "analyst",
        gapOutcome: "actionable_gap_identified",
        gaps: [
          {
            classification: "missing",
            associationId: null,
            missingTarget: "Target",
            rationale: "Not observed",
            factReferences: [],
          },
        ],
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/framing`);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/projects/${PROJECT_ID}/framing/${STUDY_ID}`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/resonance`);
  });

  it("returns repository gate failures without bypassing them", async () => {
    mocks.lockCodebook.mockRejectedValueOnce(new Error("Only a draft codebook can be locked"));
    await expect(lockFramingCodebookAction(PROJECT_ID, STUDY_ID, true)).resolves.toEqual({
      ok: false,
      error: "Only a draft codebook can be locked",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
