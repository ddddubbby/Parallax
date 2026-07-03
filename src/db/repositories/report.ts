import { and, eq } from "drizzle-orm";
import { db } from "../client";
import { reportSections } from "../schema";

export async function getReportSections(runId: string) {
  return db.select().from(reportSections).where(eq(reportSections.runId, runId)).orderBy(reportSections.position);
}

/** Report generation: only creates rows that don't already exist — never overwrites an edited section (RB-2/RB-3). */
export async function ensureSection(
  runId: string,
  sectionKey: string,
  position: number,
  generatedMd: string,
) {
  const [existing] = await db
    .select({ id: reportSections.id })
    .from(reportSections)
    .where(and(eq(reportSections.runId, runId), eq(reportSections.sectionKey, sectionKey)));
  if (existing) return existing.id;
  const [row] = await db
    .insert(reportSections)
    .values({ runId, sectionKey, position, generatedMd, state: "generated" })
    .returning({ id: reportSections.id });
  return row.id;
}

/** RB-2: an operator edit always wins over generated_md going forward. */
export async function saveEdit(sectionId: string, editedMd: string) {
  await db
    .update(reportSections)
    .set({ editedMd, state: "edited", updatedAt: new Date() })
    .where(eq(reportSections.id, sectionId));
}

/** RB-3: regenerating a section replaces generated_md and clears the edit — this section only, never siblings. */
export async function regenerateSection(sectionId: string, generatedMd: string) {
  await db
    .update(reportSections)
    .set({ generatedMd, editedMd: null, state: "regenerated", updatedAt: new Date() })
    .where(eq(reportSections.id, sectionId));
}

export async function getSection(sectionId: string) {
  const [row] = await db.select().from(reportSections).where(eq(reportSections.id, sectionId));
  return row ?? null;
}
