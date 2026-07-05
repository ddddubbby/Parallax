"use server";

import { revalidatePath } from "next/cache";
import { parsePanelPersonaLines, STIMULUS_KINDS, type StimulusKind } from "@/core/resonance";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
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

export async function deleteStimulusAction(projectId: string, studyId: string, stimulusId: string) {
  await deleteResonanceStimulus(studyId, stimulusId);
  revalidatePath(`/projects/${projectId}/resonance`);
}

export async function approveStudyAction(projectId: string, studyId: string): Promise<ActionResult> {
  try {
    const version = await approveAndCompileResonanceStudy(projectId, studyId);
    revalidatePath(`/projects/${projectId}/resonance`);
    return { ok: true, id: version.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Study approval failed" };
  }
}

function unwrap(result: ActionResult) {
  if (!result.ok) throw new Error(result.error);
}

export async function createStudyFormAction(projectId: string, formData: FormData) {
  unwrap(await createStudyAction(projectId, formData));
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

export async function approveStudyFormAction(projectId: string, studyId: string) {
  unwrap(await approveStudyAction(projectId, studyId));
}
