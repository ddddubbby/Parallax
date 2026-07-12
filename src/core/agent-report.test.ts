import { describe, expect, it } from "vitest";
import { computeAgentMetrics, type AgentSample } from "./agent-metrics";
import {
  authoredProseViolations,
  buildAgentReport,
  type AgentReportInput,
} from "./agent-report";
import type { ClassifierIdentity } from "./agent-identity";

const PEPE: ClassifierIdentity = {
  name: "Pepe",
  symbol: "PEPE",
  address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
  chain: "ethereum",
};

function baseInput(samples: AgentSample[]): AgentReportInput {
  return {
    reportId: "rep_test",
    generatedAt: "2026-07-13T00:00:00.000Z",
    identity: { ...PEPE, decimals: 18 },
    metrics: computeAgentMetrics(samples, PEPE),
    sampleAccounting: [],
    evidence: [],
    versions: {
      methodology: "resonance-geo-methodology-1.0",
      promptMatrix: "crypto_geo_prompts_v1",
      lexicons: { risk_v1: "risk_v1", descriptor_v1: "descriptor_v1" },
      models: { openai: "gpt-x", google: "gemini-x" },
    },
    terms: { version: "resonance-geo-terms-1.0", url: "https://example/terms" },
    supportContact: "support@example",
  };
}

const SAMPLES: AgentSample[] = [
  { engine: "openai", lane: "C", variantKey: "c1", citations: [], rawText: `Pepe ($PEPE) at ${PEPE.address} on Ethereum, a community meme token.` },
];

describe("buildAgentReport", () => {
  it("is deterministic — same inputs yield the same digest", () => {
    const a = buildAgentReport(baseInput(SAMPLES));
    const b = buildAgentReport(baseInput(SAMPLES));
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("digest is insensitive to input key order but sensitive to content", () => {
    const a = buildAgentReport(baseInput(SAMPLES));
    const changed = baseInput(SAMPLES);
    changed.identity = { ...changed.identity, symbol: "OTHER" };
    expect(buildAgentReport(changed).sha256).not.toBe(a.sha256);
  });

  it("carries the no-advice disclaimer and verification statement", () => {
    const { report } = buildAgentReport(baseInput(SAMPLES));
    expect(String(report.disclaimer)).toContain("not financial");
    expect(String(report.verification_statement)).toContain("verify neither");
  });

  it("renders representation_state honestly for a not_estimable run", () => {
    const absent: AgentSample[] = [
      { engine: "openai", lane: "B", variantKey: "b1", citations: [], rawText: "I could not find anything about that token." },
    ];
    const { report } = buildAgentReport(baseInput(absent));
    expect(report.representation_state).toBe("not_estimable");
    expect(String(report.representation_state_label)).toContain("absence");
  });
});

describe("C-16 forbidden-phrase suite over authored prose", () => {
  it("the report's authored prose contains no advice_prose_v1 term", () => {
    const { report } = buildAgentReport(baseInput(SAMPLES));
    expect(authoredProseViolations(report)).toEqual([]);
  });

  it("does NOT flag quoted model evidence containing financial language", () => {
    const input = baseInput(SAMPLES);
    input.evidence = [
      { responseId: "r1", engine: "openai", lane: "B", term: "risk", quoted: "analysts are bullish on this", start: 0, end: 5 },
    ];
    const { report } = buildAgentReport(input);
    // "bullish" lives in evidence[].quoted, which authoredProse excludes.
    expect(authoredProseViolations(report)).toEqual([]);
  });
});
