import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { attributes, brands, markets, personas, projects } from "@/db/schema";

// M27 (D-084): action-level guards (id validation, empty-name rejection) and
// the PM-9 basics-save warning. Runs against the ephemeral test-DB (M22
// global setup), self-skips without Postgres.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PROJECT_SLUG = "m27-setup-actions-e2e";
let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

afterAll(async () => {
  const [project] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (project) {
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
  const [project] = await db
    .insert(projects)
    .values({ name: "M27 Setup Actions E2E", slug: PROJECT_SLUG, category: "software", jobToBeDone: "manage invoices", status: "active" })
    .returning({ id: projects.id });
  await db.insert(brands).values({ projectId: project.id, role: "client", name: "LedgerFox", domain: "ledgerfox.example" });
  await db.insert(brands).values({ projectId: project.id, role: "competitor", name: "RivalBooks", aliasesJson: ["rivalbooks"] });
  return project.id;
}

const VALID_ID = "00000000-0000-4000-8000-000000000000";

describe("setup action id/input guards", () => {
  it("rejects malformed ids before any repository call", async () => {
    const { addPersonaAction, archiveBrandAction, updateMarketAction, updateBasicsAction } = await import("./actions");
    await expect(addPersonaAction("not-a-uuid", { title: "x", pain_points: [], buying_criteria: [] })).resolves.toEqual({
      ok: false,
      error: "Invalid id",
    });
    await expect(archiveBrandAction(VALID_ID, "bad-brand")).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(updateMarketAction("bad-project", VALID_ID, { name: "x" })).resolves.toEqual({ ok: false, error: "Invalid id" });
    await expect(updateBasicsAction("not-a-uuid", {})).resolves.toEqual({ ok: false, error: "Invalid id" });
  });

  it("rejects an empty name via server-side Zod validation", async () => {
    const { addMarketAction, addAttributeAction, addPersonaAction } = await import("./actions");
    const emptyMarket = await addMarketAction(VALID_ID, { name: "" });
    expect(emptyMarket.ok).toBe(false);
    const emptyAttribute = await addAttributeAction(VALID_ID, { name: "  " });
    expect(emptyAttribute.ok).toBe(false);
    const emptyPersona = await addPersonaAction(VALID_ID, { title: "", pain_points: [], buying_criteria: [] });
    expect(emptyPersona.ok).toBe(false);
  });
});

describe.skipIf(!dbUp)("setup basics PM-9 warning (D-046 reused post-intake)", () => {
  it("warns, but does not block, when job-to-be-done contains a tracked brand term", async () => {
    const { updateBasicsAction } = await import("./actions");
    const projectId = await ensureProject();

    const clean = await updateBasicsAction(projectId, {
      name: "M27 Setup Actions E2E",
      category_archetype: "b2b",
      category: "software",
      job_to_be_done: "keep invoices reconciled",
    });
    expect(clean).toEqual({ ok: true });

    const contaminated = await updateBasicsAction(projectId, {
      name: "M27 Setup Actions E2E",
      category_archetype: "b2b",
      category: "software",
      job_to_be_done: "switch away from RivalBooks to something better",
    });
    expect(contaminated.ok).toBe(true);
    expect((contaminated as { warning?: string }).warning).toBeTruthy();
    expect((contaminated as { warning?: string }).warning).toContain("RivalBooks");

    // The save itself still succeeded (warning is non-blocking).
    const [row] = await db.select({ jobToBeDone: projects.jobToBeDone }).from(projects).where(eq(projects.id, projectId));
    expect(row.jobToBeDone).toContain("RivalBooks");
  });

  it("warns, but does not block, when job-to-be-done reads as a business objective (M28 buyer-voice guard)", async () => {
    const { updateBasicsAction } = await import("./actions");
    const projectId = await ensureProject();

    const businessVoice = await updateBasicsAction(projectId, {
      name: "M27 Setup Actions E2E",
      category_archetype: "b2b",
      category: "software",
      job_to_be_done: "Penetrate the traditional DSLR consumer segment",
    });
    expect(businessVoice.ok).toBe(true);
    expect((businessVoice as { warning?: string }).warning).toBeTruthy();
    expect((businessVoice as { warning?: string }).warning).toContain("Buyer-voice");
    expect((businessVoice as { warning?: string }).warning).toContain("penetrate");

    // The save itself still succeeded (warning is non-blocking).
    const [row] = await db.select({ jobToBeDone: projects.jobToBeDone }).from(projects).where(eq(projects.id, projectId));
    expect(row.jobToBeDone).toBe("Penetrate the traditional DSLR consumer segment");
  });
});
