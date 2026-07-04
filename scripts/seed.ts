// Idempotent seed (ENGINEERING_SPEC section 4): running twice creates no
// duplicate projects, brands, templates, or intake rows.
import "../src/env-bootstrap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
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

type IntentKey =
  | "discovery"
  | "consideration"
  | "comparison"
  | "validation"
  | "objection";

// Three variant phrasings per intent (PRD 8.4); v1 is the canonical PRD text.
const TEMPLATE_SEED: Array<{ intent: IntentKey; variantKey: string; text: string }> = [
  { intent: "discovery", variantKey: "v1", text: "What tools should a {persona} in {market} consider for {job_to_be_done}?" },
  { intent: "discovery", variantKey: "v2", text: "Which solutions would you shortlist for a {persona} in {market} trying to {job_to_be_done}?" },
  { intent: "discovery", variantKey: "v3", text: "I'm a {persona} in {market}. What should I look at for {job_to_be_done}?" },
  { intent: "consideration", variantKey: "v1", text: "What are the best options for {persona} teams evaluating {category} in {market}?" },
  { intent: "consideration", variantKey: "v2", text: "Rank the leading {category} options for a {persona} buyer in {market}." },
  { intent: "consideration", variantKey: "v3", text: "As a {persona} in {market}, which {category} vendors are worth a demo?" },
  { intent: "comparison", variantKey: "v1", text: "Compare {client_brand} against {competitor_list} for a {persona} buyer in {market}." },
  { intent: "comparison", variantKey: "v2", text: "How does {client_brand} stack up against {competitor_list} for {persona} teams in {market}?" },
  { intent: "comparison", variantKey: "v3", text: "Between {client_brand} and {competitor_list}, which fits a {persona} in {market} best, and why?" },
  { intent: "validation", variantKey: "v1", text: "Is {client_brand} a good fit for {persona} teams that care about {attribute_list}?" },
  { intent: "validation", variantKey: "v2", text: "Would you recommend {client_brand} to a {persona} prioritizing {attribute_list}?" },
  { intent: "validation", variantKey: "v3", text: "For a {persona} that values {attribute_list}, what are {client_brand}'s strengths and weaknesses?" },
  { intent: "objection", variantKey: "v1", text: "What concerns should a {persona} have before choosing {client_brand}?" },
  { intent: "objection", variantKey: "v2", text: "What are the most common criticisms of {client_brand} from {persona} buyers?" },
  { intent: "objection", variantKey: "v3", text: "Why might a {persona} decide against {client_brand}?" },
];

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
          eq(promptTemplates.variantKey, t.variantKey),
          eq(promptTemplates.active, true),
        ),
      );
    if (existing.length === 0) {
      await db.insert(promptTemplates).values({
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
