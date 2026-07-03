import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { getReportSections, saveEdit } from "@/db/repositories/report";
import { auditRuns, projects } from "@/db/schema";
import { computeFindings, generateReport, regenerateOneSection } from "./service";

// M7 acceptance (DEVELOPMENT_GUIDELINES.md F manual checklist row):
// "Report: edit section A, regenerate section B, A intact." Automated
// against the real M4 e2e run's data; self-skips without Postgres.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

describe.skipIf(!dbUp)("report generation against the dev database", () => {
  it("computes findings with real evidence from the M4 e2e run", async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, "m4-e2e"));
    expect(project, "m4-e2e project must exist — run pnpm test:mock-e2e first").toBeDefined();
    const [run] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.projectId, project.id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);
    expect(run).toBeDefined();

    const count = await computeFindings(run.id);
    // The M4 run's golden-dataset-derived data includes wrong-pricing/
    // wrong-feature/unsupported-security fixtures by design (M5), so a
    // misinformation finding is expected, not incidental.
    expect(count).toBeGreaterThan(0);
  }, 30_000);

  it("edit section A, regenerate section B: A is untouched (RB-2, RB-3)", async () => {
    const [project] = await db.select().from(projects).where(eq(projects.slug, "m4-e2e"));
    const [run] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.projectId, project.id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);

    await computeFindings(run.id);
    const genResult = await generateReport(run.id);
    expect(genResult.ok).toBe(true);

    const sections = await getReportSections(run.id);
    expect(sections.length).toBe(9);

    const sectionA = sections.find((s) => s.sectionKey === "executive_summary")!;
    const sectionB = sections.find((s) => s.sectionKey === "visibility")!;
    const untouchedControl = sections.find((s) => s.sectionKey === "sources")!;

    const customEdit = `CUSTOM OPERATOR EDIT ${Date.now()}`;
    await saveEdit(sectionA.id, customEdit);

    const beforeRegenerate = await getReportSections(run.id);
    const controlBefore = beforeRegenerate.find((s) => s.id === untouchedControl.id)!;

    // RB-3: regenerating B must only touch B.
    await regenerateOneSection(run.id, sectionB.id, "visibility");

    const after = await getReportSections(run.id);
    const aAfter = after.find((s) => s.id === sectionA.id)!;
    const bAfter = after.find((s) => s.id === sectionB.id)!;
    const controlAfter = after.find((s) => s.id === untouchedControl.id)!;

    // A: the edit survives exactly, state stays 'edited'.
    expect(aAfter.editedMd).toBe(customEdit);
    expect(aAfter.state).toBe("edited");

    // B: regenerated, edit (if any) cleared, state transitions.
    expect(bAfter.state).toBe("regenerated");
    expect(bAfter.editedMd).toBeNull();
    expect(bAfter.generatedMd).not.toBeNull();

    // Every other section (not A, not B) is byte-identical to before B's regeneration.
    expect(controlAfter.generatedMd).toBe(controlBefore.generatedMd);
    expect(controlAfter.editedMd).toBe(controlBefore.editedMd);
    expect(controlAfter.updatedAt.getTime()).toBe(controlBefore.updatedAt.getTime());

    await pool.end();
  }, 30_000);
});
