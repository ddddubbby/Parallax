import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { getReportSections, saveEdit } from "@/db/repositories/report";
import { auditRuns, projects } from "@/db/schema";
import { computeFindings, editSection, generateReport, regenerateOneSection } from "./service";

// M7 acceptance (DEVELOPMENT_GUIDELINES.md F manual checklist row):
// "Report: edit section A, regenerate section B, A intact." Automated
// against the real M4 e2e run's data (created by `pnpm test:mock-e2e`, not
// part of the M22 ephemeral test-DB's migrate+seed) — self-skips without
// Postgres OR without that fixture, same !dbUp/!fixture idiom as
// src/modules/matrix/actions.test.ts's !demoProjectId guard (M22: was a
// hard expect().toBeDefined() failure / bare run.id crash before the test
// DB was ephemeral-per-run; now a graceful skip).
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
let m4e2eRunId: string | null = null;
try {
  await pool.query("select 1");
  dbUp = true;
  const [project] = await db.select().from(projects).where(eq(projects.slug, "m4-e2e"));
  if (project) {
    const [run] = await db
      .select({ id: auditRuns.id })
      .from(auditRuns)
      .where(eq(auditRuns.projectId, project.id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);
    m4e2eRunId = run?.id ?? null;
  }
} catch {
  dbUp = false;
}

describe("report section key validation", () => {
  it("rejects unknown section keys before loading report data", async () => {
    await expect(
      regenerateOneSection(
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "not_a_section",
      ),
    ).rejects.toThrow(/Unknown report section key/);
  });
});

describe.skipIf(!dbUp || !m4e2eRunId)("report generation against the dev database", () => {
  it("computes findings with real evidence from the M4 e2e run", async () => {
    const run = { id: m4e2eRunId as string };

    const count = await computeFindings(run.id);
    // The M4 run's golden-dataset-derived data includes wrong-pricing/
    // wrong-feature/unsupported-security fixtures by design (M5), so a
    // misinformation finding is expected, not incidental.
    expect(count).toBeGreaterThan(0);
  }, 30_000);

  it("edit section A, regenerate section B: A is untouched (RB-2, RB-3)", async () => {
    const run = { id: m4e2eRunId as string };

    await computeFindings(run.id);
    const genResult = await generateReport(run.id);
    expect(genResult.ok).toBe(true);

    const sections = await getReportSections(run.id);
    expect(sections.length).toBe(9);

    const sectionA = sections.find((s) => s.sectionKey === "executive_summary")!;
    const sectionB = sections.find((s) => s.sectionKey === "visibility")!;
    const untouchedControl = sections.find((s) => s.sectionKey === "sources")!;

    const customEdit = `CUSTOM OPERATOR EDIT ${Date.now()}`;
    await expect(
      editSection("00000000-0000-4000-8000-000000000000", sectionA.id, "wrong run edit"),
    ).rejects.toThrow(/not found/i);
    await saveEdit(run.id, sectionA.id, customEdit);

    const beforeRegenerate = await getReportSections(run.id);
    const controlBefore = beforeRegenerate.find((s) => s.id === untouchedControl.id)!;

    await expect(regenerateOneSection(run.id, sectionB.id, "sources")).rejects.toThrow(/not found/i);

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
