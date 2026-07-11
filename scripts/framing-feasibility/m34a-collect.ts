/**
 * M34A neutral-evidence collection.
 *
 * This is deliberately a bounded development/workflow harness, not a worker
 * or production schema path. It captures full response provenance and runs
 * the adopted v4 offset extractor only as best-effort span assistance. A
 * failed assist records `extraction_failed` and leaves the raw response
 * available for human coding (D-099 / FE-2, FE-6).
 *
 * Example:
 *   pnpm framing:m34a:collect -- --project=insta360 --provider=deepseek \
 *     --run-id=insta360-m34a-dev-20260711 --reps=5 --cap-usd=2
 */
import "../../src/env-bootstrap";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db/client";
import { brands, projects } from "../../src/db/schema";
import type { FramingResponse, FramingStudy } from "../../src/core/framing-evidence";
import { FEASIBILITY_PROJECTS } from "./protocol";
import {
  FIXTURES_DIR,
  OUT_DIR,
  ensureDirs,
  generateUngrounded,
  loadExistingOrNull,
  log,
  preflightCredentials,
  reportFatal,
  resolvePrompt,
  resolveLiveCredentials,
  writeJson,
} from "./shared";
import { V4_EXTRACTION_MODEL, callV4SpanExtraction, type V4ExtractionResult } from "./v4-extract";
import { reserveM34ASpend, settleM34ASpend } from "./m34a-budget";

type ProjectKey = keyof typeof FEASIBILITY_PROJECTS;
type LiveProvider = "deepseek" | "openai";

interface PromptSet {
  version: string;
  status: string;
  admission: Array<{ variantKey: string; text: string }>;
}

interface AssistRecord {
  responseId: string;
  state: FramingResponse["terminalState"];
  spans: V4ExtractionResult["spans"];
  droppedSpans: number;
  parseError: string | null;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

interface M34ACollectionArtifact {
  artifactVersion: "m34a-collection.v1";
  createdAt: string;
  collection: {
    runId: string;
    projectKey: ProjectKey;
    providerId: LiveProvider;
    generationMode: "ungrounded";
    repetitions: number;
    capUsd: number;
    promptProtocolVersion: string;
    prompts: Array<{ variantKey: string; text: string }>;
    spanAssist: { extractorModel: string; mode: "best_effort" };
  };
  study: FramingStudy;
  assist: AssistRecord[];
  rawTextSha256: Record<string, string>;
  costs: { generationUsd: number; extractionUsd: number; totalUsd: number; capUsd: number };
}

function requiredArg(name: string): string {
  const value = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

function optionalArg(name: string): string | null {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
}

function parseProjectKey(value: string): ProjectKey {
  if (!(value in FEASIBILITY_PROJECTS)) throw new Error(`--project must be one of ${Object.keys(FEASIBILITY_PROJECTS).join(", ")}`);
  return value as ProjectKey;
}

function parseProvider(value: string): LiveProvider {
  if (value !== "deepseek" && value !== "openai") throw new Error("--provider must be deepseek or openai");
  return value;
}

function parsePositiveInt(value: string, label: string, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`${label} must be an integer between 1 and ${maximum}`);
  return number;
}

function parsePositiveNumber(value: string, label: string, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > maximum) throw new Error(`${label} must be >0 and <=${maximum}`);
  return number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function loadProject(projectKey: ProjectKey): Promise<{ id: string; label: string; brandName: string }> {
  const config = FEASIBILITY_PROJECTS[projectKey];
  const project = (await db.select().from(projects).where(eq(projects.slug, config.slug)))[0];
  if (!project) throw new Error(`Project ${config.slug} is missing; create/verify it before M34A collection`);
  const client = (await db.select().from(brands).where(eq(brands.projectId, project.id))).find((brand) => brand.role === "client");
  if (!client) throw new Error(`Project ${config.slug} has no client brand`);
  return { id: project.id, label: project.name, brandName: client.name };
}

function requireAdoptedPromptSet(): PromptSet {
  const path = join(FIXTURES_DIR, "representation-prompts.v4.json");
  const promptSet = loadExistingOrNull<PromptSet>(path);
  if (!promptSet || promptSet.status !== "adopted-m34a" || promptSet.version !== "representation-prompts.v4") {
    throw new Error("representation-prompts.v4.json is not the adopted M34A prompt protocol");
  }
  if (promptSet.admission.length === 0) throw new Error("M34A prompt set has no adopted admission prompts");
  return promptSet;
}

function assertResumeCompatible(existing: M34ACollectionArtifact, requested: M34ACollectionArtifact["collection"]): void {
  const current = existing.collection;
  const fields: Array<keyof M34ACollectionArtifact["collection"]> = [
    "runId",
    "projectKey",
    "providerId",
    "generationMode",
    "repetitions",
    "capUsd",
    "promptProtocolVersion",
  ];
  for (const field of fields) {
    if (current[field] !== requested[field]) throw new Error(`Existing collection has different ${field}; start a distinct run-id instead of resuming`);
  }
  if (JSON.stringify(current.prompts) !== JSON.stringify(requested.prompts)) {
    throw new Error("Existing collection uses a different prompt snapshot; start a distinct run-id instead of resuming");
  }
}

function updateCosts(artifact: M34ACollectionArtifact): void {
  const generationUsd = artifact.study.responses.reduce(
    (sum, response) => sum + Number((response as FramingResponse & { generationCostUsd?: number }).generationCostUsd ?? 0),
    0,
  );
  const extractionUsd = artifact.assist.reduce((sum, record) => sum + record.costUsd, 0);
  artifact.costs = {
    generationUsd: Number(generationUsd.toFixed(6)),
    extractionUsd: Number(extractionUsd.toFixed(6)),
    totalUsd: Number((generationUsd + extractionUsd).toFixed(6)),
    capUsd: artifact.collection.capUsd,
  };
}

function writeArtifact(path: string, artifact: M34ACollectionArtifact): void {
  updateCosts(artifact);
  writeJson(path, artifact);
}

async function main() {
  ensureDirs();
  const projectKey = parseProjectKey(requiredArg("project"));
  const providerId = parseProvider(requiredArg("provider"));
  const runId = requiredArg("run-id");
  const reps = parsePositiveInt(optionalArg("reps") ?? "5", "--reps", 5);
  const capUsd = parsePositiveNumber(optionalArg("cap-usd") ?? "5", "--cap-usd", 25);
  const outputPath = optionalArg("out") ?? join(OUT_DIR, `m34a-${runId}.json`);
  const promptSet = requireAdoptedPromptSet();
  const requiredProviders: LiveProvider[] = providerId === "openai" ? ["openai"] : ["deepseek", "openai"];
  await preflightCredentials(requiredProviders);
  const project = await loadProject(projectKey);
  const requestedCollection: M34ACollectionArtifact["collection"] = {
    runId,
    projectKey,
    providerId,
    generationMode: "ungrounded",
    repetitions: reps,
    capUsd,
    promptProtocolVersion: promptSet.version,
    prompts: promptSet.admission,
    spanAssist: { extractorModel: V4_EXTRACTION_MODEL, mode: "best_effort" },
  };
  const existing = existsSync(outputPath) ? loadExistingOrNull<M34ACollectionArtifact>(outputPath) : null;
  if (existing) assertResumeCompatible(existing, requestedCollection);
  const artifact: M34ACollectionArtifact = existing ?? {
    artifactVersion: "m34a-collection.v1",
    createdAt: new Date().toISOString(),
    collection: requestedCollection,
    study: {
      studyId: `m34a-${runId}`,
      projectId: project.id,
      projectLabel: project.label,
      observedBrandName: project.brandName,
      promptProtocolVersion: promptSet.version,
      createdAt: new Date().toISOString(),
      responses: [],
    },
    assist: [],
    rawTextSha256: {},
    costs: { generationUsd: 0, extractionUsd: 0, totalUsd: 0, capUsd },
  };
  const generatedIds = new Set(artifact.study.responses.map((response) => response.responseId));
  const assistedIds = new Set(artifact.assist.map((record) => record.responseId));
  const assistantCredentials = await resolveLiveCredentials("openai");

  for (const prompt of promptSet.admission) {
    const promptText = resolvePrompt(prompt.text, project.brandName);
    for (let rep = 1; rep <= reps; rep += 1) {
      const responseId = `${providerId}-${prompt.variantKey}-r${rep}`;
      if (!generatedIds.has(responseId)) {
        const reservationId = await reserveM34ASpend({
          runId,
          providerId,
          kind: "generation",
          responseId,
          runCapUsd: capUsd,
        });
        log("m34a-collect", `generate ${responseId}`);
        const generated = await generateUngrounded(providerId, promptText);
        settleM34ASpend(reservationId, generated.costUsd);
        const response: FramingResponse & { generationCostUsd: number } = {
          responseId,
          rawText: generated.text,
          lane: "neutral_elicited",
          promptVariant: prompt.variantKey,
          promptText,
          providerId,
          modelVersion: generated.model,
          generationMode: "ungrounded",
          observedAt: new Date().toISOString(),
          terminalState: "extraction_failed",
          generationCostUsd: generated.costUsd,
        };
        artifact.study.responses.push(response);
        artifact.rawTextSha256[responseId] = sha256(generated.text);
        generatedIds.add(responseId);
        writeArtifact(outputPath, artifact);
      }

      if (assistedIds.has(responseId)) continue;
      const response = artifact.study.responses.find((candidate) => candidate.responseId === responseId)!;
      const reservationId = await reserveM34ASpend({
        runId,
        providerId: "openai",
        kind: "span_assist",
        responseId,
        runCapUsd: capUsd,
      });
      log("m34a-collect", `span assist ${responseId}`);
      let assist: AssistRecord;
      try {
        const extracted = await callV4SpanExtraction(assistantCredentials, {
          observedBrandName: project.brandName,
          rawText: response.rawText,
        });
        settleM34ASpend(reservationId, extracted.costUsd);
        response.terminalState = extracted.state;
        assist = {
          responseId,
          state: extracted.state,
          spans: extracted.spans,
          droppedSpans: extracted.droppedSpans,
          parseError: extracted.parseError,
          model: extracted.model,
          costUsd: extracted.costUsd,
          tokensIn: extracted.tokensIn,
          tokensOut: extracted.tokensOut,
        };
      } catch (error) {
        response.terminalState = "extraction_failed";
        assist = {
          responseId,
          state: "extraction_failed",
          spans: [],
          droppedSpans: 0,
          parseError: error instanceof Error ? error.message : String(error),
          model: V4_EXTRACTION_MODEL,
          costUsd: 0,
          tokensIn: 0,
          tokensOut: 0,
        };
        log("m34a-collect", `span assist failed for ${responseId}; raw response remains available for human coding`);
      }
      artifact.assist.push(assist);
      assistedIds.add(responseId);
      writeArtifact(outputPath, artifact);
    }
  }
  updateCosts(artifact);
  const expected = promptSet.admission.length * reps;
  if (artifact.study.responses.length !== expected || artifact.assist.length !== expected) {
    throw new Error(`Collection incomplete: responses=${artifact.study.responses.length}/${expected}; assist=${artifact.assist.length}/${expected}`);
  }
  if (artifact.costs.totalUsd > capUsd) {
    throw new Error(`M34A collection reached $${artifact.costs.totalUsd}, exceeding its $${capUsd} cap; do not continue without a new run`);
  }
  writeArtifact(outputPath, artifact);
  log("m34a-collect", `complete ${artifact.study.responses.length} responses; $${artifact.costs.totalUsd}; artifact=${outputPath}`);
  await pool.end();
}

main().catch(async (error) => {
  const code = reportFatal(error);
  await pool.end().catch(() => undefined);
  process.exit(code);
});
