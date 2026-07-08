import { describe, expect, it } from "vitest";
import { TEMPLATE_SEED } from "./prompt-templates";

// M28 (D-085): the grammar-consistency regression. Every seeded template
// row that interpolates {job_to_be_done} must accept a NOUN-PHRASE-style
// buyer goal (e.g. "night street photography", "spend management for a
// 20-person team") — the two verb-phrase framings this milestone fixed
// ("...trying to {job_to_be_done}", "...who wants to {job_to_be_done}")
// must never reappear in a future edit.
const VERB_PHRASE_PATTERNS = [/trying to \{job_to_be_done\}/i, /who wants to \{job_to_be_done\}/i];

describe("TEMPLATE_SEED job_to_be_done grammar (M28)", () => {
  const rowsWithJtbd = TEMPLATE_SEED.filter((t) => t.text.includes("{job_to_be_done}"));

  it("has at least one row using {job_to_be_done} (sanity — the assertion below would vacuously pass on an empty set)", () => {
    expect(rowsWithJtbd.length).toBeGreaterThan(0);
  });

  it("never frames {job_to_be_done} as a verb phrase", () => {
    const offenders = rowsWithJtbd.filter((t) =>
      VERB_PHRASE_PATTERNS.some((pattern) => pattern.test(t.text)),
    );
    expect(offenders).toEqual([]);
  });

  it("resolves to a grammatical sentence for a sample noun-phrase buyer goal, for every row", () => {
    const sample = "night street photography";
    for (const t of rowsWithJtbd) {
      const resolved = t.text.replace("{job_to_be_done}", sample);
      // Every rewritten/original slot is preceded by a preposition or verb
      // that already accepts a noun phrase directly ("for", "on", "at").
      // A leftover verb-phrase framing would read as "...trying to night
      // street photography", which is exactly what this test rejects above;
      // this second assertion just double-checks the resolved sentence
      // contains the sample without a dangling "to " immediately before it.
      expect(resolved).toContain(sample);
      expect(resolved).not.toMatch(/\bto night street photography\b/);
    }
  });
});
