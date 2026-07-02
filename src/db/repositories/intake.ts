import { desc, eq } from "drizzle-orm";
import type {
  Basics,
  ClientBrand,
  Competitor,
  FactSheet,
  IntakeDraft,
  Personas,
} from "@/core/intake";
import { db } from "../client";
import {
  attributes,
  brands,
  factClaims,
  markets,
  personas,
  projects,
} from "../schema";

export async function listProjects() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      status: projects.status,
      intakeStep: projects.intakeStep,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
}

export async function getProjectIntake(id: string) {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      intakeStep: projects.intakeStep,
      intakeDraftJson: projects.intakeDraftJson,
    })
    .from(projects)
    .where(eq(projects.id, id));
  return row ?? null;
}

export async function createDraftProject(input: {
  name: string;
  slug: string;
  draft: IntakeDraft;
  intakeStep: number;
}) {
  const [row] = await db
    .insert(projects)
    .values({
      name: input.name,
      slug: input.slug,
      intakeDraftJson: input.draft,
      intakeStep: input.intakeStep,
    })
    .returning({ id: projects.id });
  return row.id;
}

export async function updateDraft(
  id: string,
  input: { draft: IntakeDraft; intakeStep?: number; name?: string },
) {
  await db
    .update(projects)
    .set({
      intakeDraftJson: input.draft,
      ...(input.intakeStep !== undefined && { intakeStep: input.intakeStep }),
      ...(input.name !== undefined && { name: input.name }),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));
}

export interface NormalizedIntake {
  basics: Basics;
  clientBrand: ClientBrand;
  competitors: Competitor[];
  factSheet: FactSheet;
  attributes: string[];
  personas: Personas["personas"];
  markets: string[];
}

/**
 * D-026: normalize the validated draft into the intake tables in one
 * transaction and activate the project. Replaces any previous rows, so
 * re-completion is idempotent.
 */
export async function completeIntake(id: string, data: NormalizedIntake) {
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        name: data.basics.name,
        category: data.basics.category,
        jobToBeDone: data.basics.job_to_be_done,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id));

    await tx.delete(brands).where(eq(brands.projectId, id));
    await tx.insert(brands).values({
      projectId: id,
      role: "client",
      name: data.clientBrand.name,
      domain: data.clientBrand.domain,
      description: data.clientBrand.description,
      aliasesJson: data.clientBrand.aliases,
    });
    for (const [i, c] of data.competitors.entries()) {
      await tx.insert(brands).values({
        projectId: id,
        role: "competitor",
        name: c.name,
        domain: c.domain,
        aliasesJson: c.aliases,
        priority: i,
      });
    }

    await tx.delete(factClaims).where(eq(factClaims.projectId, id));
    for (const row of data.factSheet.rows) {
      await tx.insert(factClaims).values({
        projectId: id,
        type: row.type,
        statement: row.statement,
        sourceNote: row.source_note,
        sourceUrl: row.source_url,
      });
    }

    await tx.delete(attributes).where(eq(attributes.projectId, id));
    for (const [i, name] of data.attributes.entries()) {
      await tx.insert(attributes).values({ projectId: id, name, priority: i });
    }

    await tx.delete(personas).where(eq(personas.projectId, id));
    for (const [i, p] of data.personas.entries()) {
      await tx.insert(personas).values({
        projectId: id,
        title: p.title,
        companyContext: p.company_context,
        painPointsJson: p.pain_points,
        buyingCriteriaJson: p.buying_criteria,
        priority: i,
      });
    }

    await tx.delete(markets).where(eq(markets.projectId, id));
    for (const [i, name] of data.markets.entries()) {
      await tx.insert(markets).values({ projectId: id, name, priority: i });
    }
  });
}
