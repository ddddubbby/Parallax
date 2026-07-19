import { describe, expect, it } from "vitest";
import {
  buildBlindFramingPrompt,
  deriveMockFramingObservations,
  validateFramingObservations,
} from "./framing-observations";
import { clusterFramingObservations, cosineSimilarity } from "./framing-themes";

const RAW =
  "LedgerFox is often described as the budget option for small finance teams. " +
  "Reviewers credit LedgerFox with reliable reconciliation. Northstar AP is the premium pick.";

describe("blind framing extractor contract (M44 / D-114)", () => {
  it("the prompt receives only brand name and raw text — blindness is structural", () => {
    const prompt = buildBlindFramingPrompt("LedgerFox", RAW);
    expect(prompt).toContain('"LedgerFox"');
    expect(prompt).toContain(RAW);
    expect(prompt).toContain("EXACT");
    // Two-argument function: there is no channel for fact sheet, competitors,
    // or desired positioning. This assertion pins the arity so a future
    // "helpful" context parameter fails the suite.
    expect(buildBlindFramingPrompt.length).toBe(2);
  });

  it("fail-closed: quotes must be verbatim substrings", () => {
    const good = {
      observations: [{ phrase: "framed as the budget option", quote: "described as the budget option" }],
    };
    expect(validateFramingObservations(RAW, good)).toHaveLength(1);
    const fabricated = {
      observations: [{ phrase: "framed as premium", quote: "LedgerFox is the premium market leader" }],
    };
    expect(() => validateFramingObservations(RAW, fabricated)).toThrow(/verbatim substring/);
    expect(() =>
      validateFramingObservations(RAW, { observations: [{ phrase: "", quote: "LedgerFox" }] }),
    ).toThrow();
    expect(() => validateFramingObservations(RAW, { observations: [], extra: true })).toThrow();
  });

  it("mock extractor is deterministic and brand-scoped", () => {
    const a = deriveMockFramingObservations("LedgerFox", RAW);
    const b = deriveMockFramingObservations("LedgerFox", RAW);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0].quote).toContain("budget option");
    expect(a.every((o) => RAW.includes(o.quote))).toBe(true);
    // Sentences about other brands only are not observations of this brand.
    expect(a.some((o) => o.quote.includes("Northstar"))).toBe(false);
    expect(deriveMockFramingObservations("", RAW)).toEqual([]);
  });
});

describe("deterministic theme clustering (M44 / D-114)", () => {
  const e = (x: number, y: number) => [x, y];

  it("clusters similar vectors, labels by the most central phrase, keeps the full denominator", () => {
    const themes = clusterFramingObservations(
      [
        { responseId: "r1", phrases: ["budget option"], vectors: [e(1, 0)] },
        { responseId: "r2", phrases: ["cheap choice"], vectors: [e(0.98, 0.2)] },
        { responseId: "r3", phrases: ["premium pick"], vectors: [e(0, 1)] },
      ],
      10,
    );
    expect(themes).toHaveLength(2);
    expect(themes[0]).toMatchObject({ matching: 2, total: 10 });
    expect(themes[0].responseIds.sort()).toEqual(["r1", "r2"]);
    expect(["budget option", "cheap choice"]).toContain(themes[0].label);
    expect(themes[0].key.startsWith("fo-")).toBe(true);
    expect(themes[1]).toMatchObject({ label: "premium pick", matching: 1, total: 10 });
  });

  it("is deterministic and caps at 8 themes", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      responseId: `r${i}`,
      phrases: [`p${i}`],
      // Orthogonal-ish distinct directions: never cluster together.
      vectors: [Array.from({ length: 12 }, (_, d) => (d === i ? 1 : 0))],
    }));
    const first = clusterFramingObservations(rows, 12);
    const second = clusterFramingObservations(rows, 12);
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
  });

  it("identical phrases across responses share one theme (mock-vector path)", () => {
    const v = [0.5, 0.5, 0.1];
    const themes = clusterFramingObservations(
      [
        { responseId: "r1", phrases: ["easy setup"], vectors: [v] },
        { responseId: "r2", phrases: ["easy setup"], vectors: [v] },
        { responseId: "r2", phrases: ["easy setup"], vectors: [v] },
      ],
      3,
    );
    expect(themes).toHaveLength(1);
    expect(themes[0].matching).toBe(2); // distinct responses, not observations
  });

  it("cosine handles zero vectors and empty input", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(clusterFramingObservations([], 0)).toEqual([]);
    expect(clusterFramingObservations([], 5)).toEqual([]);
  });
});
