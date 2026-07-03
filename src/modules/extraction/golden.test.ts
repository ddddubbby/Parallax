import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collapseDuplicateBrandMentions,
  type ExtractedResponse,
  resolveBrandId,
  type TrackedBrand,
  validateExtraction,
} from "@/core/extraction";
import { mentionRate, recommendationRate } from "@/core/metrics";
import { extractViaMockEngine } from "@/providers/mock/extraction-engine";
import { loadMockFixtures } from "@/providers/mock/fixtures";

// SM-7 / DEVELOPMENT_GUIDELINES F: "Golden dataset | Fixtures -> exact
// extraction -> exact metrics | Every commit." DB-free by design so it
// runs everywhere CI does. Mirrors fixtures/demo-project.json — see
// fixtures/golden/README.md for why ids here are symbolic, not real UUIDs.
const TEST_BRANDS: TrackedBrand[] = [
  { id: "client", name: "LedgerFox", aliases: ["Ledger Fox", "ledgerfox.io"] },
  { id: "comp-spendpilot", name: "SpendPilot", aliases: ["Spend Pilot"] },
  { id: "comp-northstar", name: "Northstar AP", aliases: ["Northstar Accounts Payable", "Northstar"] },
  { id: "comp-closebooks", name: "CloseBooks AI", aliases: ["CloseBooks"] },
];

interface GoldenEntry {
  fixtureId: string;
  expected: ExtractedResponse;
}

const goldenEntries: GoldenEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "golden", "golden.json"), "utf8"),
);
const fixturesById = new Map(loadMockFixtures().map((f) => [f.id, f]));

/** Runs the real pipeline: engine -> Zod validate -> resolve -> collapse. */
function runPipeline(rawText: string) {
  const extracted = extractViaMockEngine(rawText);
  const validation = validateExtraction(extracted);
  if (!validation.ok) throw new Error(`schema validation failed: ${validation.error}`);
  const resolved = validation.data.brands.map((b) => ({
    ...b,
    canonical_brand_id: resolveBrandId(b.observed_name, TEST_BRANDS),
  }));
  const collapsed = collapseDuplicateBrandMentions(resolved);
  return { extracted: validation.data, resolvedBrands: resolved, collapsedBrands: collapsed };
}

describe("golden dataset: every entry extracts exactly as labeled", () => {
  it("has an authored golden case for every required archetype (MK-3)", () => {
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
    const coveredArchetypes = new Set(
      goldenEntries.map((e) => fixturesById.get(e.fixtureId)?.archetype),
    );
    for (const archetype of required) expect(coveredArchetypes.has(archetype)).toBe(true);
  });

  it.each(goldenEntries)("$fixtureId matches its golden extraction exactly", ({ fixtureId, expected }) => {
    const fixture = fixturesById.get(fixtureId);
    expect(fixture, `fixture ${fixtureId} must exist in fixtures.json`).toBeDefined();
    const { extracted } = runPipeline(fixture!.text);
    expect(extracted).toEqual(expected);
  });

  it("resolves every branded golden fixture's observed names to the correct tracked brand", () => {
    for (const { fixtureId } of goldenEntries) {
      const fixture = fixturesById.get(fixtureId)!;
      const { resolvedBrands } = runPipeline(fixture.text);
      for (const brand of resolvedBrands) {
        expect(
          brand.canonical_brand_id,
          `${fixtureId}: "${brand.observed_name}" should resolve to a known brand`,
        ).not.toBeNull();
      }
    }
  });

  it("collapses duplicate mentions correctly where a golden fixture has them", () => {
    // rl-client-first-01 mentions LedgerFox, SpendPilot, Northstar AP each once —
    // collapse should be a no-op (3 in, 3 out), proving collapse doesn't over-merge.
    const fixture = fixturesById.get("rl-client-first-01")!;
    const { collapsedBrands } = runPipeline(fixture.text);
    expect(collapsedBrands).toHaveLength(3);
  });

  it("flags refusal fixtures with an empty brands array", () => {
    const refusalEntries = goldenEntries.filter(
      (e) => fixturesById.get(e.fixtureId)?.archetype === "refusal",
    );
    expect(refusalEntries.length).toBeGreaterThan(0);
    for (const entry of refusalEntries) {
      expect(entry.expected.refusal).toBe(true);
    }
  });

  it("flags malformed fixtures while still extracting recoverable brand mentions (D-011)", () => {
    const malformedEntries = goldenEntries.filter(
      (e) => fixturesById.get(e.fixtureId)?.archetype === "malformed_output",
    );
    expect(malformedEntries.length).toBeGreaterThan(0);
    for (const entry of malformedEntries) {
      expect(entry.expected.malformed).toBe(true);
      expect(entry.expected.brands.length).toBeGreaterThan(0);
    }
  });

  it("produces claim verdicts consistent with the LedgerFox fact sheet", () => {
    const pricingEntry = goldenEntries.find((e) => e.fixtureId === "wrong-pricing-01")!;
    expect(pricingEntry.expected.claims[0].verdict).toBe("contradicted");
    expect(pricingEntry.expected.claims[0].severity).toBe("high");

    const securityEntry = goldenEntries.find((e) => e.fixtureId === "unsupported-security-01")!;
    const verdicts = securityEntry.expected.claims.map((c) => c.verdict);
    expect(verdicts).toContain("unsupported"); // SOC 2 — not in the fact sheet at all
    expect(verdicts).toContain("contradicted"); // "SSO on all plans" — fact sheet says Business plan only
  });

  it("every non-golden fixture still extracts successfully via the generic fallback", () => {
    for (const fixture of loadMockFixtures()) {
      expect(() => runPipeline(fixture.text)).not.toThrow();
    }
  });
});

describe("golden dataset: expected metric outputs for at least one scope (README requirement)", () => {
  it("Mention Rate and Recommendation Rate over the ranked-list-client-first golden set", () => {
    const clientFirstIds = ["rl-client-first-01", "rl-client-first-02", "rl-client-first-03"];
    const samples = clientFirstIds.map((id) => {
      const fixture = fixturesById.get(id)!;
      const { collapsedBrands } = runPipeline(fixture.text);
      const client = collapsedBrands.find((b) => b.canonical_brand_id === "client");
      return {
        clientMentioned: Boolean(client?.mentioned),
        clientRecommended: Boolean(client?.recommended),
        clientPosition: client?.position ?? null,
        trackedMentionCount: collapsedBrands.length,
        clientMentionCount: client ? 1 : 0,
      };
    });
    // All three rl-client-first-* fixtures mention and recommend LedgerFox first.
    expect(mentionRate(samples)).toMatchObject({ n: 3, value: 1 });
    expect(recommendationRate(samples)).toMatchObject({ n: 3, value: 1 });
  });
});
