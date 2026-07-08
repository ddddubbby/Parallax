import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { allocateMatrix } from "@/core/matrix";
import { db, pool } from "@/db/client";
import { createDraftVersion, getMatrixInputs, getMarketLabelsForProject, getPersonaLabelsForProject } from "@/db/repositories/matrix";
import { forceDeleteMatrixVersions } from "@/db/repositories/matrix.test-helpers";
import {
  addCompetitor,
  addMarket,
  addPersona,
  archiveBrand,
  archiveMarket,
  archivePersona,
  getActiveBrandTerms,
  getProjectSetup,
  unarchiveMarket,
  updateBasics,
  updateBrand,
  updateMarket,
  updatePersona,
} from "@/db/repositories/setup";
import { attributes, brands, markets, matrixVersions, personas, projects, promptCells } from "@/db/schema";

// M27 (D-084): DB-backed repo tests for post-intake Setup editing. Runs
// against the ephemeral test-DB (M22 global setup), self-skips without
// Postgres (same convention as the rest of the DB-backed suite).

const PROJECT_SLUG = "m27-setup-e2e";
let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdVersionIds: string[] = [];

afterAll(async () => {
  // Bypasses the C-4 freeze trigger (D-081) for versions this suite created
  // (createDraftVersion leaves them in `draft`, so this is mostly belt and
  // braces, matching the established pattern in budget.test.ts et al.).
  if (createdVersionIds.length > 0) await forceDeleteMatrixVersions(createdVersionIds).catch(() => {});
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (project) {
    await db.delete(matrixVersions).where(eq(matrixVersions.projectId, project.id)).catch(() => {});
    await db.delete(brands).where(eq(brands.projectId, project.id)).catch(() => {});
    await db.delete(personas).where(eq(personas.projectId, project.id)).catch(() => {});
    await db.delete(markets).where(eq(markets.projectId, project.id)).catch(() => {});
    await db.delete(attributes).where(eq(attributes.projectId, project.id)).catch(() => {});
    await db.delete(projects).where(eq(projects.id, project.id)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

async function ensureProject() {
  const [existing] = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (existing) return existing.id;
  const [demo] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!demo) throw new Error("ledgerfox-demo not found — run pnpm db:seed first");

  const inputs = await getMatrixInputs(demo.id);
  if (!inputs || !inputs.client) throw new Error("demo project intake incomplete");

  const [project] = await db
    .insert(projects)
    .values({
      name: "M27 Setup E2E",
      slug: PROJECT_SLUG,
      category: inputs.project.category,
      jobToBeDone: inputs.project.jobToBeDone,
      status: "active",
    })
    .returning({ id: projects.id });

  await db.insert(brands).values({
    projectId: project.id,
    role: "client",
    name: inputs.client.name,
    domain: inputs.client.domain,
    aliasesJson: inputs.client.aliasesJson,
  });
  for (const [i, c] of inputs.competitors.entries()) {
    await db.insert(brands).values({ projectId: project.id, role: "competitor", name: c.name, aliasesJson: c.aliasesJson, priority: i });
  }
  for (const p of inputs.personas) await db.insert(personas).values({ projectId: project.id, title: p.title });
  for (const m of inputs.markets) await db.insert(markets).values({ projectId: project.id, name: m.name });
  for (const name of inputs.attributes) await db.insert(attributes).values({ projectId: project.id, name });
  return project.id;
}

describe.skipIf(!dbUp)("setup repository (M27/D-084)", () => {
  it("edit-in-place preserves row identity: renaming a persona keeps prompt_cells.persona_id joining", async () => {
    const projectId = await ensureProject();
    const inputs = await getMatrixInputs(projectId);
    if (!inputs || !inputs.client) throw new Error("setup incomplete");
    const persona = inputs.personas[0];
    expect(persona).toBeTruthy();

    const ctx = {
      category: inputs.project.category ?? "",
      jobToBeDone: inputs.project.jobToBeDone ?? "",
      clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
      competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
      attributes: inputs.attributes,
    };
    const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 4 });
    const draft = await createDraftVersion(projectId, cells);
    createdVersionIds.push(draft.id);

    const beforeCells = await db
      .select({ id: promptCells.id })
      .from(promptCells)
      .where(and(eq(promptCells.matrixVersionId, draft.id), eq(promptCells.personaId, persona.id)));
    expect(beforeCells.length).toBeGreaterThan(0);

    const updated = await updatePersona(projectId, persona.id, {
      title: "Renamed Persona Title",
      companyContext: null,
      painPoints: [],
      buyingCriteria: [],
    });
    expect(updated).toBe(1);

    // Same row id, new title, and prompt_cells still join on the unchanged id.
    const [row] = await db.select().from(personas).where(eq(personas.id, persona.id));
    expect(row.title).toBe("Renamed Persona Title");
    const afterCells = await db
      .select({ id: promptCells.id })
      .from(promptCells)
      .where(and(eq(promptCells.matrixVersionId, draft.id), eq(promptCells.personaId, persona.id)));
    expect(afterCells.map((c) => c.id).sort()).toEqual(beforeCells.map((c) => c.id).sort());
  });

  it("excludes archived personas/markets/brands from getMatrixInputs but keeps them label-resolvable", async () => {
    const projectId = await ensureProject();
    const personaId = await addPersona(projectId, {
      title: "Archive-me Persona",
      companyContext: null,
      painPoints: [],
      buyingCriteria: [],
    });
    const marketId = await addMarket(projectId, "Archive-me Market");
    const competitorId = await addCompetitor(projectId, { name: "Archive-me Competitor", aliases: [] });

    const beforeArchive = await getMatrixInputs(projectId);
    expect(beforeArchive?.personas.some((p) => p.id === personaId)).toBe(true);
    expect(beforeArchive?.markets.some((m) => m.id === marketId)).toBe(true);
    expect(beforeArchive?.competitors.some((c) => c.id === competitorId)).toBe(true);

    await archivePersona(projectId, personaId);
    await archiveMarket(projectId, marketId);
    const archiveResult = await archiveBrand(projectId, competitorId);
    expect(archiveResult).toEqual({ ok: true });

    const afterArchive = await getMatrixInputs(projectId);
    expect(afterArchive?.personas.some((p) => p.id === personaId)).toBe(false);
    expect(afterArchive?.markets.some((m) => m.id === marketId)).toBe(false);
    expect(afterArchive?.competitors.some((c) => c.id === competitorId)).toBe(false);

    // Label-resolution reads still see the archived rows.
    const personaLabels = await getPersonaLabelsForProject(projectId);
    const marketLabels = await getMarketLabelsForProject(projectId);
    expect(personaLabels.find((p) => p.id === personaId)?.title).toBe("Archive-me Persona");
    expect(marketLabels.find((m) => m.id === marketId)?.name).toBe("Archive-me Market");

    // Unarchiving a market restores it to the generation-input read.
    await unarchiveMarket(projectId, marketId);
    const afterUnarchive = await getMatrixInputs(projectId);
    expect(afterUnarchive?.markets.some((m) => m.id === marketId)).toBe(true);
  });

  it("rejects archiving the client brand server-side", async () => {
    const projectId = await ensureProject();
    const setup = await getProjectSetup(projectId);
    const client = setup?.brands.find((b) => b.role === "client");
    expect(client).toBeTruthy();
    const result = await archiveBrand(projectId, client!.id);
    expect(result).toEqual({ ok: false, error: "The client brand cannot be archived" });
    const [row] = await db.select({ archivedAt: brands.archivedAt }).from(brands).where(eq(brands.id, client!.id));
    expect(row.archivedAt).toBeNull();
  });

  it("touches projects.setup_updated_at on every mutation type", async () => {
    const projectId = await ensureProject();
    async function currentSetupUpdatedAt() {
      const [row] = await db.select({ setupUpdatedAt: projects.setupUpdatedAt }).from(projects).where(eq(projects.id, projectId));
      return row.setupUpdatedAt;
    }

    await db.update(projects).set({ setupUpdatedAt: null }).where(eq(projects.id, projectId));
    expect(await currentSetupUpdatedAt()).toBeNull();

    await updateBasics(projectId, { name: "M27 Setup E2E", category: "software", categoryArchetype: "b2b", jobToBeDone: "manage invoices" });
    const afterBasics = await currentSetupUpdatedAt();
    expect(afterBasics).not.toBeNull();

    await new Promise((r) => setTimeout(r, 5));
    const marketId = await addMarket(projectId, `Touch Market ${Date.now()}`);
    const afterMarket = await currentSetupUpdatedAt();
    expect(afterMarket!.getTime()).toBeGreaterThanOrEqual(afterBasics!.getTime());

    await new Promise((r) => setTimeout(r, 5));
    await updateMarket(projectId, marketId, "Renamed Touch Market");
    const afterRename = await currentSetupUpdatedAt();
    expect(afterRename!.getTime()).toBeGreaterThanOrEqual(afterMarket!.getTime());
  });

  it("PM-9 active brand terms exclude archived competitors from the scan input", async () => {
    const projectId = await ensureProject();
    const competitorId = await addCompetitor(projectId, { name: "ScanCo Unique Name", aliases: [] });
    const before = await getActiveBrandTerms(projectId);
    expect(before.some((b) => b.name === "ScanCo Unique Name")).toBe(true);
    await archiveBrand(projectId, competitorId);
    const after = await getActiveBrandTerms(projectId);
    expect(after.some((b) => b.name === "ScanCo Unique Name")).toBe(false);
  });

  it("stale-draft detection: a draft created before a Setup edit reads stale; a fresh draft does not", async () => {
    const projectId = await ensureProject();
    const inputs = await getMatrixInputs(projectId);
    if (!inputs || !inputs.client) throw new Error("setup incomplete");
    const ctx = {
      category: inputs.project.category ?? "",
      jobToBeDone: inputs.project.jobToBeDone ?? "",
      clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
      competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
      attributes: inputs.attributes,
    };
    const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 2 });
    const draftBefore = await createDraftVersion(projectId, cells);
    createdVersionIds.push(draftBefore.id);
    const [versionBefore] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draftBefore.id));

    await new Promise((r) => setTimeout(r, 5));
    await updateBrand(projectId, inputs.client.id, {
      name: inputs.client.name,
      aliases: (inputs.client.aliasesJson as string[]) ?? [],
      domain: inputs.client.domain,
    });
    const [projectAfterEdit] = await db.select({ setupUpdatedAt: projects.setupUpdatedAt }).from(projects).where(eq(projects.id, projectId));
    // The existing draft now reads stale (setup_updated_at > its createdAt).
    expect(projectAfterEdit.setupUpdatedAt!.getTime()).toBeGreaterThan(versionBefore.createdAt.getTime());

    await new Promise((r) => setTimeout(r, 5));
    const freshInputs = await getMatrixInputs(projectId);
    const draftAfter = await createDraftVersion(projectId, cells.map((c) => ({ ...c, personaId: freshInputs!.personas[0]?.id ?? c.personaId })));
    createdVersionIds.push(draftAfter.id);
    const [versionAfter] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draftAfter.id));
    expect(projectAfterEdit.setupUpdatedAt!.getTime()).toBeLessThanOrEqual(versionAfter.createdAt.getTime());
  });
});
