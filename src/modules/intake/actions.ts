"use server";

import { randomBytes } from "node:crypto";
import {
  type FieldErrors,
  INTAKE_STEPS,
  type IntakeDraft,
  type IntakeStepKey,
  REVIEW_STEP,
  slugify,
  validateStep,
} from "@/core/intake";
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

function draftName(draft: IntakeDraft): string {
  const basics = draft.basics as { name?: string } | undefined;
  return basics?.name?.trim() ?? "";
}

/**
 * PS-2 autosave: persist raw step values without validation. Creates the
 * draft project on the first save that carries a project name.
 */
export async function autosaveStep(
  projectId: string | null,
  stepKey: IntakeStepKey,
  payload: unknown,
): Promise<SaveResult> {
  if (projectId) {
    const project = await getProjectIntake(projectId);
    if (!project) return { projectId: null, savedAt: null };
    const draft = { ...(project.intakeDraftJson as IntakeDraft), [stepKey]: payload };
    const name = draftName(draft);
    await updateDraft(projectId, { draft, ...(name && { name }) });
    return { projectId, savedAt: new Date().toISOString() };
  }
  const draft: IntakeDraft = { [stepKey]: payload };
  const name = draftName(draft);
  if (!name) return { projectId: null, savedAt: null };
  const id = await createDraftProject({
    name,
    slug: slugify(name, randomBytes(2).toString("hex")),
    draft,
    intakeStep: 1,
  });
  return { projectId: id, savedAt: new Date().toISOString() };
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
  stepKey: IntakeStepKey,
  payload: unknown,
): Promise<StepResult> {
  const result = validateStep(stepKey, payload);
  if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };

  const saved = await autosaveStep(projectId, stepKey, payload);
  if (!saved.projectId) {
    return { ok: false, fieldErrors: { _root: ["Could not save draft"] } };
  }
  const project = await getProjectIntake(saved.projectId);
  const stepNumber = INTAKE_STEPS.find((s) => s.key === stepKey)?.step ?? 1;
  const nextStep = Math.min(
    Math.max(project?.intakeStep ?? 1, stepNumber + 1),
    REVIEW_STEP,
  );
  await updateDraft(saved.projectId, {
    draft: {
      ...((project?.intakeDraftJson as IntakeDraft) ?? {}),
      [stepKey]: result.data,
    },
    intakeStep: nextStep,
  });
  return { ok: true, projectId: saved.projectId };
}

export type CompleteIntakeResult =
  | { ok: true }
  | { ok: false; stepErrors: Partial<Record<IntakeStepKey, FieldErrors>> };

/** Review "Complete": re-validate every step from the stored draft, then normalize (D-026). */
export async function finishIntake(
  projectId: string,
): Promise<CompleteIntakeResult> {
  const project = await getProjectIntake(projectId);
  if (!project) return { ok: false, stepErrors: {} };
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
