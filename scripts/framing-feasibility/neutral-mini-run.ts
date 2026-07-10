/**
 * M34 Phase 0 — neutral-elicited mini-run.
 *
 * Fires the six candidate representation prompts × 5 reps against live
 * DeepSeek + OpenAI for Insta360 (the consumer_product hero brand).
 * Explicitly labeled a feasibility mini-run — never a production matrix.
 *
 * Bounded spend: aborts if cumulative cost exceeds NEUTRAL_MINI_RUN_CAP_USD.
 *
 * Usage: pnpm exec tsx scripts/framing-feasibility/neutral-mini-run.ts
 * Optional: --providers=deepseek (or openai, or deepseek,openai)
 * Optional: --reps=2 for a cheaper smoke (default 5)
 * Optional: --skip-extract to only generate (resume extract later with --extract-only)
 */
import "../../src/env-bootstrap";
import { eq } from "drizzle-orm";
import { join } from "node:path";
import { db, pool } from "../../src/db/client";
import { brands, projects } from "../../src/db/schema";
import {
  DRAFT_ELIGIBILITY,
  FEASIBILITY_PROJECTS,
  NEUTRAL_MINI_RUN_CAP_USD,
  REPRESENTATION_PROMPTS_V1,
} from "./protocol";
import {
  OUT_DIR,
  callBlindFrameExtraction,
  ensureDirs,
  generateUngrounded,
  loadExistingOrNull,
  log,
  preflightCredentials,
  reportFatal,
  resolveLiveCredentials,
  resolvePrompt,
  writeJson,
  type FrameExtractionRecord,
} from "./shared";

const SCOPE = "neutral-mini-run";
const GEN_PATH = join(OUT_DIR, "neutral-generations.json");
const OUT_PATH = join(OUT_DIR, "neutral-frames.json");

type ProviderChoice = "deepseek" | "openai";

interface GenerationRecord {
  id: string;
  projectSlug: string;
  brandName: string;
  providerId: ProviderChoice;
  generationMode: "ungrounded";
  variantKey: string;
  promptText: string;
  repIndex: number;
  rawText: string;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  /** Per-engine protocol parameter; `null` = omitted (model default). gpt-5.5 rejects non-default values. */
  temperature: number | null;
}

function parseProviders(): ProviderChoice[] {
  const arg = process.argv.find((a) => a.startsWith("--providers="));
  const raw = arg?.slice("--providers=".length) ?? "deepseek,openai";
  const list = raw.split(",").map((s) => s.trim()) as ProviderChoice[];
  for (const p of list) {
    if (p !== "deepseek" && p !== "openai") throw new Error(`Unsupported provider: ${p}`);
  }
  return list;
}

function parseReps(): number {
  const arg = process.argv.find((a) => a.startsWith("--reps="));
  if (!arg) return DRAFT_ELIGIBILITY.repetitionsPerVariant;
  const n = Number(arg.slice("--reps=".length));
  if (!Number.isFinite(n) || n < 1 || n > 5) throw new Error("--reps must be 1..5");
  return n;
}

async function loadInsta360Brand(): Promise<{ projectId: string; brandName: string }> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, FEASIBILITY_PROJECTS.insta360.slug));
  if (!project) throw new Error(`Insta360 project not found (slug ${FEASIBILITY_PROJECTS.insta360.slug})`);
  const clientBrand = (await db.select().from(brands).where(eq(brands.projectId, project.id))).find(
    (b) => b.role === "client",
  );
  if (!clientBrand) throw new Error("Insta360 client brand row missing");
  return { projectId: project.id, brandName: clientBrand.name };
}

async function runGenerations(providers: ProviderChoice[], reps: number): Promise<GenerationRecord[]> {
  const { brandName } = await loadInsta360Brand();
  const existing = loadExistingOrNull<{ generations: GenerationRecord[] }>(GEN_PATH);
  const generations: GenerationRecord[] = existing?.generations ?? [];
  const seen = new Set(generations.map((g) => `${g.providerId}|${g.variantKey}|${g.repIndex}`));
  let totalCost = generations.reduce((s, g) => s + g.costUsd, 0);

  log(SCOPE, `brand=${brandName}; providers=${providers.join(",")}; reps=${reps}; resume=${seen.size} existing`);

  for (const providerId of providers) {
    for (const prompt of REPRESENTATION_PROMPTS_V1) {
      const promptText = resolvePrompt(prompt.text, brandName);
      for (let repIndex = 1; repIndex <= reps; repIndex++) {
        const key = `${providerId}|${prompt.variantKey}|${repIndex}`;
        if (seen.has(key)) {
          log(SCOPE, `skip existing ${key}`);
          continue;
        }
        if (totalCost >= NEUTRAL_MINI_RUN_CAP_USD) {
          throw new Error(`Spend cap $${NEUTRAL_MINI_RUN_CAP_USD} reached before ${key} (spent $${totalCost.toFixed(4)})`);
        }
        log(SCOPE, `generate ${key}`);
        const result = await generateUngrounded(providerId, promptText);
        totalCost += result.costUsd;
        const record: GenerationRecord = {
          id: `feas-${providerId}-${prompt.variantKey}-r${repIndex}`,
          projectSlug: FEASIBILITY_PROJECTS.insta360.slug,
          brandName,
          providerId,
          generationMode: "ungrounded",
          variantKey: prompt.variantKey,
          promptText,
          repIndex,
          rawText: result.text,
          model: result.model,
          costUsd: result.costUsd,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          temperature: result.temperature ?? null,
        };
        generations.push(record);
        seen.add(key);
        // Checkpoint after every call so a mid-run kill is resumable.
        writeJson(GEN_PATH, {
          note: "M34 Phase 0 neutral-elicited generations — feasibility mini-run, not a production matrix",
          brandName,
          projectSlug: FEASIBILITY_PROJECTS.insta360.slug,
          prompts: REPRESENTATION_PROMPTS_V1,
          totalCostUsd: totalCost,
          generations,
        });
      }
    }
  }

  log(SCOPE, `generations complete: ${generations.length} rows, $${totalCost.toFixed(4)}`);
  return generations;
}

async function runExtractions(generations: GenerationRecord[]): Promise<void> {
  const creds = await resolveLiveCredentials("deepseek");
  const existing = loadExistingOrNull<{ records: FrameExtractionRecord[]; totalCostUsd: number }>(OUT_PATH);
  const records: FrameExtractionRecord[] = existing?.records ?? [];
  const done = new Set(records.map((r) => r.sourceResponseId));
  let extractCost = existing?.totalCostUsd ?? 0;

  for (let i = 0; i < generations.length; i++) {
    const gen = generations[i]!;
    if (done.has(gen.id)) {
      log(SCOPE, `skip extract ${gen.id}`);
      continue;
    }
    log(SCOPE, `extract [${i + 1}/${generations.length}] ${gen.id}`);
    const result = await callBlindFrameExtraction(creds, {
      observedBrandName: gen.brandName,
      rawText: gen.rawText,
      sourceResponseId: gen.id,
    });
    extractCost += result.costUsd;
    records.push({
      sourceResponseId: gen.id,
      lane: "neutral_elicited",
      projectSlug: gen.projectSlug,
      brandName: gen.brandName,
      providerId: gen.providerId,
      generationMode: gen.generationMode,
      cellId: null,
      intent: "representation",
      variantKey: gen.variantKey,
      model: result.model,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      promptSnapshot: DRAFT_ELIGIBILITY.blindExtractionVersion,
      extractorInput: result.extractorInput,
      payload: result.payload,
      parseError: result.parseError,
      rawTextLength: gen.rawText.length,
      truncatedQuotes: result.truncatedQuotes,
      droppedFrames: result.droppedFrames,
    });
    writeJson(OUT_PATH, {
      note: "M34 Phase 0 neutral-elicited frame extractions — feasibility only",
      lane: "neutral_elicited",
      extractedAt: new Date().toISOString(),
      generationCount: generations.length,
      responseCount: records.length,
      totalCostUsd: extractCost,
      records,
    });
  }

  log(SCOPE, `extractions complete: ${records.length} rows, extract $${extractCost.toFixed(4)}`);
}

async function main() {
  ensureDirs();
  const skipExtract = process.argv.includes("--skip-extract");
  const extractOnly = process.argv.includes("--extract-only");
  const providers = parseProviders();
  const reps = parseReps();

  // Fail before spending: check exactly the credentials this invocation will
  // use — generation providers (skipped under --extract-only) plus the
  // DeepSeek blind extractor (skipped under --skip-extract).
  const required = new Set<ProviderChoice | "deepseek">();
  if (!extractOnly) for (const p of providers) required.add(p);
  if (!skipExtract) required.add("deepseek");
  await preflightCredentials([...required]);

  let generations: GenerationRecord[];
  if (extractOnly) {
    const existing = loadExistingOrNull<{ generations: GenerationRecord[] }>(GEN_PATH);
    if (!existing?.generations?.length) throw new Error(`--extract-only requires ${GEN_PATH}`);
    generations = existing.generations;
    log(SCOPE, `extract-only: loaded ${generations.length} generations`);
  } else {
    generations = await runGenerations(providers, reps);
  }

  if (!skipExtract) {
    await runExtractions(generations);
  } else {
    log(SCOPE, "skip-extract set — generations only");
  }

  await pool.end();
}

main().catch(async (err) => {
  const code = reportFatal(err);
  await pool.end().catch(() => undefined);
  process.exit(code);
});
