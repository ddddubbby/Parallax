import fixturePmfs from "../../../fixtures/ssr/fixture-pmfs.json";
import { pmfMean, scoreSsrResponse } from "@/core/ssr";
import { anchorStatementSets, getSsrAnchorSet } from "@/core/ssr-anchors";
import {
  commitValidExtraction,
  createPendingExtraction,
  getResponse,
  markExtractionDeadLettered,
  markExtractionRetrying,
  recordExtractionAttemptCost,
  requeueExtraction,
} from "@/db/repositories/extraction";
import { appendRunEvent, getRun, getRunMatrixKind } from "@/db/repositories/runner";
import { db } from "@/db/client";
import { resonanceStudies } from "@/db/schema";
import { EXTRACTION_ATTEMPTS } from "@/core/constants";
import { eq } from "drizzle-orm";
import { loadMockResonanceFixtures } from "@/providers/mock/fixtures";
import { ProviderCallError } from "@/providers/shared";
import type { EmbeddingProvider } from "@/providers/types";
import { resolveEmbeddingProvider } from "@/modules/runner/provider-resolver";

const SSR_VERSION = "ssr-v1";
const MOCK_SSR_MODEL = "mock-fixture";
const SSR_CALL_TIMEOUT_MS = Number(process.env.WORKER_PROVIDER_TIMEOUT_MS ?? 45_000);

interface ResonanceScoreContext {
  responseId: string;
  runId: string;
  runMode: string;
  rawText: string;
  anchorSetVersion: string;
}

interface FixturePmf {
  fixtureId: string;
  pmf: number[];
}

const FIXTURE_PMFS = new Map((fixturePmfs as FixturePmf[]).map((row) => [row.fixtureId, row.pmf]));
const anchorEmbeddingCache = new Map<string, number[][][]>();

export interface SsrScoringResult {
  outcome: "valid" | "dead_lettered";
  attempts: number;
}

async function buildContext(responseId: string): Promise<ResonanceScoreContext> {
  const response = await getResponse(responseId);
  if (!response) throw new Error(`response ${responseId} not found`);
  const run = await getRun(response.runId);
  if (!run) throw new Error(`run ${response.runId} not found`);
  const kind = await getRunMatrixKind(response.runId);
  if (kind?.kind !== "resonance" || !kind.resonanceStudyId) {
    throw new Error(`response ${responseId} does not belong to a resonance run`);
  }

  const [study] = await db
    .select({ anchorSetVersion: resonanceStudies.anchorSetVersion })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, kind.resonanceStudyId));
  if (!study) throw new Error(`resonance study ${kind.resonanceStudyId} not found`);

  return {
    responseId,
    runId: response.runId,
    runMode: run.runMode,
    rawText: response.rawText,
    anchorSetVersion: study.anchorSetVersion,
  };
}

function assertPmf(pmf: number[], label: string) {
  if (pmf.length !== 5 || pmf.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be a five-point non-negative PMF`);
  }
  const sum = pmf.reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-6) throw new Error(`${label} must sum to 1`);
}

function mockFixturePmf(rawText: string) {
  const fixture = loadMockResonanceFixtures().find((row) => row.text === rawText);
  if (!fixture) throw new Error("No mock resonance fixture matches this response text");
  const pmf = FIXTURE_PMFS.get(fixture.id);
  if (!pmf) throw new Error(`No SSR fixture PMF mapped for ${fixture.id}`);
  assertPmf(pmf, fixture.id);
  return {
    fixtureId: fixture.id,
    perSetPmfs: [pmf],
    pmf,
    meanScore: pmfMean(pmf),
  };
}

async function liveSsrScore(ctx: ResonanceScoreContext, provider: EmbeddingProvider) {
  const anchorSet = getSsrAnchorSet(ctx.anchorSetVersion);
  const statementSets = anchorStatementSets(anchorSet);
  const flatAnchorTexts = statementSets.flat();
  const cacheKey = `${ctx.anchorSetVersion}|${provider.defaultModel}`;

  let responseVector: number[];
  let anchorVectorSets = anchorEmbeddingCache.get(cacheKey);
  let model = provider.defaultModel;
  let tokens = 0;
  let costUsd = 0;

  if (!anchorVectorSets) {
    const embedded = await provider.embed({
      texts: [ctx.rawText, ...flatAnchorTexts],
      signal: AbortSignal.timeout(SSR_CALL_TIMEOUT_MS),
    });
    [responseVector] = embedded.vectors;
    const anchorVectors = embedded.vectors.slice(1);
    anchorVectorSets = [];
    for (let i = 0; i < statementSets.length; i++) {
      anchorVectorSets.push(anchorVectors.slice(i * 5, i * 5 + 5));
    }
    anchorEmbeddingCache.set(cacheKey, anchorVectorSets);
    model = embedded.model;
    tokens = embedded.tokens;
    costUsd = embedded.costUsd;
  } else {
    const embedded = await provider.embed({
      texts: [ctx.rawText],
      signal: AbortSignal.timeout(SSR_CALL_TIMEOUT_MS),
    });
    [responseVector] = embedded.vectors;
    model = embedded.model;
    tokens = embedded.tokens;
    costUsd = embedded.costUsd;
  }

  return { ...scoreSsrResponse(responseVector!, anchorVectorSets), model, tokens, costUsd };
}

function ssrPayload(input: {
  anchorSetVersion: string;
  pmf: number[];
  perSetPmfs: number[][];
  meanScore: number;
  fixtureId?: string;
}) {
  return {
    kind: "ssr",
    ssrVersion: SSR_VERSION,
    anchorSetVersion: input.anchorSetVersion,
    calibrated: getSsrAnchorSet(input.anchorSetVersion).calibrated,
    pmf: input.pmf,
    perSetPmfs: input.perSetPmfs,
    meanScore: input.meanScore,
    ...(input.fixtureId ? { fixtureId: input.fixtureId } : {}),
  };
}

async function runScoringPipeline(
  extractionId: string,
  ctx: ResonanceScoreContext,
  providerOverride?: EmbeddingProvider,
): Promise<SsrScoringResult> {
  if (ctx.runMode === "mock") {
    const scored = mockFixturePmf(ctx.rawText);
    await commitValidExtraction(
      extractionId,
      ssrPayload({ ...scored, anchorSetVersion: ctx.anchorSetVersion }),
      MOCK_SSR_MODEL,
      [],
      [],
    );
    return { outcome: "valid", attempts: 1 };
  }

  let attempts = 0;
  let lastError = "";
  while (attempts < EXTRACTION_ATTEMPTS) {
    attempts++;
    try {
      const provider = providerOverride ?? (await resolveEmbeddingProvider());
      const scored = await liveSsrScore(ctx, provider);
      await recordExtractionAttemptCost(ctx.runId, extractionId, {
        costUsd: scored.costUsd,
        tokensIn: scored.tokens,
        tokensOut: 0,
      });
      await commitValidExtraction(
        extractionId,
        ssrPayload({ ...scored, anchorSetVersion: ctx.anchorSetVersion }),
        scored.model,
        [],
        [],
      );
      if (attempts > 1) {
        await appendRunEvent({
          runId: ctx.runId,
          level: "info",
          eventType: "ssr_retry_succeeded",
          message: `SSR scoring for response ${ctx.responseId} succeeded on attempt ${attempts}`,
        });
      }
      return { outcome: "valid", attempts };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const unsupported = err instanceof ProviderCallError && err.errorType === "unsupported_mode";
      if (attempts < EXTRACTION_ATTEMPTS && !unsupported) {
        await markExtractionRetrying(extractionId, lastError);
      }
      await appendRunEvent({
        runId: ctx.runId,
        level: attempts < EXTRACTION_ATTEMPTS ? "warn" : "error",
        eventType: attempts < EXTRACTION_ATTEMPTS ? "ssr_retry" : "ssr_dead_lettered",
        message: `SSR scoring ${attempts < EXTRACTION_ATTEMPTS ? "failed" : "dead-lettered"} (attempt ${attempts}): ${lastError}`,
      });
      if (unsupported) break;
    }
  }

  await markExtractionDeadLettered(extractionId, lastError);
  return { outcome: "dead_lettered", attempts };
}

export async function scoreResponse(responseId: string, providerOverride?: EmbeddingProvider): Promise<SsrScoringResult> {
  const ctx = await buildContext(responseId);
  const extractionId = await createPendingExtraction(responseId, 1);
  return runScoringPipeline(extractionId, ctx, providerOverride);
}

export async function reScoreResponse(responseId: string, providerOverride?: EmbeddingProvider): Promise<SsrScoringResult> {
  const ctx = await buildContext(responseId);
  const extractionId = await requeueExtraction(responseId);
  return runScoringPipeline(extractionId, ctx, providerOverride);
}
