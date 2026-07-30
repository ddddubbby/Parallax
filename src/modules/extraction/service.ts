import { EXTRACTION_ATTEMPTS } from "@/core/constants";
import { validateDebugFailureInjection } from "@/core/runner";
import { resolveWorkerTiming } from "@/core/worker-timing";
import {
  collapseDuplicateBrandMentions,
  type ExtractedBrand,
  mapAttributesToCanonical,
  resolveBrandId,
  type TrackedBrand,
  validateExtraction,
} from "@/core/extraction";
import { normalizePhrase } from "@/core/intake";
import {
  commitValidExtraction,
  createPendingExtraction,
  getProjectAttributeNames,
  getProjectBrandsForRun,
  getProjectFactClaims,
  getResponse,
  markExtractionDeadLettered,
  markExtractionRetrying,
  recordExtractionAttemptCost,
  requeueExtraction as createRequeuedExtraction,
} from "@/db/repositories/extraction";
import { appendRunEvent, getRun, getRunMatrixKind, hasRunEvent, pauseRun } from "@/db/repositories/runner";
import { resolveExtractionCredentials } from "@/modules/runner/provider-resolver";
import { CredentialConfigError } from "@/modules/settings/crypto";
import { scoreResponse, reScoreResponse } from "@/modules/resonance/scoring";
import {
  parseRecommendationResponse,
  reparseRecommendationResponse,
} from "@/modules/resonance/recommendation";
import { callDeepSeekExtraction } from "@/providers/deepseek/extraction";
import { MOCK_EXTRACTION_MODEL, extractViaMockEngine } from "@/providers/mock/extraction-engine";

// D-022: mock runs use fixture-backed extraction exclusively. D-029:
// test-only extraction-invalid injection lives in the same
// debug_failure_injection_json config as generation injection (D-027),
// under a distinct `extraction` key so the two failure classes stay
// independently controllable.
interface ExtractionInjection {
  invalidRate: number;
}

function readExtractionInjection(debugConfig: unknown): ExtractionInjection | null {
  if (validateDebugFailureInjection(debugConfig) !== null) return null;
  const config = debugConfig as { extraction?: ExtractionInjection } | null;
  return config?.extraction ?? null;
}

/** Deliberately invalid payload for SM-2/SM-3 retry/dead-letter testing. */
function injectedInvalidPayload() {
  return { schema_version: 1 }; // missing every other required field
}

function matchFactClaim(
  claimText: string,
  claimType: string,
  factClaims: Array<{ id: string; type: string; statement: string }>,
): string | null {
  // Deterministic keyword-overlap matching within the same claim type —
  // real fuzzy matching against an LLM-authored claim is an M8+ concern
  // once live extraction prompts can be given the fact sheet as context.
  const claimWords = new Set(normalizePhrase(claimText).split(" ").filter((w) => w.length > 3));
  let best: { id: string; overlap: number } | null = null;
  for (const fc of factClaims) {
    if (fc.type !== claimType) continue;
    const factWords = new Set(normalizePhrase(fc.statement).split(" ").filter((w) => w.length > 3));
    const overlap = [...claimWords].filter((w) => factWords.has(w)).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: fc.id, overlap };
  }
  return best?.id ?? null;
}

export interface ExtractionRunResult {
  outcome: "valid" | "dead_lettered" | "skipped";
  attempts: number;
}

interface PipelineContext {
  responseId: string;
  runId: string;
  runMode: string;
  matrixKind: "audit" | "resonance";
  rawText: string;
  trackedBrands: TrackedBrand[];
  clientBrandId: string | null;
  factClaimRows: Array<{ id: string; type: string; statement: string }>;
  desiredAttributes: string[];
  injection: ExtractionInjection | null;
}

/**
 * D-022/D-041 live extraction: ONE configured extraction engine for every
 * live run regardless of which provider generated the response (default
 * deepseek — see resolveExtractionCredentials). Client brand listed first,
 * since the prompt names it as "the CLIENT brand" by position.
 */
// Same deadline rationale as the worker's generation timeout — a hung
// extraction call must fail as a normal retryable attempt, not hang the
// pipeline (though unlike generation, the job is already succeeded by now,
// so no stale-lock duplication risk — just liveness).
const EXTRACTION_CALL_TIMEOUT_MS = resolveWorkerTiming().providerCallTimeoutMs;

async function runLiveExtraction(ctx: PipelineContext) {
  const credentials = await resolveExtractionCredentials();
  const orderedNames = [
    ...ctx.trackedBrands.filter((b) => b.id === ctx.clientBrandId).map((b) => b.name),
    ...ctx.trackedBrands.filter((b) => b.id !== ctx.clientBrandId).map((b) => b.name),
  ];
  return callDeepSeekExtraction(
    credentials,
    {
      rawText: ctx.rawText,
      trackedBrandNames: orderedNames,
      factClaims: ctx.factClaimRows.map((f) => ({ type: f.type, statement: f.statement })),
      desiredAttributes: ctx.desiredAttributes,
    },
    AbortSignal.timeout(EXTRACTION_CALL_TIMEOUT_MS),
  );
}

/** SM-1/SM-2/SM-3: validate, retry once with the error noted, dead-letter on second failure. */
async function runExtractionPipeline(
  extractionId: string,
  ctx: PipelineContext,
): Promise<ExtractionRunResult> {
  let attempt = 0;
  let lastError = "";
  while (attempt < EXTRACTION_ATTEMPTS) {
    attempt++;
    const injected = ctx.injection && Math.random() < ctx.injection.invalidRate;

    let rawPayload: unknown;
    let engineModel = MOCK_EXTRACTION_MODEL;

    if (injected) {
      rawPayload = injectedInvalidPayload();
    } else if (ctx.runMode === "mock") {
      rawPayload = extractViaMockEngine(ctx.rawText);
    } else {
      try {
        const live = await runLiveExtraction(ctx);
        rawPayload = live.payload;
        engineModel = live.model;
        // Billed whether or not the JSON below validates against our
        // schema — recorded now, independent of the retry/dead-letter/valid
        // outcome decided below.
        await recordExtractionAttemptCost(ctx.runId, extractionId, {
          costUsd: live.costUsd,
          tokensIn: live.tokensIn,
          tokensOut: live.tokensOut,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (err instanceof CredentialConfigError) {
          await markExtractionRetrying(extractionId, lastError);
          await pauseRun(ctx.runId);
          await appendRunEvent({
            runId: ctx.runId,
            level: "error",
            eventType: "worker_config_error",
            message: `Run paused before extraction because worker credential configuration is invalid: ${lastError}`,
          });
          return { outcome: "skipped", attempts: attempt };
        }
        if (attempt < EXTRACTION_ATTEMPTS) {
          await markExtractionRetrying(extractionId, lastError);
          await appendRunEvent({
            runId: ctx.runId,
            level: "warn",
            eventType: "extraction_retry",
            message: `Live extraction call failed (attempt ${attempt}): ${lastError}`,
          });
        }
        continue;
      }
    }

    const validation = validateExtraction(rawPayload);

    if (validation.ok) {
      const resolvedBrands: ExtractedBrand[] = validation.data.brands.map((b) => ({
        ...b,
        canonical_brand_id: resolveBrandId(b.observed_name, ctx.trackedBrands),
        // Map extracted attribute phrases to canonical names so metrics'
        // exact match works even if the extractor drifted (audit finding).
        attributes: mapAttributesToCanonical(b.attributes, ctx.desiredAttributes),
      }));
      const collapsed = collapseDuplicateBrandMentions(resolvedBrands);
      // SM-4 applies to citations too: the engine emits observed brand
      // NAMES in cited_for_brand_ids (it cannot know our row ids); we
      // resolve them here, dropping unrecognized names, so Citation Share
      // compares real ids against real ids.
      const resolvedCitations = validation.data.citations.map((c) => ({
        ...c,
        cited_for_brand_ids: c.cited_for_brand_ids
          .map((name) => resolveBrandId(name, ctx.trackedBrands))
          .filter((id): id is string => id !== null),
      }));
      // Claims are checkable statements about the client brand against its
      // fact sheet (MASTER_CONTEXT §3 misinformation register) — unlike
      // brands[].observed_name, claims carry no raw name to resolve, so
      // brand_id is the client's id whenever the claim is checkable at all.
      const claims = validation.data.claims.map((c) => ({
        brandId: ctx.clientBrandId,
        factClaimId: matchFactClaim(c.claim_text, c.claim_type, ctx.factClaimRows),
        claimText: c.claim_text,
        claimType: c.claim_type,
        verdict: c.verdict,
        severity: c.severity,
        evidenceQuote: c.evidence_quote,
      }));
      // extracted_json stores the RESOLVED extraction — canonical ids on
      // brands and citations — so metrics and drill-downs read one
      // consistent record. The unresolved engine output is reproducible
      // from raw_text + the engine version at any time (C-3, C-5).
      const resolvedData = {
        ...validation.data,
        brands: collapsed,
        citations: resolvedCitations,
      };
      await commitValidExtraction(
        extractionId,
        resolvedData,
        engineModel,
        // brand_mentions has no `mentioned` column (spec §2) — a row's
        // existence is the mention signal, so mentioned: false entries
        // (rare; an engine noting a brand was considered but absent) are
        // dropped here rather than persisted as a mention.
        collapsed.filter((b) => b.mentioned).map((b) => ({
          brandId: b.canonical_brand_id,
          observedName: b.observed_name,
          position: b.position,
          recommended: b.recommended,
          recommendationStrength: b.recommendation_strength,
          sentiment: b.sentiment,
          attributes: b.attributes,
          evidenceQuote: b.evidence_quote,
        })),
        claims,
      );
      if (attempt > 1) {
        await appendRunEvent({
          runId: ctx.runId,
          level: "info",
          eventType: "extraction_retry_succeeded",
          message: `Extraction for response ${ctx.responseId} succeeded on attempt ${attempt}`,
        });
      }
      return { outcome: "valid", attempts: attempt };
    }

    lastError = validation.error;
    if (attempt < EXTRACTION_ATTEMPTS) {
      await markExtractionRetrying(extractionId, lastError);
      await appendRunEvent({
        runId: ctx.runId,
        level: "warn",
        eventType: "extraction_retry",
        message: `Extraction validation failed (attempt ${attempt}): ${lastError}`,
      });
    }
  }

  await markExtractionDeadLettered(extractionId, lastError);
  await appendRunEvent({
    runId: ctx.runId,
    level: "error",
    eventType: "extraction_dead_lettered",
    message: `Extraction dead-lettered after ${EXTRACTION_ATTEMPTS} attempts: ${lastError}`,
  });
  return { outcome: "dead_lettered", attempts: attempt };
}

async function buildContext(responseId: string): Promise<PipelineContext> {
  const response = await getResponse(responseId);
  if (!response) throw new Error(`response ${responseId} not found`);
  const run = await getRun(response.runId);
  if (!run) throw new Error(`run ${response.runId} not found`);
  const kind = await getRunMatrixKind(response.runId);

  const [projectBrandRows, factClaimRows, desiredAttributes] = await Promise.all([
    getProjectBrandsForRun(run.projectId),
    getProjectFactClaims(run.projectId),
    getProjectAttributeNames(run.projectId),
  ]);
  const trackedBrands: TrackedBrand[] = projectBrandRows.map((b) => ({
    id: b.id,
    name: b.name,
    aliases: (b.aliasesJson as string[]) ?? [],
  }));

  return {
    responseId,
    runId: response.runId,
    runMode: run.runMode,
    matrixKind: kind?.kind === "resonance" ? "resonance" : "audit",
    rawText: response.rawText,
    trackedBrands,
    clientBrandId: projectBrandRows.find((b) => b.role === "client")?.id ?? null,
    factClaimRows,
    desiredAttributes,
    injection: readExtractionInjection(run.debugFailureInjectionJson),
  };
}

/** Called by the worker right after a response is recorded (first extraction attempt, version 1). */
export async function extractResponse(responseId: string): Promise<ExtractionRunResult> {
  const ctx = await buildContext(responseId);
  if (ctx.matrixKind === "resonance") {
    const kind = await getRunMatrixKind(ctx.runId);
    if (kind?.testType === "ai_recommendation") {
      return parseRecommendationResponse(responseId);
    }
    const result = await scoreResponse(responseId);
    const alreadyLogged = await hasRunEvent(ctx.runId, "resonance_ssr_scored");
    if (!alreadyLogged) {
      await appendRunEvent({
        runId: ctx.runId,
        level: "info",
        eventType: "resonance_ssr_scored",
        message: "Resonance responses are routed to SSR scoring; audit extraction remains walled off (C-12/M18)",
      });
    }
    return result;
  }
  const extractionId = await createPendingExtraction(responseId, 1);
  return runExtractionPipeline(extractionId, ctx);
}

/** AD-2: Debug "re-extract" — a fresh attempt as a new extraction_version, never overwriting the prior one (C-3). */
export async function reExtractResponse(responseId: string): Promise<ExtractionRunResult> {
  const ctx = await buildContext(responseId);
  if (ctx.matrixKind === "resonance") {
    const kind = await getRunMatrixKind(ctx.runId);
    if (kind?.testType === "ai_recommendation") {
      return reparseRecommendationResponse(responseId);
    }
    return reScoreResponse(responseId);
  }
  const extractionId = await createRequeuedExtraction(responseId, ["dead_lettered"]);
  return runExtractionPipeline(extractionId, ctx);
}

/** Worker-only stale recovery: latest row must be an old pending/retrying extraction. */
export async function recoverStaleExtraction(responseId: string): Promise<ExtractionRunResult> {
  const ctx = await buildContext(responseId);
  if (ctx.matrixKind === "resonance") {
    return reScoreResponse(responseId, undefined, ["pending", "retrying"]);
  }
  const extractionId = await createRequeuedExtraction(responseId, ["pending", "retrying"]);
  return runExtractionPipeline(extractionId, ctx);
}
