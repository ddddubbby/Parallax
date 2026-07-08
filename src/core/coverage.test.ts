import { describe, expect, it } from "vitest";
import { countAspects, evaluatePackCoverage, FRAME_ASPECT_LABELS } from "./coverage";
import { frameAspectsForCell, frameAspectsForTemplate, TEMPLATE_SEED } from "./prompt-templates";
import { RESONANCE_STUDY_TEMPLATES } from "./resonance-templates";

// M23 (D-079): the Evidence-Layer -> Simulation-Layer coverage contract
// (LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md synthesis section, 2c's verified
// price/promo gap). Pure, DB-free — the matrix page threads real cell data
// through frameAspectsForCell/countAspects into this.

describe("pack coverage contract (M23/D-079)", () => {
  it("labels every declared aspect", () => {
    for (const pack of RESONANCE_STUDY_TEMPLATES) {
      expect(FRAME_ASPECT_LABELS[pack.requiredAspect]).toBeTruthy();
    }
  });

  it("stamps gap when a matrix produces zero cells for a pack's required aspect", () => {
    // A matrix with only discovery/consideration/comparison (no validation,
    // no price/promo templates active) — presence + positioning present,
    // pricing/promotions/perception_attributes/factual_claims absent.
    const results = evaluatePackCoverage({ presence: 10, positioning: 5 });
    const priceResult = results.find((r) => r.packId === "price_presentation")!;
    const promoResult = results.find((r) => r.packId === "promo_framing")!;
    expect(priceResult.status).toBe("gap");
    expect(priceResult.cellCount).toBe(0);
    expect(promoResult.status).toBe("gap");
  });

  it("stamps ok once a pack's required aspect has at least one cell", () => {
    const results = evaluatePackCoverage({ pricing: 1, presence: 10 });
    const priceResult = results.find((r) => r.packId === "price_presentation")!;
    expect(priceResult.status).toBe("ok");
    expect(priceResult.cellCount).toBe(1);
  });

  it("today's default 45-template matrix covers ai_framing_repair and message_claim_variants but not price/promo", () => {
    // Reproduces the verified gap from LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md
    // 2c using the real default-active template set (no opt-in price/promo
    // templates activated) across all five intents for one archetype.
    const defaultAspects = TEMPLATE_SEED.filter(
      (t) => t.archetype === "b2b" && t.active !== false,
    ).map((t) => frameAspectsForTemplate(t));
    const counts = countAspects(defaultAspects);
    const results = evaluatePackCoverage(counts);
    const byId = Object.fromEntries(results.map((r) => [r.packId, r.status]));
    expect(byId.ai_framing_repair).toBe("ok");
    expect(byId.message_claim_variants).toBe("ok");
    expect(byId.price_presentation).toBe("gap");
    expect(byId.promo_framing).toBe("gap");
  });

  it("activating the opt-in price template closes the price_presentation gap", () => {
    const defaultAspects = TEMPLATE_SEED.filter((t) => t.archetype === "b2b" && t.active !== false).map(
      (t) => frameAspectsForTemplate(t),
    );
    const withPrice = [...defaultAspects, ["pricing"] as const];
    const results = evaluatePackCoverage(countAspects(withPrice.map((a) => [...a])));
    expect(results.find((r) => r.packId === "price_presentation")?.status).toBe("ok");
  });

  it("frameAspectsForCell resolves a real seed row and falls back for unknown variantKeys", () => {
    expect(frameAspectsForCell("b2b", "comparison", "v4")).toEqual(["pricing"]);
    expect(frameAspectsForCell("b2b", "comparison", "v5")).toEqual(["promotions"]);
    expect(frameAspectsForCell("b2b", "validation", "v1")).toEqual(["perception_attributes", "factual_claims"]);
    // Unknown variantKey (e.g. a future operator-authored template) falls
    // back to the intent's default rather than throwing.
    expect(frameAspectsForCell("b2b", "discovery", "does-not-exist")).toEqual(["presence"]);
  });
});
