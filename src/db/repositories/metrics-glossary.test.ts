import { describe, expect, it } from "vitest";
import { PILLARS, resolveGlossary } from "@/core/semantic";
import { EMITTED_METRIC_KEY_EXAMPLES } from "./metrics";

describe("metrics glossary completeness", () => {
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
});
