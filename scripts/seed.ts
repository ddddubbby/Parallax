// Idempotent seed (ENGINEERING_SPEC section 4): running twice creates no
// duplicate projects, brands, templates, or intake rows.
import "../src/env-bootstrap";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { allocateMatrix, renderRepresentationTemplate } from "../src/core/matrix";
import { REPRESENTATION_PROMPTS, TEMPLATE_SEED } from "../src/core/prompt-templates";
import { db, pool } from "../src/db/client";
import {
  attributes,
  auditRuns,
  brandMentions,
  brands,
  claimsFound,
  extractions,
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
import { approveVersion, createDraftVersion, getMatrixInputs } from "../src/db/repositories/matrix";
import { recomputeMetrics } from "../src/db/repositories/metrics";

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

/**
 * M43 browser-only fixture: a rich, completed MOCK audit for visual and
 * accessibility review. It never starts a worker or calls a provider. The
 * ordinary unit-test seed stays unchanged unless the disposable Playwright
 * harness opts in with M43_UI_FIXTURES=true.
 */
async function seedM43UiFixture(): Promise<{ created: boolean; runId: string | null; metrics: number }> {
  if (process.env.M43_UI_FIXTURES !== "true") {
    return { created: false, runId: null, metrics: 0 };
  }

  const [project] = await db.select().from(projects).where(eq(projects.slug, DEMO_SLUG));
  if (!project) throw new Error(`${DEMO_SLUG} not found for M43 UI fixture`);

  const [existingRun] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(
      and(
        eq(auditRuns.projectId, project.id),
        eq(auditRuns.runMode, "mock"),
        eq(auditRuns.state, "completed"),
        eq(auditRuns.repetitions, 5),
      ),
    );
  if (existingRun) {
    const metricCount = await recomputeMetrics(existingRun.id);
    return { created: false, runId: existingRun.id, metrics: metricCount };
  }

  const inputs = await getMatrixInputs(project.id);
  if (!inputs?.client) throw new Error("M43 UI fixture requires the completed demo intake");
  const context = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: {
      name: inputs.client.name,
      aliases: (inputs.client.aliasesJson as string[]) ?? [],
    },
    competitors: inputs.competitors.map((competitor) => ({
      name: competitor.name,
      aliases: (competitor.aliasesJson as string[]) ?? [],
    })),
    attributes: inputs.attributes,
  };
  const allocated = allocateMatrix(
    inputs.templates as Parameters<typeof allocateMatrix>[0],
    inputs.personas,
    inputs.markets,
    context,
    { target: 40 },
  );
  const version = await createDraftVersion(project.id, allocated);
  await approveVersion(project.id, version.id);
  const cells = await db.select().from(promptCells).where(eq(promptCells.matrixVersionId, version.id));
  const projectBrands = await db.select().from(brands).where(eq(brands.projectId, project.id));
  const client = projectBrands.find((brand) => brand.role === "client");
  const competitors = projectBrands.filter((brand) => brand.role === "competitor");
  const [fact] = await db.select().from(factClaims).where(eq(factClaims.projectId, project.id));
  const projectAttributes = await db.select().from(attributes).where(eq(attributes.projectId, project.id));
  if (!client || competitors.length === 0) throw new Error("M43 UI fixture requires client and competitor brands");

  const [existingMissingMetricsRun] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(
      and(
        eq(auditRuns.projectId, project.id),
        eq(auditRuns.runMode, "mock"),
        eq(auditRuns.state, "completed"),
        eq(auditRuns.repetitions, 1),
      ),
    );
  if (!existingMissingMetricsRun) {
    const previousAt = new Date();
    previousAt.setDate(previousAt.getDate() - 1);
    await db.insert(auditRuns).values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["grounded"],
      plannedCalls: 0,
      costCapUsd: "0",
      createdAt: previousAt,
      completedAt: previousAt,
    });
  }

  const repetitions = 5;
  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["grounded"],
      plannedCalls: cells.length * repetitions,
      costCapUsd: "0",
      completedAt: new Date(),
    })
    .returning();

  await db.transaction(async (tx) => {
    for (const [cellIndex, cell] of cells.entries()) {
      for (let repIndex = 0; repIndex < repetitions; repIndex += 1) {
        const signal = (cellIndex + repIndex) % 5;
        const competitor = competitors[(cellIndex + repIndex) % competitors.length]!;
        const clientMentioned = signal !== 4;
        const clientWins = cell.intent === "comparison" ? signal < 3 : signal === 0;
        const contradicted = (cellIndex * repetitions + repIndex) % 23 === 0;
        const attributeNames = projectAttributes
          .filter((_, index) => (index + signal) % 3 === 0)
          .slice(0, 2)
          .map((attribute) => attribute.name);
        const rawText = clientMentioned
          ? `${client.name} is often considered alongside ${competitor.name}. Operators cite ${attributeNames.join(" and ") || "workflow fit"} when evaluating the category.`
          : `${competitor.name} is one option operators consider for this category. ${client.name} was not included in this sampled answer.`;

        const [job] = await tx
          .insert(jobs)
          .values({
            runId: run.id,
            cellId: cell.id,
            providerId: "mock",
            generationMode: "grounded",
            repIndex,
            state: "succeeded",
          })
          .returning();
        const [response] = await tx
          .insert(responses)
          .values({
            jobId: job.id,
            runId: run.id,
            cellId: cell.id,
            providerId: "mock",
            generationMode: "grounded",
            modelVersion: "m43-ui-fixture-v1",
            rawText,
          })
          .returning();
        const [extraction] = await tx
          .insert(extractions)
          .values({
            responseId: response.id,
            extractionVersion: 1,
            state: "valid",
            extractionModel: "m43-ui-fixture-v1",
            extractedJson: {
              refusal: false,
              citations: [
                {
                  url: "https://research.example/operator-evidence",
                  domain: "research.example",
                  title: "Operator evidence index",
                  cited_for_brand_ids: clientMentioned ? [client.id] : [competitor.id],
                },
                {
                  url: "https://industry.example/category-guide",
                  domain: "industry.example",
                  title: "Category guide",
                  cited_for_brand_ids: [competitor.id],
                },
              ],
            },
          })
          .returning();

        if (clientMentioned) {
          await tx.insert(brandMentions).values({
            extractionId: extraction.id,
            brandId: client.id,
            observedName: client.name,
            position: signal % 2 === 0 ? 1 : 2,
            recommended: clientWins,
            recommendationStrength: clientWins ? "strong" : "neutral",
            sentiment: signal === 3 ? "mixed" : signal === 2 ? "neutral" : "positive",
            attributesJson: attributeNames,
            evidenceQuote: rawText,
          });
        }
        await tx.insert(brandMentions).values({
          extractionId: extraction.id,
          brandId: competitor.id,
          observedName: competitor.name,
          position: clientMentioned ? 2 : 1,
          recommended: cell.intent === "comparison" && !clientWins,
          recommendationStrength: cell.intent === "comparison" && !clientWins ? "strong" : "neutral",
          sentiment: "neutral",
          attributesJson: [],
          evidenceQuote: rawText,
        });
        await tx.insert(claimsFound).values({
          extractionId: extraction.id,
          brandId: client.id,
          factClaimId: fact?.id ?? null,
          claimText: contradicted
            ? `${client.name} does not support an established product capability.`
            : `${client.name} supports an established product capability.`,
          claimType: fact?.type ?? "feature",
          extractedVerdict: contradicted ? "contradicted" : "supported",
          extractedSeverity: contradicted ? (signal === 0 ? "high" : "medium") : "none",
          evidenceQuote: rawText,
        });
      }
    }
  });

  const metricCount = await recomputeMetrics(run.id);
  // Keep a separate latest draft for the matrix edit/approval interaction
  // states while the completed dashboard run remains bound to approved V1.
  await createDraftVersion(project.id, allocated);
  return { created: true, runId: run.id, metrics: metricCount };
}

async function main() {
  const templatesInserted = await seedTemplates();
  const demoCreated = await seedDemoProject();
  const m34aE2eCreated = await seedM34aE2eFixture();
  const m43Ui = await seedM43UiFixture();

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
  if (m43Ui.runId) {
    console.log(`[seed] M43 UI fixture created this run: ${m43Ui.created}; run ${m43Ui.runId.slice(0, 8)}; metrics ${m43Ui.metrics}`);
  }
  console.log(`[seed] row counts: ${JSON.stringify(counts)}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
