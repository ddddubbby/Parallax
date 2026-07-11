"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CodebookAssociation } from "@/core/framing-evidence";
import { isUuid } from "@/core/id";
import {
  completeFramingReview,
  createFramingEvidenceSnapshot,
  createFramingStudy,
  lockFramingCodebook,
  revealFramingPositioning,
  saveFramingCodebookDraft,
  saveFramingGapClassifications,
  saveFramingResponseReview,
  type FramingGapInput,
  type FramingGapOutcome,
  type FramingReviewAnnotationInput,
} from "@/db/repositories/framing";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function validIds(...ids: string[]) {
  return ids.every(isUuid);
}

function errorResult(error: unknown, fallback: string): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

function revalidateFraming(projectId: string, studyId?: string) {
  revalidatePath(`/projects/${projectId}/framing`);
  if (studyId) revalidatePath(`/projects/${projectId}/framing/${studyId}`);
}

export async function createFramingStudyAction(
  projectId: string,
  sourceRunId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, sourceRunId)) return { ok: false, error: "Invalid id" };
  try {
    const study = await createFramingStudy(projectId, sourceRunId);
    revalidateFraming(projectId, study.id);
    return { ok: true, id: study.id };
  } catch (error) {
    return errorResult(error, "Framing study create failed");
  }
}

export async function createFramingEvidenceSnapshotAction(
  projectId: string,
  studyId: string,
  annotationId: string,
  gapClassificationId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId, annotationId, gapClassificationId)) return { ok: false, error: "Invalid id" };
  try {
    const { snapshot } = await createFramingEvidenceSnapshot({
      projectId,
      studyId,
      annotationId,
      gapClassificationId,
    });
    revalidateFraming(projectId, studyId);
    revalidatePath(`/projects/${projectId}/resonance`);
    return { ok: true, id: snapshot.id };
  } catch (error) {
    return errorResult(error, "Simulation evidence snapshot failed");
  }
}

export async function saveFramingCodebookAction(input: {
  projectId: string;
  studyId: string;
  createdBy: string;
  associations: CodebookAssociation[];
}): Promise<ActionResult> {
  if (!validIds(input.projectId, input.studyId)) return { ok: false, error: "Invalid id" };
  try {
    await saveFramingCodebookDraft(input);
    revalidateFraming(input.projectId, input.studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Codebook save failed");
  }
}

export async function lockFramingCodebookAction(
  projectId: string,
  studyId: string,
  discoveryAttested: boolean,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId)) return { ok: false, error: "Invalid id" };
  try {
    await lockFramingCodebook(projectId, studyId, discoveryAttested);
    revalidateFraming(projectId, studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Codebook lock failed");
  }
}

export async function revealFramingPositioningAction(input: {
  projectId: string;
  studyId: string;
  positioningText: string;
  revealedBy: string;
  reviewerIdentity: string;
  reviewMethod: string;
}): Promise<ActionResult> {
  if (!validIds(input.projectId, input.studyId)) return { ok: false, error: "Invalid id" };
  try {
    await revealFramingPositioning(input);
    revalidateFraming(input.projectId, input.studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Positioning reveal failed");
  }
}

export async function saveFramingResponseReviewAction(input: {
  projectId: string;
  studyId: string;
  reviewId: string;
  outcome: string;
  reviewedBy: string;
  note?: string | null;
  annotations: FramingReviewAnnotationInput[];
}): Promise<ActionResult> {
  if (!validIds(input.projectId, input.studyId, input.reviewId)) {
    return { ok: false, error: "Invalid id" };
  }
  try {
    await saveFramingResponseReview(input);
    revalidateFraming(input.projectId, input.studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Response review save failed");
  }
}

export async function completeFramingReviewAction(
  projectId: string,
  studyId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId)) return { ok: false, error: "Invalid id" };
  try {
    await completeFramingReview(projectId, studyId);
    revalidateFraming(projectId, studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Review completion failed");
  }
}

export async function saveFramingGapsAction(input: {
  projectId: string;
  studyId: string;
  classifiedBy: string;
  gapOutcome: FramingGapOutcome;
  gaps: FramingGapInput[];
}): Promise<ActionResult> {
  if (!validIds(input.projectId, input.studyId)) return { ok: false, error: "Invalid id" };
  try {
    await saveFramingGapClassifications(input);
    revalidateFraming(input.projectId, input.studyId);
    return { ok: true };
  } catch (error) {
    return errorResult(error, "Gap classification save failed");
  }
}

export async function createFramingStudyFormAction(projectId: string, formData: FormData) {
  const sourceRunId = String(formData.get("sourceRunId") ?? "");
  const result = await createFramingStudyAction(projectId, sourceRunId);
  if (!result.ok) throw new Error(result.error);
  if (!result.id) throw new Error("Framing study create failed");
  redirect(`/projects/${projectId}/framing/${result.id}`);
}
