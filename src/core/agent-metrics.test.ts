import { describe, expect, it } from "vitest";
import {
  computeAgentMetrics,
  computeEngineMetrics,
  descriptorRepeatability,
  identityRepeatability,
  metricStatus,
  type AgentSample,
} from "./agent-metrics";
import type { ClassifierIdentity } from "./agent-identity";

const PEPE: ClassifierIdentity = {
  name: "Pepe",
  symbol: "PEPE",
  address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
  chain: "ethereum",
};

function sample(over: Partial<AgentSample> & Pick<AgentSample, "lane" | "variantKey" | "rawText">): AgentSample {
  return { engine: "openai", citations: [], ...over };
}

describe("metricStatus", () => {
  it("labels by eligible-sample count", () => {
    expect(metricStatus(0)).toBe("not_estimable");
    expect(metricStatus(1)).toBe("directional");
    expect(metricStatus(29)).toBe("directional");
    expect(metricStatus(30)).toBe("estimable");
  });
});

describe("descriptorRepeatability (M6b)", () => {
  it("returns not_estimable — never 1 — when every pair is empty/empty", () => {
    // Two matched samples in one cell, both with empty descriptor sets.
    const result = descriptorRepeatability([[new Set<string>(), new Set<string>()]]);
    expect(result.score).toBeNull();
    expect(result.status).toBe("not_estimable");
  });

  it("computes Jaccard over non-empty-union matched pairs", () => {
    const result = descriptorRepeatability([[new Set(["meme", "ai"]), new Set(["meme"])]]);
    expect(result.score).toBeCloseTo(0.5); // |{meme}| / |{meme, ai}|
    expect(result.status).toBe("estimable");
  });
});

describe("identityRepeatability (M6a)", () => {
  it("scores agreement over pairs, skipping single-sample cells", () => {
    const result = identityRepeatability([
      ["matched", "matched", "namesake"], // 3 pairs: 1 agree (matched,matched) → 1/3
      ["matched"], // skipped (needs ≥2)
    ]);
    expect(result.usableCells).toBe(1);
    expect(result.totalPairs).toBe(3);
    expect(result.score).toBeCloseTo(1 / 3);
  });
});

describe("computeEngineMetrics", () => {
  const samples: AgentSample[] = [
    // Lane A: 2 mention, 1 absent
    sample({ lane: "A", variantKey: "a1", rawText: "Top tokens include Pepe ($PEPE) and others." }),
    sample({ lane: "A", variantKey: "a2", rawText: "Popular picks: Pepe is trending." }),
    sample({ lane: "A", variantKey: "a3", rawText: "I could not find notable tokens." }),
    // Lane B: matched (address), namesake (other contract), refusal
    sample({ lane: "B", variantKey: "b1", rawText: `Pepe ($PEPE) at ${PEPE.address} on Ethereum, a meme token.`, citations: [{ url: "https://etherscan.io/x", domain: "etherscan.io" }] }),
    sample({ lane: "B", variantKey: "b1", rawText: "Pepe (PEPE) here is the token 0x1111111111111111111111111111111111111111." }),
    sample({ lane: "B", variantKey: "b2", rawText: "I can't help with that request." }),
    // Lane C: matched with descriptors
    sample({ lane: "C", variantKey: "c1", rawText: `Pepe ($PEPE), contract ${PEPE.address} on Ethereum — a community meme project.` }),
  ];
  const m = computeEngineMetrics("openai", samples, PEPE);

  it("counts refusals separately from collected", () => {
    expect(m.collected).toBe(7);
    expect(m.refusals).toBe(1);
  });

  it("M1 discovery mention rate excludes refusals and uses Lane A only", () => {
    expect(m.discoveryMentionRate.numerator).toBe(2);
    expect(m.discoveryMentionRate.denominator).toBe(3);
  });

  it("M2 identity mix classifies Lane B non-refusal answers", () => {
    expect(m.identityMix.matched).toBe(1);
    expect(m.identityMix.namesake).toBe(1);
    expect(m.laneBNonRefusal).toBe(2);
  });

  it("M3 descriptor profile is computed separately for B and C matched answers", () => {
    const memeB = m.descriptorProfileB.find((d) => d.term === "meme");
    const memeC = m.descriptorProfileC.find((d) => d.term === "meme");
    expect(memeB?.numerator).toBe(1); // the one matched Lane B answer mentions "meme"
    expect(memeC?.numerator).toBe(1); // the one matched Lane C answer mentions "meme"
  });
});

describe("computeAgentMetrics", () => {
  it("groups by engine, never pools, and derives representation_state", () => {
    const samples: AgentSample[] = [
      sample({ engine: "openai", lane: "B", variantKey: "b1", rawText: `Pepe ($PEPE) at ${PEPE.address} on Ethereum.` }),
      sample({ engine: "google", lane: "B", variantKey: "b1", rawText: "No idea what that is." }),
    ];
    const result = computeAgentMetrics(samples, PEPE);
    expect(result.perEngine.map((e) => e.engine)).toEqual(["google", "openai"]);
    // sparse: openai has 1 matched, google 0, none reach 30.
    expect(result.representationState).toBe("sparse");
  });

  it("is idempotent — recompute yields identical output (C-5)", () => {
    const samples: AgentSample[] = [
      sample({ engine: "openai", lane: "A", variantKey: "a1", rawText: "Pepe is trending." }),
      sample({ engine: "openai", lane: "C", variantKey: "c1", rawText: `Pepe ($PEPE) ${PEPE.address} on Ethereum, a meme.` }),
    ];
    expect(JSON.stringify(computeAgentMetrics(samples, PEPE))).toBe(
      JSON.stringify(computeAgentMetrics(samples, PEPE)),
    );
  });
});
