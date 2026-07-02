import { describe, expect, it } from "vitest";
import { mockProvider } from "./index";
import { loadMockFixtures } from "./fixtures";

describe("mockProvider", () => {
  it("has the required archetypes covered across 30-50 fixtures (MK-3)", () => {
    const fixtures = loadMockFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
    expect(fixtures.length).toBeLessThanOrEqual(50);
    const required = [
      "ranked_list_client_first",
      "ranked_list_competitor_first",
      "prose_comparison",
      "hedged_recommendation",
      "no_tracked_brands",
      "cited_multi_domain",
      "wrong_pricing_claim",
      "wrong_feature_claim",
      "unsupported_security_claim",
      "refusal",
      "truncated_output",
      "malformed_output",
      "low_stability_variant",
    ];
    const present = new Set(fixtures.map((f) => f.archetype));
    for (const archetype of required) expect(present.has(archetype)).toBe(true);
  });

  it("selects the same fixture for the same (text, rep) deterministically", async () => {
    const req = { promptText: "Compare LedgerFox and SpendPilot", mode: "ungrounded" as const, repIndex: 2 };
    const a = await mockProvider.generate(req);
    const b = await mockProvider.generate(req);
    expect(a.text).toBe(b.text);
  });

  it("varies fixture selection across rep indices (repeated sampling has variance)", async () => {
    const base = { promptText: "Compare LedgerFox and SpendPilot", mode: "ungrounded" as const };
    const results = await Promise.all(
      [0, 1, 2, 3, 4].map((repIndex) => mockProvider.generate({ ...base, repIndex })),
    );
    const distinctTexts = new Set(results.map((r) => r.text));
    expect(distinctTexts.size).toBeGreaterThan(1);
  });

  it("omits citations in ungrounded mode even if the fixture has them", async () => {
    // cited-01's text is long enough to be locatable; assert the contract instead of a specific fixture.
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        mockProvider.generate({ promptText: `probe-${i}`, mode: "ungrounded", repIndex: 0 }),
      ),
    );
    expect(results.every((r) => r.citations.length === 0)).toBe(true);
  });

  it("never throws — content archetypes are successful generations (D-011)", async () => {
    const fixtures = loadMockFixtures();
    const refusalFixture = fixtures.find((f) => f.archetype === "refusal");
    expect(refusalFixture).toBeDefined();
    await expect(
      mockProvider.generate({ promptText: "trigger", mode: "ungrounded", repIndex: 0 }),
    ).resolves.toBeDefined();
  });

  it("reports a small fixed cost per call", () => {
    const cost = mockProvider.estimateCostUsd({ promptText: "x", mode: "ungrounded" });
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(0.01);
  });
});
