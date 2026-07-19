import { and, asc, eq, isNull, max } from "drizzle-orm";
import type { BrandTerms } from "@/core/matrix";
import { db } from "../client";
import { attributes, brands, factClaims, markets, personas, projects } from "../schema";
import { findCompactKeyCollisions } from "@/core/brand-matching";

// M27 (D-084): post-intake Setup editing. Every mutation here is either an
// UPDATE keyed by the existing row id (identity preserved, no FK ever
// orphaned) or an INSERT; "removal" is archive (brands/personas/markets:
// archived_at = now(); fact claims: status = 'archived', reusing the
// pre-existing factClaimStatus enum) or, for attributes only, a real DELETE
// — attributes carry no FK anywhere (matched by name string, never by id),
// confirmed against every schema file, so no archive concept is needed
// there. The client brand can never be archived (server-enforced below).
// Every mutation touches projects.setup_updated_at so the matrix board can
// detect a stale draft (pinned decision 7).

async function touchSetup(projectId: string) {
  await db
    .update(projects)
    .set({ setupUpdatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export async function getProjectSetup(projectId: string) {
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      category: projects.category,
      categoryArchetype: projects.categoryArchetype,
      jobToBeDone: projects.jobToBeDone,
      setupUpdatedAt: projects.setupUpdatedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;

  const [projectBrands, projectPersonas, projectMarkets, projectAttributes, projectFactClaims] =
    await Promise.all([
      db
        .select()
        .from(brands)
        .where(eq(brands.projectId, projectId))
        .orderBy(asc(brands.role), asc(brands.priority)),
      db
        .select()
        .from(personas)
        .where(eq(personas.projectId, projectId))
        .orderBy(asc(personas.priority)),
      db
        .select()
        .from(markets)
        .where(eq(markets.projectId, projectId))
        .orderBy(asc(markets.priority)),
      db
        .select()
        .from(attributes)
        .where(eq(attributes.projectId, projectId))
        .orderBy(asc(attributes.priority)),
      db
        .select()
        .from(factClaims)
        .where(eq(factClaims.projectId, projectId))
        .orderBy(asc(factClaims.createdAt)),
    ]);

  return {
    project,
    brands: projectBrands,
    personas: projectPersonas,
    markets: projectMarkets,
    attributes: projectAttributes,
    factClaims: projectFactClaims,
  };
}

/** Active (non-archived) tracked brand terms — the PM-9 scan input for the
 *  basics-save warning (pinned decision 6b): reuses the same core scanner
 *  the intake review step and matrix approval gate already use. */
export async function getActiveBrandTerms(projectId: string): Promise<BrandTerms[]> {
  const rows = await db
    .select({ name: brands.name, aliasesJson: brands.aliasesJson })
    .from(brands)
    .where(and(eq(brands.projectId, projectId), isNull(brands.archivedAt)));
  return rows.map((r) => ({ name: r.name, aliases: (r.aliasesJson as string[]) ?? [] }));
}

export async function updateBasics(
  projectId: string,
  input: { name: string; category: string; categoryArchetype: "b2b" | "consumer_product" | "consumer_venue"; jobToBeDone: string },
) {
  const updated = await db
    .update(projects)
    .set({
      name: input.name,
      category: input.category,
      categoryArchetype: input.categoryArchetype,
      jobToBeDone: input.jobToBeDone,
      setupUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.status, "active")))
    .returning({ id: projects.id });
  return updated.length;
}

// --- Brands (client + competitors) -----------------------------------

/**
 * M45 / D-115: two tracked brands must never share a compact key — it is the
 * one configuration compact matching cannot disambiguate ("Go Pro" and
 * "GoPro" as separate brands). Checked on every brand write; archived brands
 * are exempt (they are out of the tracked set).
 */
async function assertNoBrandCompactCollision(
  projectId: string,
  candidate: { brandId?: string; name: string; aliases: string[] },
) {
  const rows = await db
    .select({ id: brands.id, name: brands.name, aliasesJson: brands.aliasesJson, archivedAt: brands.archivedAt })
    .from(brands)
    .where(eq(brands.projectId, projectId));
  const termSets = rows
    .filter((r) => r.archivedAt === null && r.id !== candidate.brandId)
    .map((r) => ({ id: r.id, name: r.name, aliases: (r.aliasesJson as string[]) ?? [] }));
  termSets.push({ id: candidate.brandId ?? "candidate", name: candidate.name, aliases: candidate.aliases });
  const collisions = findCompactKeyCollisions(termSets).filter((c) =>
    c.names.includes(candidate.name),
  );
  if (collisions.length > 0) {
    const first = collisions[0];
    throw new Error(
      `"${first.names.join('" and "')}" are the same name once spacing/punctuation is ignored ("${first.key}") — the matcher cannot tell them apart. Merge them into one brand with an alias instead (D-115).`,
    );
  }
}

/** M45: append one alias to a tracked brand (guarded, deduplicated). */
export async function addBrandAlias(projectId: string, brandId: string, alias: string) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.projectId, projectId)));
  if (!brand) throw new Error("Brand not found in this project");
  const aliases = (brand.aliasesJson as string[]) ?? [];
  if (aliases.some((a) => a.trim().toLowerCase() === alias.trim().toLowerCase())) return 0;
  const next = [...aliases, alias.trim()];
  await assertNoBrandCompactCollision(projectId, { brandId, name: brand.name, aliases: next });
  await db
    .update(brands)
    .set({ aliasesJson: next, updatedAt: new Date() })
    .where(eq(brands.id, brandId));
  await touchSetup(projectId);
  return 1;
}

export async function addCompetitor(
  projectId: string,
  input: { name: string; aliases: string[]; domain?: string | null },
) {
  await assertNoBrandCompactCollision(projectId, { name: input.name, aliases: input.aliases });
  const [{ next }] = await db
    .select({ next: max(brands.priority) })
    .from(brands)
    .where(and(eq(brands.projectId, projectId), eq(brands.role, "competitor")));
  const [row] = await db
    .insert(brands)
    .values({
      projectId,
      role: "competitor",
      name: input.name,
      domain: input.domain ?? null,
      aliasesJson: input.aliases,
      priority: (next ?? -1) + 1,
    })
    .returning({ id: brands.id });
  await touchSetup(projectId);
  return row.id;
}

export async function updateBrand(
  projectId: string,
  brandId: string,
  input: { name: string; aliases: string[]; domain?: string | null; description?: string | null },
) {
  await assertNoBrandCompactCollision(projectId, { brandId, name: input.name, aliases: input.aliases });
  const updated = await db
    .update(brands)
    .set({
      name: input.name,
      aliasesJson: input.aliases,
      domain: input.domain ?? null,
      ...(input.description !== undefined && { description: input.description }),
      updatedAt: new Date(),
    })
    .where(and(eq(brands.id, brandId), eq(brands.projectId, projectId)))
    .returning({ id: brands.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

/** The client brand can never be archived (pinned decision 3, server-enforced). */
export async function archiveBrand(projectId: string, brandId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [brand] = await db
    .select({ role: brands.role })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.projectId, projectId)));
  if (!brand) return { ok: false, error: "Brand not found" };
  if (brand.role === "client") return { ok: false, error: "The client brand cannot be archived" };
  await db
    .update(brands)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brands.id, brandId), eq(brands.projectId, projectId)));
  await touchSetup(projectId);
  return { ok: true };
}

export async function unarchiveBrand(projectId: string, brandId: string) {
  const updated = await db
    .update(brands)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(brands.id, brandId), eq(brands.projectId, projectId)))
    .returning({ id: brands.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

// --- Personas -----------------------------------------------------------

export async function addPersona(
  projectId: string,
  input: { title: string; companyContext?: string | null; painPoints: string[]; buyingCriteria: string[] },
) {
  const [{ next }] = await db
    .select({ next: max(personas.priority) })
    .from(personas)
    .where(eq(personas.projectId, projectId));
  const [row] = await db
    .insert(personas)
    .values({
      projectId,
      title: input.title,
      companyContext: input.companyContext ?? null,
      painPointsJson: input.painPoints,
      buyingCriteriaJson: input.buyingCriteria,
      priority: (next ?? -1) + 1,
    })
    .returning({ id: personas.id });
  await touchSetup(projectId);
  return row.id;
}

export async function updatePersona(
  projectId: string,
  personaId: string,
  input: { title: string; companyContext?: string | null; painPoints: string[]; buyingCriteria: string[] },
) {
  const updated = await db
    .update(personas)
    .set({
      title: input.title,
      companyContext: input.companyContext ?? null,
      painPointsJson: input.painPoints,
      buyingCriteriaJson: input.buyingCriteria,
      updatedAt: new Date(),
    })
    .where(and(eq(personas.id, personaId), eq(personas.projectId, projectId)))
    .returning({ id: personas.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function archivePersona(projectId: string, personaId: string) {
  const updated = await db
    .update(personas)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(personas.id, personaId), eq(personas.projectId, projectId)))
    .returning({ id: personas.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function unarchivePersona(projectId: string, personaId: string) {
  const updated = await db
    .update(personas)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(personas.id, personaId), eq(personas.projectId, projectId)))
    .returning({ id: personas.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

// --- Markets --------------------------------------------------------------

export async function addMarket(projectId: string, name: string) {
  const [{ next }] = await db
    .select({ next: max(markets.priority) })
    .from(markets)
    .where(eq(markets.projectId, projectId));
  const [row] = await db
    .insert(markets)
    .values({ projectId, name, priority: (next ?? -1) + 1 })
    .returning({ id: markets.id });
  await touchSetup(projectId);
  return row.id;
}

export async function updateMarket(projectId: string, marketId: string, name: string) {
  const updated = await db
    .update(markets)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(markets.id, marketId), eq(markets.projectId, projectId)))
    .returning({ id: markets.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function archiveMarket(projectId: string, marketId: string) {
  const updated = await db
    .update(markets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(markets.id, marketId), eq(markets.projectId, projectId)))
    .returning({ id: markets.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function unarchiveMarket(projectId: string, marketId: string) {
  const updated = await db
    .update(markets)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(markets.id, marketId), eq(markets.projectId, projectId)))
    .returning({ id: markets.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

// --- Attributes -------------------------------------------------------
// No archive concept: attributes carry no FK anywhere (matched by name
// string only, never by id — confirmed against every schema file), so a
// real delete orphans nothing. Renaming does NOT retroactively re-tag
// historical extractions already tagged under the old canonical name
// (forward-only effects, same discipline as the archived tables).

export async function addAttribute(projectId: string, name: string) {
  const [{ next }] = await db
    .select({ next: max(attributes.priority) })
    .from(attributes)
    .where(eq(attributes.projectId, projectId));
  const [row] = await db
    .insert(attributes)
    .values({ projectId, name, priority: (next ?? -1) + 1 })
    .returning({ id: attributes.id });
  await touchSetup(projectId);
  return row.id;
}

export async function updateAttribute(projectId: string, attributeId: string, name: string) {
  const updated = await db
    .update(attributes)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(attributes.id, attributeId), eq(attributes.projectId, projectId)))
    .returning({ id: attributes.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function deleteAttribute(projectId: string, attributeId: string) {
  const deleted = await db
    .delete(attributes)
    .where(and(eq(attributes.id, attributeId), eq(attributes.projectId, projectId)))
    .returning({ id: attributes.id });
  if (deleted.length > 0) await touchSetup(projectId);
  return deleted.length;
}

// --- Fact sheet ---------------------------------------------------------
// claims_found.fact_claim_id references fact_claims.id with no cascade, so a
// real DELETE would throw an FK violation (23503) once any claim references
// it (confirmed against migration 0000). Removal always archives via the
// pre-existing factClaimStatus enum (active/archived) instead.

export async function addFactClaim(
  projectId: string,
  input: { type: string; statement: string; sourceNote?: string | null; sourceUrl?: string | null },
) {
  const [row] = await db
    .insert(factClaims)
    .values({
      projectId,
      type: input.type as (typeof factClaims.$inferInsert)["type"],
      statement: input.statement,
      sourceNote: input.sourceNote ?? null,
      sourceUrl: input.sourceUrl ?? null,
    })
    .returning({ id: factClaims.id });
  await touchSetup(projectId);
  return row.id;
}

export async function updateFactClaim(
  projectId: string,
  factClaimId: string,
  input: { type: string; statement: string; sourceNote?: string | null; sourceUrl?: string | null },
) {
  const updated = await db
    .update(factClaims)
    .set({
      type: input.type as (typeof factClaims.$inferInsert)["type"],
      statement: input.statement,
      sourceNote: input.sourceNote ?? null,
      sourceUrl: input.sourceUrl ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(factClaims.id, factClaimId), eq(factClaims.projectId, projectId)))
    .returning({ id: factClaims.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function archiveFactClaim(projectId: string, factClaimId: string) {
  const updated = await db
    .update(factClaims)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(factClaims.id, factClaimId), eq(factClaims.projectId, projectId)))
    .returning({ id: factClaims.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}

export async function unarchiveFactClaim(projectId: string, factClaimId: string) {
  const updated = await db
    .update(factClaims)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(factClaims.id, factClaimId), eq(factClaims.projectId, projectId)))
    .returning({ id: factClaims.id });
  if (updated.length > 0) await touchSetup(projectId);
  return updated.length;
}
