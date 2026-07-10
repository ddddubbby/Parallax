/**
 * M34 v3 neutral-elicited development/held-out runner.
 * Raw artifacts are gitignored; manifests make resume identity immutable.
 */
import "../../src/env-bootstrap";
import { join } from "node:path";
import {
  OUT_DIR,
  ensureDirs,
  generateUngrounded,
  loadExistingOrNull,
  log,
  preflightCredentials,
  reportFatal,
  resolveLiveCredentials,
  writeJson,
} from "./shared";
import {
  V3_ADMISSION_PROMPTS,
  V3_DIAGNOSTIC_PROBES,
  V3_EXTRACTION_VERSION,
  V3_PROTOCOL_VERSION,
  V3_PROMPT_VERSION,
  V3_PREREGISTERED_RULES,
  hashCanonical,
  resolveV3Prompt,
  type PromptArm,
} from "./v3-protocol";
import {
  assertManifestMatch,
  createRunManifest,
  immutableManifestHash,
  rawTextHash,
  type RunManifest,
  type V3ExtractionRecord,
} from "./v3-core";
import { callV3BlindExtraction } from "./v3-live";

type ProviderChoice = "deepseek" | "openai";
type Stage = "development" | "heldout";

interface GenerationRecord {
  id: string;
  variantKey: string;
  repIndex: number;
  promptText: string;
  rawText: string;
  rawTextHash: string;
  model: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

interface V3Artifact {
  manifest: RunManifest;
  manifestHash: string;
  generations: GenerationRecord[];
  extractionManifest: Record<string, unknown> | null;
  extractionManifestHash: string | null;
  records: V3ExtractionRecord[];
  generationCostUsd: number;
  extractionCostUsd: number;
}

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requiredArg(name: string): string {
  const value = arg(name);
  if (!value?.trim()) throw new Error(`--${name}=... is required`);
  return value.trim();
}

function parseConfig() {
  const brandName = requiredArg("brand");
  const projectKey = requiredArg("project-key");
  const providerId = (arg("provider") ?? "deepseek") as ProviderChoice;
  if (providerId !== "deepseek" && providerId !== "openai") throw new Error("provider must be deepseek or openai");
  const stage = (arg("stage") ?? "development") as Stage;
  if (stage !== "development" && stage !== "heldout") throw new Error("stage must be development or heldout");
  const arm = (arg("arm") ?? "without_uncertainty_clause") as PromptArm;
  if (arm !== "with_uncertainty_clause" && arm !== "without_uncertainty_clause") {
    throw new Error("invalid prompt arm");
  }
  const repetitions = Number(arg("reps") ?? V3_PREREGISTERED_RULES.repetitionsPerVariant);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error("reps must be 1..5");
  const capUsd = Number(arg("cap-usd") ?? 2);
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("cap-usd must be positive");
  const includeProbes = process.argv.includes("--include-probes");
  const outputKey = `${stage}-${projectKey}-${providerId}-${arm}`.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return { brandName, projectKey, providerId, stage, arm, repetitions, capUsd, includeProbes, outputKey };
}

async function main() {
  ensureDirs();
  const config = parseConfig();
  if (config.stage === "heldout") {
    const protocol = loadExistingOrNull<{ status?: string }>(
      join(process.cwd(), "fixtures", "framing", "framing-protocol.v3.json"),
    );
    if (protocol?.status !== "frozen") {
      throw new Error("held-out generation is blocked until framing-protocol.v3.json status=frozen");
    }
  }
  await preflightCredentials([config.providerId, "deepseek"]);
  const generationCredentials = await resolveLiveCredentials(config.providerId);
  const extractionCredentials = await resolveLiveCredentials("deepseek");
  const prompts = [
    ...V3_ADMISSION_PROMPTS,
    ...(config.includeProbes ? V3_DIAGNOSTIC_PROBES : []),
  ].map((prompt) => ({
    variantKey: prompt.variantKey,
    text: resolveV3Prompt(prompt.text, config.brandName, config.arm),
  }));
  const temperature = config.providerId === "deepseek" ? 0.7 : null;
  const manifest = createRunManifest({
    stage: config.stage,
    projectKey: config.projectKey,
    brandName: config.brandName,
    providerId: config.providerId,
    generationMode: "ungrounded",
    modelRequested: generationCredentials.defaultModel ?? null,
    decoding: { temperature },
    promptProtocolVersion: V3_PROMPT_VERSION,
    promptArm: config.arm,
    prompts,
    repetitions: config.repetitions,
    sourceRunId: null,
    standardExtractionVersion: null,
    protocolVersion: V3_PROTOCOL_VERSION,
  });
  const manifestHash = immutableManifestHash(manifest);
  const outputPath = join(OUT_DIR, `v3-${config.outputKey}.json`);
  const existing = loadExistingOrNull<V3Artifact>(outputPath);
  if (existing) assertManifestMatch(existing.manifestHash, manifest);
  const artifact: V3Artifact = existing ?? {
    manifest,
    manifestHash,
    generations: [],
    extractionManifest: null,
    extractionManifestHash: null,
    records: [],
    generationCostUsd: 0,
    extractionCostUsd: 0,
  };
  const generationKeys = new Set(artifact.generations.map((item) => item.id));
  const generationTasks = prompts.flatMap((prompt) =>
    Array.from({ length: config.repetitions }, (_, index) => ({
      id: `${config.outputKey}-${prompt.variantKey}-r${index + 1}`,
      prompt,
      repIndex: index + 1,
    })),
  ).filter((task) => !generationKeys.has(task.id));
  for (let offset = 0; offset < generationTasks.length; offset += 3) {
    const batch = generationTasks.slice(offset, offset + 3);
    if (artifact.generationCostUsd + artifact.extractionCostUsd >= config.capUsd) {
      throw new Error(`$${config.capUsd} run cap reached before ${batch[0]!.id}`);
    }
    batch.forEach((task) => log("v3-run", `generate ${task.id}`));
    const generatedBatch = await Promise.all(
      batch.map(async (task) => {
        let lastError: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          try {
            return {
              ok: true as const,
              task,
              generated: await generateUngrounded(config.providerId, task.prompt.text),
            };
          } catch (error) {
            lastError = error;
            log(
              "v3-run",
              `generation ${task.id} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        return { ok: false as const, task, error: lastError };
      }),
    );
    for (const item of generatedBatch) {
      if (!item.ok) continue;
      const { task, generated } = item;
      artifact.generationCostUsd += generated.costUsd;
      artifact.generations.push({
        id: task.id,
        variantKey: task.prompt.variantKey,
        repIndex: task.repIndex,
        promptText: task.prompt.text,
        rawText: generated.text,
        rawTextHash: rawTextHash(generated.text),
        model: generated.model,
        costUsd: generated.costUsd,
        tokensIn: generated.tokensIn,
        tokensOut: generated.tokensOut,
      });
    }
    artifact.generations.sort((a, b) => a.id.localeCompare(b.id));
    writeJson(outputPath, artifact);
    const generationFailures = generatedBatch.filter((item) => !item.ok);
    if (generationFailures.length > 0) {
      throw new Error(
        `generation batch failed after retry: ${generationFailures.map((item) => item.task.id).join(", ")}; successful siblings were checkpointed`,
      );
    }
  }

  const extractionManifest = {
    manifestVersion: "m34-extraction-manifest.v1",
    generationManifestHash: manifestHash,
    rawTextHashes: artifact.generations
      .map((item) => ({ responseId: item.id, rawTextHash: item.rawTextHash }))
      .sort((a, b) => a.responseId.localeCompare(b.responseId)),
    extractionVersion: V3_EXTRACTION_VERSION,
    extractorProvider: "deepseek",
    extractorModelRequested: extractionCredentials.defaultModel ?? null,
    extractorDecoding: { temperature: 0 },
    protocolVersion: V3_PROTOCOL_VERSION,
  };
  const extractionManifestHash = hashCanonical(extractionManifest);
  if (artifact.extractionManifestHash && artifact.extractionManifestHash !== extractionManifestHash) {
    throw new Error("raw text or extraction protocol changed; start a new v3 run rather than resuming");
  }
  artifact.extractionManifest = extractionManifest;
  artifact.extractionManifestHash = extractionManifestHash;
  const extracted = new Set(artifact.records.map((item) => item.responseId));
  const extractionTasks = artifact.generations.filter((generated) => !extracted.has(generated.id));
  for (let offset = 0; offset < extractionTasks.length; offset += 3) {
    const batch = extractionTasks.slice(offset, offset + 3);
    if (artifact.generationCostUsd + artifact.extractionCostUsd >= config.capUsd) {
      throw new Error(`$${config.capUsd} run cap reached before extracting ${batch[0]!.id}`);
    }
    batch.forEach((generated) => log("v3-run", `extract ${generated.id}`));
    const extractedBatch = await Promise.all(
      batch.map(async (generated) => {
        try {
          return {
            ok: true as const,
            generated,
            result: await callV3BlindExtraction(extractionCredentials, {
              observedBrandName: config.brandName,
              rawText: generated.rawText,
            }),
          };
        } catch (error) {
          return { ok: false as const, generated, error };
        }
      }),
    );
    for (const item of extractedBatch) {
      if (!item.ok) continue;
      const { generated, result } = item;
      artifact.extractionCostUsd += result.costUsd;
      artifact.records.push({
        responseId: generated.id,
        projectKey: config.projectKey,
        brandName: config.brandName,
        lane: "neutral_elicited",
        providerId: config.providerId,
        generationMode: "ungrounded",
        sourceRunId: null,
        standardExtractionVersion: null,
        variantKey: generated.variantKey,
        cellId: null,
        repIndex: generated.repIndex,
        terminalState: result.terminalState,
        frames: result.frames,
        unsupportedFrameCount: result.unsupportedFrameCount,
        rawTextHash: generated.rawTextHash,
        extractorInputHash: result.extractorInputHash,
        generationManifestHash: manifestHash,
        extractionManifestHash,
        model: result.model,
        costUsd: result.costUsd,
      });
    }
    artifact.records.sort((a, b) => a.responseId.localeCompare(b.responseId));
    writeJson(outputPath, artifact);
    const extractionFailures = extractedBatch.filter((item) => !item.ok);
    if (extractionFailures.length > 0) {
      throw new Error(
        `extraction batch failed after retry: ${extractionFailures.map((item) => item.generated.id).join(", ")}; successful siblings were checkpointed`,
      );
    }
  }
  log(
    "v3-run",
    `complete ${artifact.records.length}/${artifact.generations.length}; cost=$${(artifact.generationCostUsd + artifact.extractionCostUsd).toFixed(4)}; artifact=${outputPath}`,
  );
}

main().catch((error) => process.exit(reportFatal(error)));
