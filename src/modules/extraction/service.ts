import { EXTRACTION_ATTEMPTS } from "@/core/constants";
import {
  collapseDuplicateBrandMentions,
  type ExtractedBrand,
  resolveBrandId,
  type TrackedBrand,
  validateExtraction,
} from "@/core/extraction";
import { normalizePhrase } from "@/core/intake";
import {
  commitValidExtraction,
  createPendingExtraction,
  getProjectBrandsForRun,
  getProjectFactClaims,
  getResponse,
  markExtractionDeadLettered,
  markExtractionRetrying,
  requeueExtraction as createRequeuedExtraction,
} from "@/db/repositories/extraction";
import { appendRunEvent, getRun } from "@/db/repositories/runner";
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
  outcome: "valid" | "dead_lettered";
  attempts: number;
}

interface PipelineContext {
  responseId: string;
  runId: string;
  rawText: string;
  trackedBrands: TrackedBrand[];
  clientBrandId: string | null;
  factClaimRows: Array<{ id: string; type: string; statement: string }>;
  injection: ExtractionInjection | null;
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
    const rawPayload = injected ? injectedInvalidPayload() : extractViaMockEngine(ctx.rawText);
    const validation = validateExtraction(rawPayload);

    if (validation.ok) {
      const resolvedBrands: ExtractedBrand[] = validation.data.brands.map((b) => ({
        ...b,
        canonical_brand_id: resolveBrandId(b.observed_name, ctx.trackedBrands),
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
        MOCK_EXTRACTION_MODEL,
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

  const [projectBrandRows, factClaimRows] = await Promise.all([
    getProjectBrandsForRun(run.projectId),
    getProjectFactClaims(run.projectId),
  ]);
  const trackedBrands: TrackedBrand[] = projectBrandRows.map((b) => ({
    id: b.id,
    name: b.name,
    aliases: (b.aliasesJson as string[]) ?? [],
  }));

  return {
    responseId,
    runId: response.runId,
    rawText: response.rawText,
    trackedBrands,
    clientBrandId: projectBrandRows.find((b) => b.role === "client")?.id ?? null,
    factClaimRows,
    injection: readExtractionInjection(run.debugFailureInjectionJson),
  };
}

/** Called by the worker right after a response is recorded (first extraction attempt, version 1). */
export async function extractResponse(responseId: string): Promise<ExtractionRunResult> {
  const ctx = await buildContext(responseId);
  const extractionId = await createPendingExtraction(responseId, 1);
  return runExtractionPipeline(extractionId, ctx);
}

/** AD-2: Debug "re-extract" — a fresh attempt as a new extraction_version, never overwriting the prior one (C-3). */
export async function reExtractResponse(responseId: string): Promise<ExtractionRunResult> {
  const ctx = await buildContext(responseId);
  const extractionId = await createRequeuedExtraction(responseId);
  return runExtractionPipeline(extractionId, ctx);
}
