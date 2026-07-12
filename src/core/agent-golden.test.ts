// M37 golden dataset (AGENT_BUILD_PLAN §6.3 acceptance): hand-labeled crypto
// answers with independently-authored expected extractions. If mechanical
// extraction drifts, this fails — the point of a golden.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maskedLexiconHits } from "./agent-extraction";
import { DESCRIPTOR_V1, RISK_V1 } from "./agent-lexicons";
import { classifyIdentity, type ClassifierIdentity } from "./agent-identity";
import {
  computeAgentMetrics,
  isRefusal,
  mentionsToken,
  type AgentSample,
} from "./agent-metrics";

interface GoldenSample extends AgentSample {
  expect: {
    mention?: boolean;
    refusal?: boolean;
    identityClass?: string;
    descriptors?: string[];
    risk?: string[];
  };
}
interface Golden {
  identity: ClassifierIdentity & { decimals: number };
  samples: GoldenSample[];
  expected: {
    representationState: string;
    openai: Record<string, unknown>;
    google: Record<string, unknown>;
  };
}

const golden = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "mock-responses", "crypto", "golden-answers.json"), "utf8"),
) as Golden;
const identity = golden.identity;

function descriptorTerms(text: string): string[] {
  return [...new Set(maskedLexiconHits(text, identity, DESCRIPTOR_V1).map((h) => h.term))].sort();
}
function riskTerms(text: string): string[] {
  return [...new Set(maskedLexiconHits(text, identity, RISK_V1).map((h) => h.term))].sort();
}

describe("M37 golden — per-sample mechanical extraction matches hand labels", () => {
  for (const [i, s] of golden.samples.entries()) {
    it(`sample ${i} (${s.engine}/${s.lane}/${s.variantKey})`, () => {
      if (s.expect.refusal !== undefined) expect(isRefusal(s.rawText)).toBe(s.expect.refusal);
      if (s.expect.mention !== undefined) expect(mentionsToken(s, identity)).toBe(s.expect.mention);
      if (s.expect.identityClass !== undefined) {
        const cls = classifyIdentity({ rawText: s.rawText, citations: s.citations.map((c) => c.url) }, identity);
        expect(cls).toBe(s.expect.identityClass);
      }
      if (s.expect.descriptors !== undefined) {
        expect(descriptorTerms(s.rawText)).toEqual([...s.expect.descriptors].sort());
      }
      if (s.expect.risk !== undefined) {
        expect(riskTerms(s.rawText)).toEqual([...s.expect.risk].sort());
      }
    });
  }
});

describe("M37 golden — aggregate metrics match expected", () => {
  const metrics = computeAgentMetrics(golden.samples, identity);
  const byEngine = Object.fromEntries(metrics.perEngine.map((e) => [e.engine, e]));

  it("derives the expected representation_state", () => {
    expect(metrics.representationState).toBe(golden.expected.representationState);
  });

  for (const engine of ["openai", "google"] as const) {
    it(`${engine} identity mix, mention rate, and refusals`, () => {
      const e = byEngine[engine];
      const exp = golden.expected[engine];
      expect(e.identityMix).toEqual(exp.identityMix);
      expect(e.discoveryMentionRate.numerator).toBe(exp.mentionNumerator);
      expect(e.discoveryMentionRate.denominator).toBe(exp.mentionDenominator);
      expect(e.laneBMatched).toBe(exp.laneBMatched);
      expect(e.refusals).toBe(exp.refusals);
    });
  }

  it("recompute is idempotent (C-5)", () => {
    expect(JSON.stringify(computeAgentMetrics(golden.samples, identity))).toBe(
      JSON.stringify(metrics),
    );
  });
});
