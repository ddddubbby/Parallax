// GEO agent report builder (AGENT_PRD §10). Deterministic JSON rendered from
// the computed metrics — no LLM writes prose (D-033). The report is immutable
// with a SHA-256 digest (ETag). OUR authored prose obeys C-16 (no legitimacy/
// investment/price/trading language, forbidden-phrase enforced); quoted model
// evidence is attributed engine output and is NEVER our claim, so it is exempt.

import { createHash } from "node:crypto";
import { ADVICE_PROSE_V1, containsAnyLexiconTerm } from "./agent-lexicons";
import type { AgentMetrics } from "./agent-metrics";
import type { RepresentationState } from "./agent-identity";
import type { AssetChain } from "./crypto-resolver";

export const AGENT_REPORT_SCHEMA = "resonance-geo-report-1.0";
export const METHODOLOGY_VERSION = "resonance-geo-methodology-1.0";
export const RETENTION_DAYS = 365;

// --- Authored prose (C-16-governed). Kept as named constants so the
// forbidden-phrase suite can assert over exactly the strings we author. ---

const NO_ADVICE_DISCLAIMER =
  "This report describes how AI engines answer questions about a token. It is not financial, legal, or investment guidance and makes no claim about the project's quality, honesty, or worth.";

const VERIFICATION_STATEMENT =
  "We verify neither ownership, affiliation, legitimacy, safety, nor investment merit. We measure what AI engines say and quote it verbatim.";

const LIMITATIONS: readonly string[] = [
  "AI engine answers are probabilistic; figures are distributions over repeated samples, not fixed facts.",
  "Each engine is a separate population and is never combined with another.",
  "Counts come from fixed word lists and literal matching; no model interprets the answers.",
  "A metric labeled not_estimable or directional has too few eligible samples to report a stable figure.",
];

const REPRESENTATION_STATE_LABELS: Record<RepresentationState, string> = {
  estimable: "At least one engine described this token in enough answers to report stable figures.",
  sparse: "Some engines described this token, but none often enough to report a stable figure.",
  not_estimable: "No engine reliably described this token; the evidence is of absence, not of framing.",
};

export interface QuoteReceipt {
  responseId: string;
  engine: string;
  lane: string;
  term: string;
  quoted: string;
  start: number;
  end: number;
}

export interface EngineSampleAccounting {
  engine: string;
  planned: number;
  collected: number;
  refusals: number;
  errors: number;
  retries: number;
}

export interface AgentReportInput {
  reportId: string;
  generatedAt: string;
  identity: {
    address: string;
    chain: AssetChain;
    name: string;
    symbol: string;
    decimals: number | null;
  };
  metrics: AgentMetrics;
  sampleAccounting: EngineSampleAccounting[];
  evidence: QuoteReceipt[];
  versions: {
    methodology: string;
    promptMatrix: string;
    lexicons: Record<string, string>;
    models: Record<string, string>;
  };
  terms: { version: string; url: string };
  supportContact: string;
}

export interface AgentReport {
  report: Record<string, unknown>;
  sha256: string;
}

/** Recursively sort object keys so the digest is insertion-order independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Build the immutable report object and its SHA-256 digest (deterministic given inputs). */
export function buildAgentReport(input: AgentReportInput): AgentReport {
  const report: Record<string, unknown> = {
    schema: AGENT_REPORT_SCHEMA,
    report_id: input.reportId,
    generated_at: input.generatedAt,
    identity: input.identity,
    versions: input.versions,
    disclaimer: NO_ADVICE_DISCLAIMER,
    verification_statement: VERIFICATION_STATEMENT,
    representation_state: input.metrics.representationState,
    representation_state_label: REPRESENTATION_STATE_LABELS[input.metrics.representationState],
    engines: input.metrics.perEngine.map((engine) => ({
      engine: engine.engine,
      sample_accounting:
        input.sampleAccounting.find((s) => s.engine === engine.engine) ?? {
          engine: engine.engine,
          planned: 0,
          collected: engine.collected,
          refusals: engine.refusals,
          errors: 0,
          retries: 0,
        },
      metrics: engine,
    })),
    evidence: input.evidence,
    limitations: LIMITATIONS,
    terms: input.terms,
    retention_days: RETENTION_DAYS,
    support_contact: input.supportContact,
  };
  const sha256 = sha256Hex(JSON.stringify(canonicalize(report)));
  return { report, sha256 };
}

/**
 * Every string of OUR authored prose in a report — the fields the C-16
 * forbidden-phrase suite must scan. Deliberately EXCLUDES quoted model evidence
 * (evidence[].quoted), cited domains, and metric term labels, which are
 * attributed engine output or fixed lexicon vocabulary, never our claim.
 */
export function authoredProseFields(report: Record<string, unknown>): string[] {
  return [
    String(report.disclaimer ?? ""),
    String(report.verification_statement ?? ""),
    String(report.representation_state_label ?? ""),
    ...((report.limitations as string[]) ?? []),
  ];
}

/** C-16 guard: no authored prose string may contain an advice_prose_v1 term. */
export function authoredProseViolations(report: Record<string, unknown>): string[] {
  return authoredProseFields(report).filter((s) => containsAnyLexiconTerm(s, ADVICE_PROSE_V1));
}
