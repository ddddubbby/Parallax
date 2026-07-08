import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// One C-14 forbidden-phrase list, shared with the resonance study-pack copy
// test and the audit report copy test, so a newly banned phrase strengthens
// every operator/client-adjacent surface at once (no drift). See
// src/core/resonance-templates.test.ts and src/core/report-templates.test.ts.
import { RESONANCE_TEMPLATE_FORBIDDEN_PHRASES } from "./resonance-templates";

// CALIBRATION_PROTOCOL.md is operator/client-adjacent prose (M26 QA gate):
// it must never read as promising a validated outcome, a purchase
// probability, or a guarantee of any kind, even while describing the
// machinery that COULD one day earn calibrated status. "guarant" (a bare
// stem, catching guarantee/guaranteed/guarantees) is stricter than the
// shared list's "guaranteed uplift" phrase and is added specifically for
// this doc per the M26 QA gate's explicit "no guaranteed" requirement.
const CALIBRATION_DOC_FORBIDDEN_PHRASES = [...RESONANCE_TEMPLATE_FORBIDDEN_PHRASES, "guarant"];

describe("CALIBRATION_PROTOCOL.md stays inside C-14 bounds", () => {
  it("contains no forbidden promissory/purchase-probability phrase", () => {
    const doc = readFileSync(join(process.cwd(), "CALIBRATION_PROTOCOL.md"), "utf8").toLowerCase();
    for (const phrase of CALIBRATION_DOC_FORBIDDEN_PHRASES) {
      expect(doc, `CALIBRATION_PROTOCOL.md should not contain "${phrase}"`).not.toContain(phrase);
    }
  });

  it("never claims the shipped anchor set is calibrated", () => {
    const doc = readFileSync(join(process.cwd(), "CALIBRATION_PROTOCOL.md"), "utf8");
    expect(doc).toMatch(/calibrated:\s*false/);
    // "calibrated: true" appears only inside the hypothetical/future-tense
    // sections (an example version string, a future-conditional sentence) —
    // never asserted as this sprint's shipped state.
    expect(doc).not.toMatch(/anchors? (?:is|are|ships?|ship) calibrated/i);
    expect(doc).not.toMatch(/purchase_intent\.v1["'` ]* (?:is|ships) calibrated/i);
  });
});
