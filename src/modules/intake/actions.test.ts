import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { completeIntake, type NormalizedIntake } from "@/db/repositories/intake";
import { attributes, brands, factClaims, markets, personas, projects } from "@/db/schema";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdProjectIds: string[] = [];

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await db.delete(brands).where(inArray(brands.projectId, createdProjectIds)).catch(() => {});
    await db.delete(factClaims).where(inArray(factClaims.projectId, createdProjectIds)).catch(() => {});
    await db.delete(attributes).where(inArray(attributes.projectId, createdProjectIds)).catch(() => {});
    await db.delete(personas).where(inArray(personas.projectId, createdProjectIds)).catch(() => {});
    await db.delete(markets).where(inArray(markets.projectId, createdProjectIds)).catch(() => {});
    await db.delete(projects).where(inArray(projects.id, createdProjectIds)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

const BASICS = {
  name: "Intake Guard Project",
  category_archetype: "b2b" as const,
  category: "Accounts payable automation",
  job_to_be_done: "Compare AI visibility across payment workflow tools",
};

const NORMALIZED: NormalizedIntake = {
  basics: BASICS,
  clientBrand: {
    name: "LedgerFox",
    aliases: ["Ledger Fox"],
    domain: "ledgerfox.example",
    description: "AP automation platform",
  },
  competitors: [
    { name: "SpendPilot", aliases: [], domain: "spendpilot.example" },
    { name: "Northstar AP", aliases: [], domain: "northstar.example" },
    { name: "PayFlow", aliases: [], domain: "payflow.example" },
  ],
  factSheet: {
    rows: [{ type: "feature", statement: "LedgerFox supports approval workflows.", source_note: "Operator fact sheet" }],
  },
  attributes: ["fast setup", "audit trail", "approval routing", "erp sync", "fraud checks", "vendor portal"],
  personas: [
    { title: "Controller", company_context: "Mid-market finance", pain_points: ["manual approvals"], buying_criteria: ["auditability"] },
    { title: "AP manager", company_context: "Distributed team", pain_points: ["late payments"], buying_criteria: ["workflow control"] },
  ],
  markets: ["United States"],
};

describe("intake action id guards", () => {
  it("rejects malformed project ids before repository calls can cast them as UUIDs", async () => {
    const { autosaveStep, completeStep, finishIntake } = await import("./actions");

    await expect(autosaveStep("not-a-uuid", "basics", BASICS)).resolves.toEqual({
      projectId: null,
      savedAt: null,
    });
    await expect(completeStep("not-a-uuid", "basics", BASICS)).resolves.toEqual({
      ok: false,
      fieldErrors: { _root: ["Could not save draft"] },
    });
    await expect(finishIntake("not-a-uuid")).resolves.toEqual({ ok: false, stepErrors: {} });
  });
});

describe.skipIf(!dbUp)("intake actions against the dev database", () => {
  it("rejects unknown step keys without mutating draft JSON", async () => {
    const { autosaveStep, completeStep } = await import("./actions");

    const created = await autosaveStep(null, "basics", BASICS);
    expect(created.projectId).toBeTruthy();
    if (!created.projectId) throw new Error("expected project id");
    createdProjectIds.push(created.projectId);

    const autosaved = await autosaveStep(created.projectId, "__proto__", { polluted: true });
    expect(autosaved.projectId).toBeNull();

    const completed = await completeStep(created.projectId, "unknown_step", {});
    expect(completed).toEqual({ ok: false, fieldErrors: { _root: ["Unknown intake step"] } });

    const [project] = await db
      .select({ intakeDraftJson: projects.intakeDraftJson })
      .from(projects)
      .where(eq(projects.id, created.projectId));
    expect(project.intakeDraftJson).toEqual({ basics: BASICS });
  });

  it("does not mutate completed projects through intake action or repository paths", async () => {
    const { autosaveStep, completeStep, finishIntake } = await import("./actions");

    const created = await autosaveStep(null, "basics", BASICS);
    expect(created.projectId).toBeTruthy();
    if (!created.projectId) throw new Error("expected project id");
    createdProjectIds.push(created.projectId);

    await db.update(projects).set({ status: "active" }).where(eq(projects.id, created.projectId));

    const autosaved = await autosaveStep(created.projectId, "basics", { ...BASICS, name: "Tampered Name" });
    expect(autosaved.projectId).toBeNull();

    const completedStep = await completeStep(created.projectId, "basics", { ...BASICS, name: "Step Tamper" });
    expect(completedStep.ok).toBe(false);

    const finished = await finishIntake(created.projectId);
    expect(finished.ok).toBe(false);

    await expect(completeIntake(created.projectId, NORMALIZED)).rejects.toThrow(/already complete/i);

    const [project] = await db
      .select({ name: projects.name, status: projects.status })
      .from(projects)
      .where(eq(projects.id, created.projectId));
    expect(project.name).toBe(BASICS.name);
    expect(project.status).toBe("active");

    const childBrands = await db.select({ id: brands.id }).from(brands).where(eq(brands.projectId, created.projectId));
    expect(childBrands).toHaveLength(0);
  });
});
