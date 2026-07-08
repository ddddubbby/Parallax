"use server";

import { revalidatePath } from "next/cache";
import { findBrandTerms, findBusinessVoicePhrases } from "@/core/matrix";
import { isUuid } from "@/core/id";
import {
  setupAttributeSchema,
  setupBasicsSchema,
  setupClientBrandSchema,
  setupCompetitorSchema,
  setupFactClaimSchema,
  setupMarketSchema,
  setupPersonaSchema,
} from "@/core/setup";
import {
  addAttribute,
  addCompetitor,
  addFactClaim,
  addMarket,
  addPersona,
  archiveBrand,
  archiveFactClaim,
  archiveMarket,
  archivePersona,
  deleteAttribute,
  getActiveBrandTerms,
  unarchiveBrand,
  unarchiveFactClaim,
  unarchiveMarket,
  unarchivePersona,
  updateAttribute,
  updateBasics,
  updateBrand,
  updateFactClaim,
  updateMarket,
  updatePersona,
} from "@/db/repositories/setup";

// M27 (D-084): post-intake Setup editing server actions. Every mutation is
// an UPDATE keyed by an existing row id or an INSERT; "removal" archives
// (never deletes a row any FK might reference — see setup.ts's repo-level
// header comment for the per-table rationale). Zod-validates every input
// server-side, reusing intake's exact schemas where the field set matches
// (core/setup.ts).

type ActionResult = { ok: true } | { ok: false; error: string };
type BasicsResult = ActionResult & { warning?: string };

function firstFieldError(err: { issues: Array<{ message: string }> }): string {
  return err.issues[0]?.message ?? "Invalid input";
}

function revalidateSetup(projectId: string) {
  revalidatePath(`/projects/${projectId}/setup`);
  revalidatePath(`/projects/${projectId}/matrix`);
}

/** PM-9/D-046 (pinned decision 6b): re-run the same core scan the intake
 *  review step and matrix approval gate use, against the CURRENT active
 *  brand roster. Never blocks the save — basics are legitimately
 *  interpolated into branded intents; this only warns. */
async function scanBasicsForBrandTerms(projectId: string, category: string, jobToBeDone: string): Promise<string | undefined> {
  const brandTerms = await getActiveBrandTerms(projectId);
  const hits = [
    { label: "buyer's goal", terms: findBrandTerms(jobToBeDone, brandTerms) },
    { label: "category", terms: findBrandTerms(category, brandTerms) },
  ].filter((f) => f.terms.length > 0);
  if (hits.length === 0) return undefined;
  const first = hits[0];
  return `PM-9 — ${first.label} contains tracked brand terms: ${first.terms.join(", ")}${hits.length > 1 ? ` (+${hits.length - 1} more field)` : ""}. Discovery/consideration prompts must stay brand-free.`;
}

/** M28 (D-085): PM-9's "other half" — a job_to_be_done written as a
 *  business/marketing objective instead of the buyer's own goal. Sibling
 *  check to scanBasicsForBrandTerms, same warn-never-block treatment,
 *  same warning slot; combined below when both fire. */
function scanBasicsForBusinessVoice(jobToBeDone: string): string | undefined {
  const hits = findBusinessVoicePhrases(jobToBeDone);
  if (hits.length === 0) return undefined;
  return `Buyer-voice — buyer's goal reads like a business objective, not the buyer's own goal: ${hits.join(", ")}. Templates interpolate this field as what the BUYER wants (e.g. "night street photography"), never a growth/market objective.`;
}

export async function updateBasicsAction(projectId: string, input: unknown): Promise<BasicsResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupBasicsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateBasics(projectId, {
    name: parsed.data.name,
    category: parsed.data.category,
    categoryArchetype: parsed.data.category_archetype,
    jobToBeDone: parsed.data.job_to_be_done,
  });
  if (updated === 0) return { ok: false, error: "Project not found or not yet active" };
  // Both checks share the same warning slot (BasicsResult.warning); when
  // both fire, the messages are concatenated with a space (each is already
  // a complete, period-terminated sentence) rather than picking one.
  const brandWarning = await scanBasicsForBrandTerms(projectId, parsed.data.category, parsed.data.job_to_be_done);
  const voiceWarning = scanBasicsForBusinessVoice(parsed.data.job_to_be_done);
  const warning = [brandWarning, voiceWarning].filter(Boolean).join(" ") || undefined;
  revalidateSetup(projectId);
  return { ok: true, ...(warning && { warning }) };
}

// --- Brands ---------------------------------------------------------------

export async function addCompetitorAction(projectId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupCompetitorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  try {
    await addCompetitor(projectId, parsed.data);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Add competitor failed" };
  }
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updateClientBrandAction(projectId: string, brandId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(brandId)) return { ok: false, error: "Invalid id" };
  const parsed = setupClientBrandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateBrand(projectId, brandId, parsed.data);
  if (updated === 0) return { ok: false, error: "Brand not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updateCompetitorAction(projectId: string, brandId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(brandId)) return { ok: false, error: "Invalid id" };
  const parsed = setupCompetitorSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateBrand(projectId, brandId, parsed.data);
  if (updated === 0) return { ok: false, error: "Brand not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function archiveBrandAction(projectId: string, brandId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(brandId)) return { ok: false, error: "Invalid id" };
  const result = await archiveBrand(projectId, brandId);
  if (!result.ok) return result;
  revalidateSetup(projectId);
  return { ok: true };
}

export async function unarchiveBrandAction(projectId: string, brandId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(brandId)) return { ok: false, error: "Invalid id" };
  const updated = await unarchiveBrand(projectId, brandId);
  if (updated === 0) return { ok: false, error: "Brand not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

// --- Personas ---------------------------------------------------------

export async function addPersonaAction(projectId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupPersonaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  await addPersona(projectId, {
    title: parsed.data.title,
    companyContext: parsed.data.company_context,
    painPoints: parsed.data.pain_points,
    buyingCriteria: parsed.data.buying_criteria,
  });
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updatePersonaAction(projectId: string, personaId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(personaId)) return { ok: false, error: "Invalid id" };
  const parsed = setupPersonaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updatePersona(projectId, personaId, {
    title: parsed.data.title,
    companyContext: parsed.data.company_context,
    painPoints: parsed.data.pain_points,
    buyingCriteria: parsed.data.buying_criteria,
  });
  if (updated === 0) return { ok: false, error: "Persona not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function archivePersonaAction(projectId: string, personaId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(personaId)) return { ok: false, error: "Invalid id" };
  const updated = await archivePersona(projectId, personaId);
  if (updated === 0) return { ok: false, error: "Persona not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function unarchivePersonaAction(projectId: string, personaId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(personaId)) return { ok: false, error: "Invalid id" };
  const updated = await unarchivePersona(projectId, personaId);
  if (updated === 0) return { ok: false, error: "Persona not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

// --- Markets ------------------------------------------------------------

export async function addMarketAction(projectId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupMarketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  try {
    await addMarket(projectId, parsed.data.name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Add market failed" };
  }
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updateMarketAction(projectId: string, marketId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(marketId)) return { ok: false, error: "Invalid id" };
  const parsed = setupMarketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateMarket(projectId, marketId, parsed.data.name);
  if (updated === 0) return { ok: false, error: "Market not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function archiveMarketAction(projectId: string, marketId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(marketId)) return { ok: false, error: "Invalid id" };
  const updated = await archiveMarket(projectId, marketId);
  if (updated === 0) return { ok: false, error: "Market not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function unarchiveMarketAction(projectId: string, marketId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(marketId)) return { ok: false, error: "Invalid id" };
  const updated = await unarchiveMarket(projectId, marketId);
  if (updated === 0) return { ok: false, error: "Market not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

// --- Attributes -----------------------------------------------------------

export async function addAttributeAction(projectId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupAttributeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  try {
    await addAttribute(projectId, parsed.data.name);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Add attribute failed" };
  }
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updateAttributeAction(projectId: string, attributeId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(attributeId)) return { ok: false, error: "Invalid id" };
  const parsed = setupAttributeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateAttribute(projectId, attributeId, parsed.data.name);
  if (updated === 0) return { ok: false, error: "Attribute not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function deleteAttributeAction(projectId: string, attributeId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(attributeId)) return { ok: false, error: "Invalid id" };
  const deleted = await deleteAttribute(projectId, attributeId);
  if (deleted === 0) return { ok: false, error: "Attribute not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

// --- Fact sheet -----------------------------------------------------------

export async function addFactClaimAction(projectId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId)) return { ok: false, error: "Invalid id" };
  const parsed = setupFactClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  await addFactClaim(projectId, {
    type: parsed.data.type,
    statement: parsed.data.statement,
    sourceNote: parsed.data.source_note,
    sourceUrl: parsed.data.source_url,
  });
  revalidateSetup(projectId);
  return { ok: true };
}

export async function updateFactClaimAction(projectId: string, factClaimId: string, input: unknown): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(factClaimId)) return { ok: false, error: "Invalid id" };
  const parsed = setupFactClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstFieldError(parsed.error) };
  const updated = await updateFactClaim(projectId, factClaimId, {
    type: parsed.data.type,
    statement: parsed.data.statement,
    sourceNote: parsed.data.source_note,
    sourceUrl: parsed.data.source_url,
  });
  if (updated === 0) return { ok: false, error: "Fact claim not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function archiveFactClaimAction(projectId: string, factClaimId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(factClaimId)) return { ok: false, error: "Invalid id" };
  const updated = await archiveFactClaim(projectId, factClaimId);
  if (updated === 0) return { ok: false, error: "Fact claim not found" };
  revalidateSetup(projectId);
  return { ok: true };
}

export async function unarchiveFactClaimAction(projectId: string, factClaimId: string): Promise<ActionResult> {
  if (!isUuid(projectId) || !isUuid(factClaimId)) return { ok: false, error: "Invalid id" };
  const updated = await unarchiveFactClaim(projectId, factClaimId);
  if (updated === 0) return { ok: false, error: "Fact claim not found" };
  revalidateSetup(projectId);
  return { ok: true };
}
