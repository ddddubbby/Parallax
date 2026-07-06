"use server";

import { randomBytes } from "node:crypto";
import {
  type FieldErrors,
  INTAKE_STEPS,
  type IntakeDraft,
  type IntakeStepKey,
  REVIEW_STEP,
  isIntakeStepKey,
  slugify,
  validateStep,
} from "@/core/intake";
import { isUuid } from "@/core/id";
import type { NormalizedIntake } from "@/db/repositories/intake";
import {
  completeIntake as completeIntakeRepo,
  createDraftProject,
  getProjectIntake,
  updateDraft,
} from "@/db/repositories/intake";

interface SaveResult {
  projectId: string | null;
  savedAt: string | null;
}

const CREATE_DRAFT_ATTEMPTS = 3;

function draftName(draft: IntakeDraft): string {
  const basics = draft.basics as { name?: string } | undefined;
  return basics?.name?.trim() ?? "";
}

async function createDraftProjectWithRetry(input: { name: string; draft: IntakeDraft; intakeStep: number }) {
  let lastError: unknown;
  for (let attempt = 0; attempt < CREATE_DRAFT_ATTEMPTS; attempt++) {
    try {
      return await createDraftProject({
        ...input,
        slug: slugify(input.name, randomBytes(6).toString("hex")),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not create draft project");
}

/**
 * PS-2 autosave: persist raw step values without validation. Creates the
 * draft project on the first save that carries a project name.
 */
export async function autosaveStep(
  projectId: string | null,
  stepKey: IntakeStepKey | string,
  payload: unknown,
): Promise<SaveResult> {
  if (!isIntakeStepKey(stepKey)) return { projectId: null, savedAt: null };
  if (projectId && !isUuid(projectId)) return { projectId: null, savedAt: null };
  if (projectId) {
    const project = await getProjectIntake(projectId);
    if (!project) return { projectId: null, savedAt: null };
    if (project.status !== "draft") return { projectId: null, savedAt: null };
    const draft = { ...(project.intakeDraftJson as IntakeDraft), [stepKey]: payload };
    const name = draftName(draft);
    const updated = await updateDraft(projectId, { draft, ...(name && { name }) });
    if (updated === 0) return { projectId: null, savedAt: null };
    return { projectId, savedAt: new Date().toISOString() };
  }
  const draft: IntakeDraft = { [stepKey]: payload };
  const name = draftName(draft);
  if (!name) return { projectId: null, savedAt: null };
  try {
    const id = await createDraftProjectWithRetry({ name, draft, intakeStep: 1 });
    return { projectId: id, savedAt: new Date().toISOString() };
  } catch {
    return { projectId: null, savedAt: null };
  }
}

export type StepResult =
  | { ok: true; projectId: string }
  | { ok: false; fieldErrors: FieldErrors };

/**
 * PS-3: strict server-side validation gates step advancement; field-level
 * errors come back keyed by path.
 */
export async function completeStep(
  projectId: string | null,
  stepKey: IntakeStepKey | string,
  payload: unknown,
): Promise<StepResult> {
  const result = validateStep(stepKey, payload);
  if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };

  const saved = await autosaveStep(projectId, stepKey, payload);
  if (!saved.projectId) {
    return { ok: false, fieldErrors: { _root: ["Could not save draft"] } };
  }
  const project = await getProjectIntake(saved.projectId);
  if (!project || project.status !== "draft") {
    return { ok: false, fieldErrors: { _root: ["Could not save draft"] } };
  }
  const stepNumber = INTAKE_STEPS.find((s) => s.key === stepKey)?.step ?? 1;
  const nextStep = Math.min(
    Math.max(project.intakeStep, stepNumber + 1),
    REVIEW_STEP,
  );
  const updated = await updateDraft(saved.projectId, {
    draft: {
      ...(project.intakeDraftJson as IntakeDraft),
      [stepKey]: result.data,
    },
    intakeStep: nextStep,
  });
  if (updated === 0) {
    return { ok: false, fieldErrors: { _root: ["Could not save draft"] } };
  }
  return { ok: true, projectId: saved.projectId };
}

export type CompleteIntakeResult =
  | { ok: true }
  | { ok: false; stepErrors: Partial<Record<IntakeStepKey, FieldErrors>> };

/** Review "Complete": re-validate every step from the stored draft, then normalize (D-026). */
export async function finishIntake(
  projectId: string,
): Promise<CompleteIntakeResult> {
  if (!isUuid(projectId)) return { ok: false, stepErrors: {} };
  const project = await getProjectIntake(projectId);
  if (!project) return { ok: false, stepErrors: {} };
  if (project.status !== "draft") return { ok: false, stepErrors: {} };
  const draft = (project.intakeDraftJson as IntakeDraft) ?? {};

  const stepErrors: Partial<Record<IntakeStepKey, FieldErrors>> = {};
  const parsed: Partial<Record<IntakeStepKey, unknown>> = {};
  for (const { key } of INTAKE_STEPS) {
    const result = validateStep(key, draft[key] ?? {});
    if (result.ok) parsed[key] = result.data;
    else stepErrors[key] = result.fieldErrors;
  }
  if (Object.keys(stepErrors).length > 0) return { ok: false, stepErrors };

  const data: NormalizedIntake = {
    basics: parsed.basics as NormalizedIntake["basics"],
    clientBrand: parsed.client_brand as NormalizedIntake["clientBrand"],
    competitors: (parsed.competitors as { competitors: NormalizedIntake["competitors"] })
      .competitors,
    factSheet: parsed.fact_sheet as NormalizedIntake["factSheet"],
    attributes: (parsed.attributes as { attributes: string[] }).attributes,
    personas: (parsed.personas as { personas: NormalizedIntake["personas"] }).personas,
    markets: (parsed.markets as { markets: string[] }).markets,
  };
  await completeIntakeRepo(projectId, data);
  return { ok: true };
}
