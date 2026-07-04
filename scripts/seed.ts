// Idempotent seed (ENGINEERING_SPEC section 4): running twice creates no
// duplicate projects, brands, templates, or intake rows.
import "../src/env-bootstrap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { TEMPLATE_SEED } from "../src/core/prompt-templates";
import { db, pool } from "../src/db/client";
import {
  attributes,
  brands,
  factClaims,
  markets,
  personas,
  projects,
  promptTemplates,
} from "../src/db/schema";

const DEMO_SLUG = "ledgerfox-demo";

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
    const existing = await db
      .select({ id: promptTemplates.id })
      .from(promptTemplates)
      .where(
        and(
          eq(promptTemplates.intent, t.intent),
          eq(promptTemplates.archetype, t.archetype),
          eq(promptTemplates.variantKey, t.variantKey),
          eq(promptTemplates.active, true),
        ),
      );
    if (existing.length === 0) {
      await db.insert(promptTemplates).values({
        archetype: t.archetype,
        intent: t.intent,
        variantKey: t.variantKey,
        templateText: t.text,
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

async function main() {
  const templatesInserted = await seedTemplates();
  const demoCreated = await seedDemoProject();

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
  console.log(`[seed] row counts: ${JSON.stringify(counts)}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
