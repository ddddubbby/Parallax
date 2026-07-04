import { describe, expect, it } from "vitest";
import { EMITTED_METRIC_KEY_EXAMPLES } from "@/db/repositories/metrics";
import { TEMPLATE_SEED } from "./prompt-templates";
import { INTENT_ORDER } from "./matrix";
import {
  CATEGORY_ARCHETYPES,
  METRIC_GLOSSARY,
  PILLARS,
  intentToPillar,
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

  it("resolves every emitted metric key to glossary metadata", () => {
    for (const key of EMITTED_METRIC_KEY_EXAMPLES) {
      const entry = resolveGlossary(key);
      expect(entry.label.length, key).toBeGreaterThan(0);
      expect(PILLARS[entry.pillar], key).toBeDefined();
      expect(entry.question.length, key).toBeGreaterThan(0);
      expect(entry.definition.length, key).toBeGreaterThan(0);
      expect(entry.computationSummary.length, key).toBeGreaterThan(0);
      expect(entry.intervalCaveat.length, key).toBeGreaterThan(0);
    }
  });

  it("keeps static glossary keys resolvable without prefix handling", () => {
    for (const key of Object.keys(METRIC_GLOSSARY)) {
      expect(resolveGlossary(key).key).toBe(key);
    }
  });

  it("seeds 3 archetype packs with 5 intents and 3 variants each", () => {
    for (const archetype of Object.keys(CATEGORY_ARCHETYPES) as CategoryArchetype[]) {
      for (const intent of INTENT_ORDER) {
        const variants = TEMPLATE_SEED.filter((t) => t.archetype === archetype && t.intent === intent);
        expect(variants, `${archetype}/${intent}`).toHaveLength(3);
      }
    }
    expect(TEMPLATE_SEED).toHaveLength(45);
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
