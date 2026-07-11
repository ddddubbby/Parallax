// Idempotent seed (ENGINEERING_SPEC section 4): running twice creates no
// duplicate projects, brands, templates, or intake rows.
import "../src/env-bootstrap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import {
  REPRESENTATION_PROMPTS,
  TEMPLATE_SEED,
} from "../src/core/prompt-templates";
import { renderRepresentationTemplate } from "../src/core/matrix";
import { db, pool } from "../src/db/client";
import {
  attributes,
  auditRuns,
  brands,
  factClaims,
  jobs,
  markets,
  matrixVersions,
  personas,
  projects,
  promptCells,
  promptTemplates,
  responses,
} from "../src/db/schema";

const DEMO_SLUG = "ledgerfox-demo";
const M34A_E2E_SLUG = "lensloop-m34a-e2e";

interface DemoProject {
  project: { name: string; category: string; job_to_be_done: string };
  client_brand: { name: string; aliases: string[]; domain: string; description: string };
  competitors: Array<{ name: string; aliases: string[]; domain?: string }>;
  fact_claims: Array<{
    type: "pricing" | "feature" | "company_fact" | "security" | "availability";
    statement: string;
    source_note?: string;
    source_url?: string;
  }>;
  attributes: string[];
  personas: Array<{
    title: string;
    company_context: string;
    pain_points: string[];
    buying_criteria: string[];
  }>;
  markets: string[];
}

async function seedTemplates(): Promise<number> {
  let inserted = 0;
  for (const t of TEMPLATE_SEED) {
    // M23 (D-079): match on the natural key alone, not active=true. The
    // opt-in price/promo templates seed with active:false, and the partial
    // unique index only enforces uniqueness among active rows — an
    // active-only existence check would re-insert an inactive seed row on
    // every run, breaking seed-twice idempotency.
    const existing = await db
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(
        and(
          eq(promptTemplates.intent, t.intent),
          eq(promptTemplates.archetype, t.archetype),
          eq(promptTemplates.variantKey, t.variantKey),
        ),
      );
    if (existing.length === 0) {
      await db.insert(promptTemplates).values({
        archetype: t.archetype,
        intent: t.intent,
        variantKey: t.variantKey,
        templateText: t.text,
        active: t.active ?? true,
      });
      inserted += 1;
    }
  }
  return inserted;
}

async function seedDemoProject(): Promise<boolean> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, DEMO_SLUG));
  if (existing.length > 0) return false;

  const demoPath = join(process.cwd(), "fixtures", "demo-project.json");
  const demo = JSON.parse(readFileSync(demoPath, "utf8")) as DemoProject;

  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        name: demo.project.name,
        slug: DEMO_SLUG,
        category: demo.project.category,
        jobToBeDone: demo.project.job_to_be_done,
        status: "active",
      })
      .returning({ id: projects.id });

    await tx.insert(brands).values({
      projectId: project.id,
      role: "client",
      name: demo.client_brand.name,
      domain: demo.client_brand.domain,
      description: demo.client_brand.description,
      aliasesJson: demo.client_brand.aliases,
    });
    for (const [i, c] of demo.competitors.entries()) {
      await tx.insert(brands).values({
        projectId: project.id,
        role: "competitor",
        name: c.name,
        domain: c.domain,
        aliasesJson: c.aliases,
        priority: i,
      });
    }
    for (const fc of demo.fact_claims) {
      await tx.insert(factClaims).values({
        projectId: project.id,
        type: fc.type,
        statement: fc.statement,
        sourceNote: fc.source_note,
        sourceUrl: fc.source_url,
      });
    }
    for (const [i, name] of demo.attributes.entries()) {
      await tx.insert(attributes).values({ projectId: project.id, name, priority: i });
    }
    for (const [i, p] of demo.personas.entries()) {
      await tx.insert(personas).values({
        projectId: project.id,
        title: p.title,
        companyContext: p.company_context,
        painPointsJson: p.pain_points,
        buyingCriteriaJson: p.buying_criteria,
        priority: i,
      });
    }
    for (const [i, name] of demo.markets.entries()) {
      await tx.insert(markets).values({ projectId: project.id, name, priority: i });
    }
  });
  return true;
}

async function seedM34aE2eFixture(): Promise<boolean> {
  const existing = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, M34A_E2E_SLUG));
  if (existing.length > 0) return false;

  await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values({
      name: "LensLoop M34A E2E",
      slug: M34A_E2E_SLUG,
      category: "action cameras",
      categoryArchetype: "consumer_product",
      jobToBeDone: "identify the AI framing gap worth testing next",
      status: "active",
    }).returning();
    const [brand] = await tx.insert(brands).values({
      projectId: project.id,
      role: "client",
      name: "LensLoop",
    }).returning();
    await tx.insert(factClaims).values({
      projectId: project.id,
      type: "feature",
      statement: "LensLoop exports direct-to-share flat video.",
      sourceNote: "E2E product fact sheet",
    });
    const [version] = await tx.insert(matrixVersions).values({
      projectId: project.id,
      version: 1,
      state: "approved",
      kind: "audit",
      cellCount: REPRESENTATION_PROMPTS.length,
      approvedAt: new Date(),
    }).returning();
    const cells = await tx.insert(promptCells).values(
      REPRESENTATION_PROMPTS.map((prompt) => ({
        matrixVersionId: version.id,
        intent: "representation" as const,
        personaId: null,
        marketId: null,
        variantKey: prompt.variantKey,
        resolvedText: renderRepresentationTemplate(prompt.text, brand.name),
        competitorOrderJson: [],
      })),
    ).returning();
    const [run] = await tx.insert(auditRuns).values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "live_audit",
      state: "completed",
      repetitions: 5,
      selectedProvidersJson: ["deepseek"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 25,
      costCapUsd: "0",
      completedAt: new Date(),
    }).returning();
    const rawTexts = [
      "LensLoop is known for durable action cameras.",
      "LensLoop makes compact cameras for outdoor recording.",
      "LensLoop offers stabilized video tools.",
      "LensLoop is an action-camera company.",
      "LensLoop is often described as rugged and portable.",
    ];
    for (const [index, cell] of cells.entries()) {
      const [job] = await tx.insert(jobs).values({
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        repIndex: 0,
        state: "succeeded",
      }).returning();
      await tx.insert(responses).values({
        jobId: job.id,
        runId: run.id,
        cellId: cell.id,
        providerId: "deepseek",
        generationMode: "ungrounded",
        modelVersion: "deepseek-e2e-v1",
        rawText: rawTexts[index]!,
      });
    }
  });
  return true;
}

async function main() {
  const templatesInserted = await seedTemplates();
  const demoCreated = await seedDemoProject();
  const m34aE2eCreated = await seedM34aE2eFixture();

  const counts = {
    prompt_templates: (await db.select({ id: promptTemplates.id }).from(promptTemplates)).length,
    projects: (await db.select({ id: projects.id }).from(projects)).length,
    brands: (await db.select({ id: brands.id }).from(brands)).length,
    fact_claims: (await db.select({ id: factClaims.id }).from(factClaims)).length,
    attributes: (await db.select({ id: attributes.id }).from(attributes)).length,
    personas: (await db.select({ id: personas.id }).from(personas)).length,
    markets: (await db.select({ id: markets.id }).from(markets)).length,
  };

  console.log(`[seed] templates inserted this run: ${templatesInserted}`);
  console.log(`[seed] demo project created this run: ${demoCreated}`);
  console.log(`[seed] M34A E2E fixture created this run: ${m34aE2eCreated}`);
  console.log(`[seed] row counts: ${JSON.stringify(counts)}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
