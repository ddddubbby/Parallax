// M37 run integration: build the GEO agent report from a stored run's
// immutable responses (C-3/C-5). Pure metric/report logic lives in
// src/core/agent-*; this adapter only maps DB rows → AgentSample[] and fills
// M7 sample accounting from the jobs table. Identity is passed in (the persisted
// asset-identity snapshot lands with agent_orders in M39).

import { eq } from "drizzle-orm";
import { maskedLexiconHits } from "@/core/agent-extraction";
import { DESCRIPTOR_V1, RISK_V1 } from "@/core/agent-lexicons";
import type { ClassifierIdentity } from "@/core/agent-identity";
import { computeAgentMetrics, type AgentSample, type CryptoLane } from "@/core/agent-metrics";
import {
  buildAgentReport,
  METHODOLOGY_VERSION,
  type AgentReport,
  type EngineSampleAccounting,
  type QuoteReceipt,
} from "@/core/agent-report";
import {
  ADVICE_PROSE_V1_VERSION,
  DESCRIPTOR_V1_VERSION,
  PROMPT_CONTROL_V1_VERSION,
  REFUSAL_V1_VERSION,
  RISK_V1_VERSION,
} from "@/core/agent-lexicons";
import { CRYPTO_GEO_PROMPTS_VERSION } from "@/core/crypto-prompts";
import { db } from "@/db/client";
import { jobs, promptCells, responses } from "@/db/schema";

/** crypto_geo_prompts_v1 variant keys a1..a6, b1..b8, c1..c6 map to Lane A/B/C. */
function laneForVariant(variantKey: string): CryptoLane {
  const first = variantKey[0]?.toLowerCase();
  if (first === "a") return "A";
  if (first === "b") return "B";
  return "C";
}

interface Citation {
  url: string;
  domain: string;
}

export interface BuildAgentReportForRunInput {
  runId: string;
  identity: ClassifierIdentity & { decimals: number | null };
  models: Record<string, string>;
  reportId?: string;
  generatedAt?: string;
  terms?: { version: string; url: string };
  supportContact?: string;
  /** Max exemplar evidence receipts to embed (deduplicated quote index). */
  evidenceCap?: number;
}

/** Deduplicated exemplar receipts: first hit per (engine, lane, term). */
function buildEvidence(
  rows: { id: string; providerId: string; lane: CryptoLane; rawText: string }[],
  identity: ClassifierIdentity,
  cap: number,
): QuoteReceipt[] {
  const seen = new Set<string>();
  const receipts: QuoteReceipt[] = [];
  for (const row of rows) {
    for (const lexicon of [DESCRIPTOR_V1, RISK_V1]) {
      for (const hit of maskedLexiconHits(row.rawText, identity, lexicon)) {
        const key = `${row.providerId}|${row.lane}|${hit.term}`;
        if (seen.has(key)) continue;
        seen.add(key);
        receipts.push({
          responseId: row.id,
          engine: row.providerId,
          lane: row.lane,
          term: hit.term,
          quoted: hit.quoted,
          start: hit.start,
          end: hit.end,
        });
        if (receipts.length >= cap) return receipts;
      }
    }
  }
  return receipts;
}

export async function buildAgentReportForRun(input: BuildAgentReportForRunInput): Promise<AgentReport> {
  const rows = await db
    .select({
      id: responses.id,
      providerId: responses.providerId,
      variantKey: promptCells.variantKey,
      rawText: responses.rawText,
      citationsJson: responses.citationsJson,
    })
    .from(responses)
    .innerJoin(promptCells, eq(responses.cellId, promptCells.id))
    .where(eq(responses.runId, input.runId));

  const enriched = rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    variantKey: r.variantKey,
    lane: laneForVariant(r.variantKey),
    rawText: r.rawText,
    citations: ((r.citationsJson as Citation[]) ?? []).map((c) => ({ url: c.url, domain: c.domain })),
  }));

  const samples: AgentSample[] = enriched.map((r) => ({
    engine: r.providerId,
    lane: r.lane,
    variantKey: r.variantKey,
    rawText: r.rawText,
    citations: r.citations,
  }));

  const metrics = computeAgentMetrics(samples, input.identity);

  // M7 accounting from the jobs table (planned/errors/retries).
  const jobRows = await db
    .select({ providerId: jobs.providerId, state: jobs.state, attemptCount: jobs.attemptCount })
    .from(jobs)
    .where(eq(jobs.runId, input.runId));
  const sampleAccounting: EngineSampleAccounting[] = metrics.perEngine.map((engine) => {
    const engineJobs = jobRows.filter((j) => j.providerId === engine.engine);
    return {
      engine: engine.engine,
      planned: engineJobs.length,
      collected: engine.collected,
      refusals: engine.refusals,
      errors: engineJobs.filter((j) => j.state === "dead_lettered").length,
      retries: engineJobs.reduce((sum, j) => sum + Math.max(0, j.attemptCount - 1), 0),
    };
  });

  const evidence = buildEvidence(enriched, input.identity, input.evidenceCap ?? 200);

  return buildAgentReport({
    reportId: input.reportId ?? `rep_${input.runId}`,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    identity: {
      address: input.identity.address,
      chain: input.identity.chain,
      name: input.identity.name,
      symbol: input.identity.symbol,
      decimals: input.identity.decimals,
    },
    metrics,
    sampleAccounting,
    evidence,
    versions: {
      methodology: METHODOLOGY_VERSION,
      promptMatrix: CRYPTO_GEO_PROMPTS_VERSION,
      lexicons: {
        risk: RISK_V1_VERSION,
        descriptor: DESCRIPTOR_V1_VERSION,
        prompt_control: PROMPT_CONTROL_V1_VERSION,
        advice_prose: ADVICE_PROSE_V1_VERSION,
        refusal: REFUSAL_V1_VERSION,
      },
      models: input.models,
    },
    terms: input.terms ?? { version: "resonance-geo-terms-1.0", url: "https://resonance.example/terms" },
    supportContact: input.supportContact ?? "support@resonance.example",
  });
}
