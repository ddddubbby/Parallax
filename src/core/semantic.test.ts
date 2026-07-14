import { describe, expect, it } from "vitest";
import { TEMPLATE_SEED } from "./prompt-templates";
import { ALLOCATED_INTENT_ORDER, INTENT_ORDER } from "./matrix";
import {
  AUDIT_ARCHETYPES,
  METRIC_GLOSSARY,
  PILLARS,
  intentToFrame,
  intentToPillar,
  metricIntentFilter,
  metricAllowsIntent,
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
      representation: "perception",
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
    for (const archetype of AUDIT_ARCHETYPES) {
      for (const intent of ALLOCATED_INTENT_ORDER) {
        const variants = TEMPLATE_SEED.filter(
          (t) => t.archetype === archetype && t.intent === intent && t.active !== false,
        );
        expect(variants, `${archetype}/${intent}`).toHaveLength(3);
      }
    }
    expect(TEMPLATE_SEED.filter((t) => t.active !== false)).toHaveLength(55);
    for (const archetype of ["consumer_product", "consumer_venue"] as const) {
      const representation = TEMPLATE_SEED.filter(
        (template) => template.archetype === archetype && template.intent === "representation",
      );
      expect(representation.map((template) => template.variantKey)).toEqual([
        "a1",
        "a2",
        "a3",
        "a4",
        "a5",
      ]);
      expect(representation.every((template) =>
        template.frameAspects?.includes("framing_associations"),
      )).toBe(true);
    }
    expect(
      TEMPLATE_SEED.filter(
        (template) => template.archetype === "b2b" && template.intent === "representation",
      ),
    ).toHaveLength(0);
  });

  it("seeds opt-in price/promo variants inactive by default (D-016 risk mitigation)", () => {
    const optIn = TEMPLATE_SEED.filter((t) => t.active === false);
    expect(optIn).toHaveLength(6); // 3 archetypes x (price + promo)
    for (const archetype of AUDIT_ARCHETYPES) {
      const forArchetype = optIn.filter((t) => t.archetype === archetype);
      expect(forArchetype, archetype).toHaveLength(2);
      expect(forArchetype.map((t) => t.frameAspects).sort()).toEqual([["pricing"], ["promotions"]]);
      for (const t of forArchetype) {
        expect(t.intent, `${archetype} opt-in templates live within an existing intent`).toBe("comparison");
      }
    }
    expect(TEMPLATE_SEED).toHaveLength(61);
  });

  it("keeps every seed natural key unique for seed-twice idempotency", () => {
    const keys = TEMPLATE_SEED.map(
      (template) => `${template.archetype}|${template.intent}|${template.variantKey}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
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
    expect(intentToFrame("representation")).toBe("neutral_branded");
  });

  it("presence and position rates count only intents that cannot plant their signal", () => {
    for (const key of ["mention_rate", "share_of_voice", "avg_first_position", "recommendation_rate", "citation_share"]) {
      expect(metricIntentFilter(key), key).toEqual(["discovery", "consideration"]);
    }
    expect(metricIntentFilter("comparative_win_rate")).toEqual(["comparison"]);
    expect(metricIntentFilter("sentiment_organic_positive")).toEqual(["discovery", "consideration"]);
    expect(metricIntentFilter("sentiment_solicited_negative")).toEqual(["validation"]);
  });

  it("allows representation only for factual accuracy, including intent-pure scopes", () => {
    expect(metricIntentFilter("accuracy_rate")).toBeNull();
    expect(metricIntentFilter("stability_index")).not.toContain("representation");
    expect(metricIntentFilter("attribute_low cost")).not.toContain("representation");
    for (const key of [
      "mention_rate",
      "recommendation_rate",
      "share_of_voice",
      "avg_first_position",
      "comparative_win_rate",
      "citation_share",
      "stability_index",
      "sentiment_organic_positive",
      "sentiment_solicited_positive",
      "attribute_low cost",
    ]) {
      expect(metricAllowsIntent(key, "representation"), key).toBe(false);
      expect(metricAllowsIntent(key, "representation", true), `${key} intent-pure`).toBe(false);
    }
    expect(metricAllowsIntent("accuracy_rate", "representation")).toBe(true);
    expect(metricAllowsIntent("accuracy_rate", "representation", true)).toBe(true);
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
