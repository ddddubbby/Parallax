"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/core/id";
import {
  MESSAGE_LIFT_TEST_TYPES,
  parsePanelPersonaLines,
  recommendationScenariosSchema,
  STIMULUS_KINDS,
  type MessageLiftTestType,
  type StimulusKind,
} from "@/core/resonance";
import { getResonanceStudyTemplate } from "@/core/resonance-templates";
import {
  enqueueFramingObservations,
  resumeFramingObservationBatch,
} from "@/modules/framing/observations";
import {
  getActiveFramingBatchProgress,
  getFramingBatchProgress,
} from "@/db/repositories/framing-observations";
import type { FramingObservationBatchProgress } from "@/core/framing-batch";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  createResonanceStudyFromTemplate,
  deleteResonanceStimulus,
  updateResonanceStimulus,
  updateResonanceStudy,
  getMessageLiftPromptDisclosure,
  getResonanceStudy,
} from "@/db/repositories/resonance";

function revalidateStudyPaths(projectId: string, studyId?: string) {
  revalidatePath(`/projects/${projectId}/resonance`);
  if (studyId) revalidatePath(`/projects/${projectId}/resonance/${studyId}`);
}

type ActionResult =
  | { ok: true; id?: string; batchId?: string }
  | { ok: false; error: string };

/**
 * M46/D-117: atomically enqueue a persistent framing-observation batch.
 * The worker processes items; the study page polls progress. Rejects when an
 * active batch already exists. Explicit action — a page load never triggers
 * paid work.
 */
export async function buildFramingThemesAction(
  projectId: string,
  studyId?: string,
): Promise<ActionResult> {
  if (!isUuid(projectId) || (studyId !== undefined && !isUuid(studyId))) {
    return { ok: false, error: "Invalid id" };
  }
  try {
    const result = await enqueueFramingObservations(projectId);
    revalidateStudyPaths(projectId, studyId);
    return { ok: true, batchId: result.batchId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Framing extraction failed",
    };
  }
}

export async function fetchFramingBatchProgressAction(
  projectId: string,
  batchId: string,
): Promise<FramingObservationBatchProgress | null> {
  if (!isUuid(projectId) || !isUuid(batchId)) return null;
  const progress = await getFramingBatchProgress(batchId);
  if (!progress || progress.projectId !== projectId) return null;
  return progress;
}

export async function fetchActiveFramingBatchProgressAction(
  projectId: string,
): Promise<FramingObservationBatchProgress | null> {
  if (!isUuid(projectId)) return null;
  return getActiveFramingBatchProgress(projectId);
}

export async function resumeFramingBatchAction(
  projectId: string,
  batchId: string,
  studyId?: string,
): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(batchId) || (studyId !== undefined && !isUuid(studyId))) {
    return { ok: false, error: "Invalid id" };
  }
  const progress = await getFramingBatchProgress(batchId);
  if (!progress || progress.projectId !== projectId) {
    return { ok: false, error: "Framing batch not found" };
  }
  try {
    await resumeFramingObservationBatch(batchId);
    revalidateStudyPaths(projectId, studyId);
    return { ok: true, batchId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resume failed",
    };
  }
}

function validIds(...ids: string[]) {
  return ids.every(isUuid);
}

function textField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseKind(value: string): StimulusKind {
  if ((STIMULUS_KINDS as readonly string[]).includes(value)) return value as StimulusKind;
  throw new Error("Unknown stimulus kind");
}

function evidenceIds(formData: FormData) {
  return formData
    .getAll("evidenceResponseIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function framingSnapshotId(formData: FormData) {
  const value = textField(formData, "framingEvidenceSnapshotId");
  if (value && !isUuid(value)) throw new Error("Invalid framing evidence snapshot id");
  return value || null;
}

export async function createStudyAction(projectId: string, formData: FormData): Promise<ActionResult> {
  return createMessageLiftTestAction(projectId, formData);
}

export async function createMessageLiftTestAction(
  projectId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!validIds(projectId)) return { ok: false, error: "Invalid id" };
  try {
    const name = textField(formData, "name");
    if (!name) return { ok: false, error: "Test name is required" };
    const rawType = textField(formData, "testType") || "buyer_response";
    if (!(MESSAGE_LIFT_TEST_TYPES as readonly string[]).includes(rawType)) {
      return { ok: false, error: "Unknown Message Lift test type" };
    }
    const study = await createResonanceStudy(
      projectId,
      name,
      rawType as MessageLiftTestType,
      true,
    );
    revalidateStudyPaths(projectId, study.id);
    return { ok: true, id: study.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Study create failed" };
  }
}

export async function previewMessageLiftPromptsAction(projectId: string, studyId: string) {
  if (!validIds(projectId, studyId)) return null;
  return getMessageLiftPromptDisclosure(projectId, studyId);
}

export async function excludeRecommendationScenarioAction(
  projectId: string,
  studyId: string,
  contextKey: string,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId) || !contextKey) return { ok: false, error: "Invalid scenario" };
  try {
    const detail = await getResonanceStudy(projectId, studyId);
    if (!detail || detail.study.state !== "draft" || detail.study.testType !== "ai_recommendation") {
      return { ok: false, error: "Draft AI recommendation test not found" };
    }
    const scenarios = recommendationScenariosSchema
      .parse(detail.study.recommendationScenariosJson)
      .filter((scenario) => scenario.key !== contextKey);
    if (scenarios.length < 6) {
      return { ok: false, error: "Keep at least six shopping situations for a full test" };
    }
    await updateResonanceStudy(projectId, studyId, { recommendationScenarios: scenarios });
    revalidateStudyPaths(projectId, studyId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Scenario exclusion failed" };
  }
}

export async function createStudyFromTemplateAction(projectId: string, formData: FormData): Promise<ActionResult> {
  if (!validIds(projectId)) return { ok: false, error: "Invalid id" };
  try {
    const templateId = textField(formData, "templateId");
    const template = getResonanceStudyTemplate(templateId);
    if (!template) return { ok: false, error: "Unknown Resonance study template" };
    const study = await createResonanceStudyFromTemplate(projectId, template);
    revalidateStudyPaths(projectId, study.id);
    return { ok: true, id: study.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Study template create failed" };
  }
}

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId)) return { ok: false, error: "Invalid id" };
  try {
    const name = textField(formData, "name");
    if (!name) return { ok: false, error: "Study name is required" };
    const panelPersonas = parsePanelPersonaLines(textField(formData, "panelPersonas"));
    // M22 (D-078): genericUnconditioned is no longer settable through this
    // RPC endpoint — evidence-only is a hard rule with no toggle escape
    // (server actions are RPC endpoints; a UI-removed control is not a
    // guard on its own, D-071's C-4 lesson).
    const updated = await updateResonanceStudy(projectId, studyId, {
      name,
      panelPersonas,
    });
    if (updated === 0) return { ok: false, error: "Draft study not found" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Study update failed" };
  }
  revalidateStudyPaths(projectId, studyId);
  return { ok: true };
}

export async function addStimulusAction(
  projectId: string,
  studyId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId)) return { ok: false, error: "Invalid id" };
  try {
    const label = textField(formData, "label");
    const body = textField(formData, "body");
    if (!label || !body) return { ok: false, error: "Stimulus label and body are required" };
    const evidenceResponseIds = evidenceIds(formData);
    if (!validIds(...evidenceResponseIds)) return { ok: false, error: "Invalid evidence response id" };
    const stimulus = await addResonanceStimulus({
      projectId,
      studyId,
      kind: parseKind(textField(formData, "kind")),
      label,
      body,
      evidenceResponseIds,
      framingEvidenceSnapshotId: framingSnapshotId(formData),
      baselineThemeKey: textField(formData, "baselineThemeKey") || null,
    });
    revalidateStudyPaths(projectId, studyId);
    return { ok: true, id: stimulus.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stimulus create failed" };
  }
}

export async function updateStimulusAction(
  projectId: string,
  studyId: string,
  stimulusId: string,
  formData: FormData,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId, stimulusId)) return { ok: false, error: "Invalid id" };
  try {
    const label = textField(formData, "label");
    const body = textField(formData, "body");
    if (!label || !body) return { ok: false, error: "Stimulus label and body are required" };
    const evidenceResponseIds = evidenceIds(formData);
    if (!validIds(...evidenceResponseIds)) return { ok: false, error: "Invalid evidence response id" };
    const updated = await updateResonanceStimulus({
      projectId,
      studyId,
      stimulusId,
      kind: parseKind(textField(formData, "kind")),
      label,
      body,
      evidenceResponseIds,
      framingEvidenceSnapshotId: framingSnapshotId(formData),
      baselineThemeKey: textField(formData, "baselineThemeKey") || null,
    });
    if (updated === 0) return { ok: false, error: "Stimulus not found" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stimulus update failed" };
  }
  revalidateStudyPaths(projectId, studyId);
  return { ok: true };
}

export async function deleteStimulusAction(
  projectId: string,
  studyId: string,
  stimulusId: string,
): Promise<ActionResult> {
  if (!validIds(projectId, studyId, stimulusId)) return { ok: false, error: "Invalid id" };
  try {
    const deleted = await deleteResonanceStimulus(projectId, studyId, stimulusId);
    if (deleted === 0) return { ok: false, error: "Stimulus not found" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stimulus delete failed" };
  }
  revalidateStudyPaths(projectId, studyId);
  return { ok: true };
}

export async function approveStudyAction(projectId: string, studyId: string): Promise<ActionResult> {
  if (!validIds(projectId, studyId)) return { ok: false, error: "Invalid id" };
  try {
    const version = await approveAndCompileResonanceStudy(projectId, studyId);
    revalidateStudyPaths(projectId, studyId);
    return { ok: true, id: version.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Study approval failed";
    // A concurrent audit-matrix draft or study approval for the same project
    // can grab the same next version number under READ COMMITTED; surface a
    // retry hint instead of the raw Postgres unique-constraint text.
    if (/matrix_versions_project_version|duplicate key/i.test(message)) {
      return { ok: false, error: "Another matrix version was created at the same time — reload and approve again." };
    }
    return { ok: false, error: message };
  }
}

function unwrap(result: ActionResult) {
  if (!result.ok) throw new Error(result.error);
}

export async function createStudyFormAction(projectId: string, formData: FormData) {
  const result = await createStudyAction(projectId, formData);
  if (!result.ok) throw new Error(result.error);
  if (!result.id) throw new Error("Study create failed");
  redirect(`/projects/${projectId}/resonance/${result.id}?view=design`);
}

export async function createStudyFromTemplateFormAction(projectId: string, formData: FormData) {
  const result = await createStudyFromTemplateAction(projectId, formData);
  if (!result.ok) throw new Error(result.error);
  if (!result.id) throw new Error("Study template create failed");
  redirect(`/projects/${projectId}/resonance/${result.id}?view=design`);
}

export async function updateStudyFormAction(projectId: string, studyId: string, formData: FormData) {
  unwrap(await updateStudyAction(projectId, studyId, formData));
}

export async function addStimulusFormAction(projectId: string, studyId: string, formData: FormData) {
  unwrap(await addStimulusAction(projectId, studyId, formData));
}

export async function updateStimulusFormAction(
  projectId: string,
  studyId: string,
  stimulusId: string,
  formData: FormData,
) {
  unwrap(await updateStimulusAction(projectId, studyId, stimulusId, formData));
}

export async function deleteStimulusFormAction(projectId: string, studyId: string, stimulusId: string) {
  unwrap(await deleteStimulusAction(projectId, studyId, stimulusId));
}

export async function approveStudyFormAction(projectId: string, studyId: string) {
  unwrap(await approveStudyAction(projectId, studyId));
}
