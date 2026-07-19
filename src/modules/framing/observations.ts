import { and, desc, eq, inArray } from "drizzle-orm";
import {
  deriveMockFramingObservations,
  buildBlindFramingPrompt,
  validateFramingObservations,
  type FramingObservation,
} from "@/core/framing-observations";
import {
  extractionProviderId,
  embeddingProviderId,
  findExceededDailyBudget,
} from "@/modules/runner/budget";
import {
  resolveEmbeddingProvider,
  resolveRuntimeProvider,
} from "@/modules/runner/provider-resolver";
import { mockEmbeddingProvider } from "@/providers/mock/embeddings";
import { db } from "@/db/client";
import {
  auditRuns,
  brands,
  framingObservations,
  matrixVersions,
  responses,
} from "@/db/schema";

// M44 / D-114 (themes v2): operator-triggered batch that runs the blind
// framing extractor over stored responses and embeds the resulting phrases,
// so theme clustering at read time is pure math over stored vectors. Mock
// responses use the deterministic mock extractor + mock embeddings ($0 —
// C-9's permanent demo path); live responses spend against the configured
// extraction + embedding engines under the C-2 daily budgets, with cost
// recorded on the row BEFORE validation (D-022: a billed call counts even
// when its output fails the fail-closed checks).

const LIVE_CALL_TIMEOUT_MS = 60_000;

export interface FramingObservationBatchResult {
  processed: number;
  valid: number;
  failed: number;
  skipped: number;
  costUsd: number;
}

async function clientBrandName(projectId: string): Promise<string> {
  const [row] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(and(eq(brands.projectId, projectId), eq(brands.role, "client")))
    .limit(1);
  if (!row) throw new Error("Project has no client brand — complete intake first");
  return row.name;
}

/** Completed-audit responses with their run mode, newest first. */
async function listObservationCandidates(projectId: string, limit: number) {
  return db
    .select({
      id: responses.id,
      rawText: responses.rawText,
      runMode: auditRuns.runMode,
    })
    .from(responses)
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    )
    .orderBy(desc(responses.createdAt))
    .limit(limit);
}

/** Latest row per response id (any state), for skip/version decisions. */
async function latestObservationRows(responseIds: string[]) {
  if (responseIds.length === 0) return new Map<string, { state: string; version: number }>();
  const rows = await db
    .select({
      responseId: framingObservations.responseId,
      state: framingObservations.state,
      version: framingObservations.version,
    })
    .from(framingObservations)
    .where(inArray(framingObservations.responseId, responseIds));
  const latest = new Map<string, { state: string; version: number }>();
  for (const row of rows) {
    const seen = latest.get(row.responseId);
    if (!seen || row.version > seen.version) latest.set(row.responseId, row);
  }
  return latest;
}

export async function buildFramingObservations(
  projectId: string,
  limit = 60,
): Promise<FramingObservationBatchResult> {
  const brandName = await clientBrandName(projectId);
  const candidates = await listObservationCandidates(projectId, limit);
  const latest = await latestObservationRows(candidates.map((c) => c.id));

  const pending = candidates.filter((c) => latest.get(c.id)?.state !== "valid");
  const result: FramingObservationBatchResult = {
    processed: 0,
    valid: 0,
    failed: 0,
    skipped: candidates.length - pending.length,
    costUsd: 0,
  };
  if (pending.length === 0) return result;

  // C-2: one budget gate before any live spend. Mock-only batches never trip
  // it (mock is exempt by id inside findExceededDailyBudget).
  const hasLive = pending.some((c) => c.runMode !== "mock");
  if (hasLive) {
    const trip = await findExceededDailyBudget([extractionProviderId(), embeddingProviderId()]);
    if (trip) {
      throw new Error(
        `Daily budget for ${trip.providerId} is exhausted ($${trip.spentUsd.toFixed(2)} of $${trip.budgetUsd.toFixed(2)}) — framing extraction refused (C-2)`,
      );
    }
  }

  for (const candidate of pending) {
    const isMock = candidate.runMode === "mock";
    const version = (latest.get(candidate.id)?.version ?? 0) + 1;
    let observations: FramingObservation[] = [];
    let llmCostUsd = 0;
    let embeddingCostUsd = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | null = null;
    let embeddingModel: string | null = null;
    let error: string | null = null;
    let vectors: number[][] = [];

    try {
      if (isMock) {
        observations = deriveMockFramingObservations(brandName, candidate.rawText);
        model = "mock-framing-extractor-v1";
      } else {
        const provider = await resolveRuntimeProvider(extractionProviderId());
        const generated = await provider.generate(
          {
            promptText: buildBlindFramingPrompt(brandName, candidate.rawText),
            mode: "ungrounded",
            temperature: 0,
          },
          AbortSignal.timeout(LIVE_CALL_TIMEOUT_MS),
        );
        // D-022: billed regardless of what validation below decides.
        llmCostUsd = generated.costUsd;
        tokensIn = generated.tokensIn;
        tokensOut = generated.tokensOut;
        model = generated.modelVersion;
        observations = validateFramingObservations(candidate.rawText, JSON.parse(generated.text));
      }
      if (observations.length > 0) {
        const embedder = isMock ? mockEmbeddingProvider : await resolveEmbeddingProvider();
        const embedded = await embedder.embed({
          texts: observations.map((o) => o.phrase),
          signal: AbortSignal.timeout(LIVE_CALL_TIMEOUT_MS),
        });
        embeddingCostUsd = embedded.costUsd;
        embeddingModel = embedded.model;
        if (!Array.isArray(embedded.vectors) || embedded.vectors.length !== observations.length) {
          throw new Error("Embedding count does not match observation count");
        }
        vectors = embedded.vectors;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const state = error === null ? "valid" : "failed";
    await db.insert(framingObservations).values({
      responseId: candidate.id,
      version,
      state,
      observationsJson: error === null ? observations : [],
      vectorsJson: error === null ? vectors : [],
      model,
      embeddingModel,
      llmCostUsd: llmCostUsd.toFixed(6),
      embeddingCostUsd: embeddingCostUsd.toFixed(6),
      tokensIn,
      tokensOut,
      error,
    });
    result.processed += 1;
    result.costUsd += llmCostUsd + embeddingCostUsd;
    if (error === null) result.valid += 1;
    else result.failed += 1;
  }
  return result;
}
