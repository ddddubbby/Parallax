"use server";

import { revalidatePath } from "next/cache";
import { parsePanelPersonaLines, STIMULUS_KINDS, type StimulusKind } from "@/core/resonance";
import { getResonanceStudyTemplate } from "@/core/resonance-templates";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  createResonanceStudyFromTemplate,
  deleteResonanceStimulus,
  updateResonanceStimulus,
  updateResonanceStudy,
} from "@/db/repositories/resonance";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

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

export async function createStudyAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const name = textField(formData, "name");
  if (!name) return { ok: false, error: "Study name is required" };
  const study = await createResonanceStudy(projectId, name);
  revalidatePath(`/projects/${projectId}/resonance`);
  return { ok: true, id: study.id };
}

export async function createStudyFromTemplateAction(projectId: string, formData: FormData): Promise<ActionResult> {
  const templateId = textField(formData, "templateId");
  const template = getResonanceStudyTemplate(templateId);
  if (!template) return { ok: false, error: "Unknown Resonance study template" };
  const study = await createResonanceStudyFromTemplate(projectId, template);
  revalidatePath(`/projects/${projectId}/resonance`);
  return { ok: true, id: study.id };
}

export async function updateStudyAction(
  projectId: string,
  studyId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const name = textField(formData, "name");
    const panelPersonas = parsePanelPersonaLines(textField(formData, "panelPersonas"));
    const updated = await updateResonanceStudy(projectId, studyId, {
      name,
      panelPersonas,
      genericUnconditioned: formData.get("genericUnconditioned") === "on",
    });
    if (updated === 0) return { ok: false, error: "Draft study not found" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Study update failed" };
  }
  revalidatePath(`/projects/${projectId}/resonance`);
  return { ok: true };
}

export async function addStimulusAction(
  projectId: string,
  studyId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const label = textField(formData, "label");
    const body = textField(formData, "body");
    if (!label || !body) return { ok: false, error: "Stimulus label and body are required" };
    const stimulus = await addResonanceStimulus({
      studyId,
      kind: parseKind(textField(formData, "kind")),
      label,
      body,
      evidenceResponseIds: evidenceIds(formData),
    });
    revalidatePath(`/projects/${projectId}/resonance`);
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
  try {
    const updated = await updateResonanceStimulus({
      studyId,
      stimulusId,
      kind: parseKind(textField(formData, "kind")),
      label: textField(formData, "label"),
      body: textField(formData, "body"),
      evidenceResponseIds: evidenceIds(formData),
    });
    if (updated === 0) return { ok: false, error: "Stimulus not found" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stimulus update failed" };
  }
  revalidatePath(`/projects/${projectId}/resonance`);
  return { ok: true };
}

export async function deleteStimulusAction(
  projectId: string,
  studyId: string,
  stimulusId: string,
): Promise<ActionResult> {
  try {
    await deleteResonanceStimulus(studyId, stimulusId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stimulus delete failed" };
  }
  revalidatePath(`/projects/${projectId}/resonance`);
  return { ok: true };
}

export async function approveStudyAction(projectId: string, studyId: string): Promise<ActionResult> {
  try {
    const version = await approveAndCompileResonanceStudy(projectId, studyId);
    revalidatePath(`/projects/${projectId}/resonance`);
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
  unwrap(await createStudyAction(projectId, formData));
}

export async function createStudyFromTemplateFormAction(projectId: string, formData: FormData) {
  unwrap(await createStudyFromTemplateAction(projectId, formData));
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
