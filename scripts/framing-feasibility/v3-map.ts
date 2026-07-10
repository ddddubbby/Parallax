/** Blind LLM concept-mapping proposal. It never receives counts, variants, outcomes or brand facts. */
import "../../src/env-bootstrap";
import { basename, join } from "node:path";
import { z } from "zod";
import {
  OUT_DIR,
  ensureDirs,
  generateUngrounded,
  log,
  preflightCredentials,
  readJson,
  reportFatal,
  writeJson,
} from "./shared";
import type { BlindReviewPacket, LockedConceptMap } from "./v3-core";
import { V3_REVIEW_VERSION, sha256 } from "./v3-protocol";

const responseSchema = z.object({
  groups: z.array(
    z.object({
      canonical_concept: z.string().min(1),
      label_ids: z.array(z.string().min(1)).min(1),
    }),
  ),
  rejected_label_ids: z.array(z.string()),
});

type MapperResult = z.infer<typeof responseSchema>;
type GenerationResult = Awaited<ReturnType<typeof generateUngrounded>>;

const MAPPER_RULES = `Group labels ONLY when they express the same underlying concept, including legitimate cross-dimension polysemy. Treat organization-role wrappers as the same core identity: for example "running shoe", "running shoe company", "running shoe brand", and "running shoe manufacturer" map to one running-shoe concept. Singular/plural, hyphenation and maker/company/brand/manufacturer wording alone never create a new concept. Keep strategically distinct modifiers separate even when related (for example budget vs professional, product category vs quality attribute, or action camera vs 360 camera).`;

function parseMapperResult(text: string): MapperResult {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error("mapper returned no JSON object");
  return responseSchema.parse(JSON.parse(text.slice(firstBrace, lastBrace + 1)));
}

function assertCompleteDecision(parsed: MapperResult, expectedIds: readonly string[]) {
  const expected = new Set(expectedIds);
  const decided = [...parsed.groups.flatMap((group) => group.label_ids), ...parsed.rejected_label_ids];
  if (decided.length !== new Set(decided).size) throw new Error("mapper repeated an id");
  if (decided.length !== expected.size || decided.some((id) => !expected.has(id))) {
    throw new Error("mapper did not decide every id exactly once");
  }
}

async function callMapper(
  provider: "deepseek" | "openai",
  prompt: string,
): Promise<GenerationResult> {
  try {
    return await generateUngrounded(provider, prompt);
  } catch (error) {
    log("v3-map", `mapping call failed (${error instanceof Error ? error.message : String(error)}); retrying once`);
    return generateUngrounded(provider, prompt);
  }
}

function requiredArg(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`--${name}=... is required`);
  return value;
}

async function main() {
  ensureDirs();
  const packetPath = requiredArg("packet");
  const packet = readJson<BlindReviewPacket>(packetPath);
  const provider = (process.argv.find((item) => item.startsWith("--provider="))?.slice(11) ??
    "openai") as "deepseek" | "openai";
  if (provider !== "deepseek" && provider !== "openai") throw new Error("provider must be deepseek or openai");
  await preflightCredentials([provider]);
  const input = packet.items.map((item) => ({
    label_id: item.labelId,
    label: item.label,
    dimensions: item.dimensions,
    kinds: item.kinds,
    support_excerpt: item.supportExcerpt,
  }));
  const chunkSize = 30;
  const chunkGroups: Array<{ group_id: string; canonical_concept: string; label_ids: string[] }> = [];
  const rejectedLabelIds: string[] = [];
  const callResults: GenerationResult[] = [];
  const promptHashes: string[] = [];
  for (let offset = 0; offset < input.length; offset += chunkSize) {
    const chunk = input.slice(offset, offset + chunkSize);
    const prompt = `You are a blind concept-mapping reviewer. You do not know response counts, prompt variants, outcomes, intended positioning, or eligibility.

${MAPPER_RULES} Reject a label only when its excerpt does not support it or is about the wrong entity.

Return JSON only: {"groups":[{"canonical_concept":"lowercase noun phrase","label_ids":["..."]}],"rejected_label_ids":["..."]}
Every label_id below must appear exactly once.\n\nBLINDED ITEMS:\n${JSON.stringify(chunk)}`;
    promptHashes.push(sha256(prompt));
    const result = await callMapper(provider, prompt);
    callResults.push(result);
    const parsed = parseMapperResult(result.text);
    assertCompleteDecision(parsed, chunk.map((item) => item.label_id));
    parsed.groups.forEach((group, index) =>
      chunkGroups.push({
        group_id: `chunk-${offset / chunkSize + 1}-g${index + 1}`,
        canonical_concept: group.canonical_concept,
        label_ids: group.label_ids,
      }),
    );
    rejectedLabelIds.push(...parsed.rejected_label_ids);
  }

  const consolidationInput = chunkGroups.map((group) => ({
    label_id: group.group_id,
    label: group.canonical_concept,
    dimensions: [],
    kinds: [],
    support_excerpt: "",
  }));
  const consolidationPrompt = `You are consolidating blinded concept names created independently from chunks. You do not know counts, variants, outcomes, or eligibility.

${MAPPER_RULES} Do not reject any item; every group_id must appear in exactly one output group.

Return JSON only: {"groups":[{"canonical_concept":"lowercase noun phrase","label_ids":["group-id"]}],"rejected_label_ids":[]}
BLINDED CHUNK CONCEPTS:\n${JSON.stringify(consolidationInput)}`;
  promptHashes.push(sha256(consolidationPrompt));
  const consolidationResult = await callMapper(provider, consolidationPrompt);
  callResults.push(consolidationResult);
  const consolidated = parseMapperResult(consolidationResult.text);
  assertCompleteDecision(consolidated, chunkGroups.map((group) => group.group_id));
  if (consolidated.rejected_label_ids.length > 0) {
    throw new Error("consolidation mapper rejected a chunk concept despite the no-reject contract");
  }
  const conceptById = new Map<string, string>();
  const chunkGroupById = new Map(chunkGroups.map((group) => [group.group_id, group]));
  for (const group of consolidated.groups) {
    const conceptId = `concept-${sha256(group.canonical_concept.toLowerCase().trim()).slice(0, 12)}`;
    for (const groupId of group.label_ids) {
      for (const labelId of chunkGroupById.get(groupId)!.label_ids) conceptById.set(labelId, conceptId);
    }
  }
  const rejected = new Set(rejectedLabelIds);
  const locked: LockedConceptMap & { mappingProvenance: Record<string, unknown> } = {
    reviewVersion: V3_REVIEW_VERSION,
    packetHash: packet.packetHash,
    lockedAt: new Date().toISOString(),
    reviewer: "blind-concept-mapper.v2",
    mappings: packet.items.map((item) => ({
      labelId: item.labelId,
      conceptId: rejected.has(item.labelId) ? null : conceptById.get(item.labelId)!,
      action: rejected.has(item.labelId) ? "reject" : "accept",
    })),
    mappingProvenance: {
      models: [...new Set(callResults.map((result) => result.model))],
      provider,
      costUsd: callResults.reduce((sum, result) => sum + result.costUsd, 0),
      tokensIn: callResults.reduce((sum, result) => sum + result.tokensIn, 0),
      tokensOut: callResults.reduce((sum, result) => sum + result.tokensOut, 0),
      promptHashes,
      chunkSize,
      chunkGroupCount: chunkGroups.length,
      finalGroupCount: consolidated.groups.length,
      inputContract: ["label_id", "label", "dimensions", "kinds", "support_excerpt"],
      forbidden: ["counts", "variants", "cells", "providers", "prevalence", "eligibility", "brand facts"],
      humanGoldStatus: "pending",
    },
  };
  const outputPath = join(
    OUT_DIR,
    `${basename(packetPath).replace(/-review-packet\.json$/, "")}-concept-map.locked.json`,
  );
  writeJson(outputPath, locked);
  log("v3-map", `groups=${consolidated.groups.length}; rejected=${rejected.size}; output=${outputPath}`);
}

main().catch((error) => process.exit(reportFatal(error)));
