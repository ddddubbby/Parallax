import { describe, expect, it } from "vitest";
import { TEMPLATE_SEED } from "./prompt-templates";
import { INTENT_ORDER } from "./matrix";
import {
  CATEGORY_ARCHETYPES,
  METRIC_GLOSSARY,
  PILLARS,
  intentToFrame,
  intentToPillar,
  metricIntentFilter,
  PILLAR_ORDER,
  pillarMetricLabels,
  resolveGlossary,
  type CategoryArchetype,
} from "./semantic";

describe("semantic layer (M11)", () => {
  it("maps every intent to a client-question pillar", () => {
    expect(Object.fromEntries(INTENT_ORDER.map((intent) => [intent, intentToPillar(intent)]))).toEqual({
      comparison: "position",
      consideration: "presence",
      validation: "perception",
      objection: "perception",
      discovery: "presence",
    });
  });

  it("keeps static glossary keys resolvable without prefix handling", () => {
    for (const key of Object.keys(METRIC_GLOSSARY)) {
      expect(resolveGlossary(key).key).toBe(key);
    }
  });

  it("seeds 3 archetype packs with 5 intents and 3 default-active variants each", () => {
    // M23 (D-079): the "3 variants per intent" invariant covers the
    // default-active pack only. Opt-in price/promo variants (v4/v5,
    // active:false) are additional, asserted separately below so this
    // count keeps proving the original PRD 8.4 seed contract.
    for (const archetype of Object.keys(CATEGORY_ARCHETYPES) as CategoryArchetype[]) {
      for (const intent of INTENT_ORDER) {
        const variants = TEMPLATE_SEED.filter(
          (t) => t.archetype === archetype && t.intent === intent && t.active !== false,
        );
        expect(variants, `${archetype}/${intent}`).toHaveLength(3);
      }
    }
    expect(TEMPLATE_SEED.filter((t) => t.active !== false)).toHaveLength(45);
  });

  it("seeds opt-in price/promo variants inactive by default (D-016 risk mitigation)", () => {
    const optIn = TEMPLATE_SEED.filter((t) => t.active === false);
    expect(optIn).toHaveLength(6); // 3 archetypes x (price + promo)
    for (const archetype of Object.keys(CATEGORY_ARCHETYPES) as CategoryArchetype[]) {
      const forArchetype = optIn.filter((t) => t.archetype === archetype);
      expect(forArchetype, archetype).toHaveLength(2);
      expect(forArchetype.map((t) => t.frameAspects).sort()).toEqual([["pricing"], ["promotions"]]);
      for (const t of forArchetype) {
        expect(t.intent, `${archetype} opt-in templates live within an existing intent`).toBe("comparison");
      }
    }
    expect(TEMPLATE_SEED).toHaveLength(51);
  });

  it("keeps consumer prompt packs out of B2B procurement idiom (AT-3)", () => {
    const forbidden: Partial<Record<CategoryArchetype, string[]>> = {
      consumer_product: ["vendor", "demo", "procurement", "teams evaluating"],
      consumer_venue: ["vendor", "demo", "procurement", "teams evaluating"],
    };

    for (const template of TEMPLATE_SEED) {
      const terms = forbidden[template.archetype] ?? [];
      for (const term of terms) {
        expect(template.text.toLowerCase(), `${template.archetype}/${template.intent}/${template.variantKey}`).not.toContain(term);
      }
    }
  });
});

describe("prompt-frame rule (D-054)", () => {
  it("maps intents to the frame their prompts plant", () => {
    expect(intentToFrame("discovery")).toBe("unbranded");
    expect(intentToFrame("consideration")).toBe("unbranded");
    expect(intentToFrame("comparison")).toBe("comparative");
    expect(intentToFrame("validation")).toBe("client_branded");
    expect(intentToFrame("objection")).toBe("client_branded");
  });

  it("presence and position rates count only intents that cannot plant their signal", () => {
    for (const key of ["mention_rate", "share_of_voice", "avg_first_position", "recommendation_rate", "citation_share"]) {
      expect(metricIntentFilter(key), key).toEqual(["discovery", "consideration"]);
    }
    expect(metricIntentFilter("comparative_win_rate")).toEqual(["comparison"]);
    expect(metricIntentFilter("sentiment_organic_positive")).toEqual(["discovery", "consideration"]);
    expect(metricIntentFilter("sentiment_solicited_negative")).toEqual(["validation"]);
  });

  it("frame-agnostic metrics (unplantable signals) are unfiltered", () => {
    for (const key of ["accuracy_rate", "stability_index", "attribute_low cost"]) {
      expect(metricIntentFilter(key), key).toBeNull();
    }
  });

  it("objection intent feeds no sentiment group (solicited-negative by design)", () => {
    for (const group of ["organic", "solicited"]) {
      for (const label of ["positive", "neutral", "mixed", "negative"]) {
        const allowed = metricIntentFilter(`sentiment_${group}_${label}`);
        expect(allowed, `sentiment_${group}_${label}`).not.toContain("objection");
      }
    }
  });

  it("resolves glossary entries for every frame-split sentiment key", () => {
    for (const group of ["organic", "solicited"]) {
      for (const label of ["positive", "neutral", "mixed", "negative"]) {
        const entry = resolveGlossary(`sentiment_${group}_${label}`);
        expect(entry.pillar).toBe("perception");
        expect(entry.computationSummary).toContain("D-054");
      }
    }
  });
});

describe("EL-1 pillar explainer metadata (M15)", () => {
  it("every pillar has non-empty business value and prompt description", () => {
    for (const p of PILLAR_ORDER) {
      expect(PILLARS[p].businessValue.length, p).toBeGreaterThan(0);
      expect(PILLARS[p].whatPromptsDo.length, p).toBeGreaterThan(0);
    }
  });

  it("pillarMetricLabels derives from the glossary and excludes the stability rail", () => {
    expect(pillarMetricLabels("presence")).toEqual(expect.arrayContaining(["Mention Rate", "Share of Voice"]));
    expect(pillarMetricLabels("position")).toEqual(expect.arrayContaining(["Comparative Win Rate"]));
    expect(pillarMetricLabels("perception")).toEqual(expect.arrayContaining(["Sentiment", "Attribute associations"]));
    for (const p of PILLAR_ORDER) {
      expect(pillarMetricLabels(p)).not.toContain("Stability Index");
    }
  });
});
