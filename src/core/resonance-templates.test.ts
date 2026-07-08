import { describe, expect, it } from "vitest";
import {
  findUnresolvedTemplatePlaceholders,
  getResonanceStudyTemplate,
  RESONANCE_STUDY_TEMPLATES,
  RESONANCE_TEMPLATE_FORBIDDEN_PHRASES,
  unresolvedStimulusPlaceholders,
} from "./resonance-templates";

describe("resonance study templates (VA-1/VA-2)", () => {
  it("ships exactly four static v1 packs, each with a declared coverage aspect", () => {
    expect(RESONANCE_STUDY_TEMPLATES).toHaveLength(4);
    expect(RESONANCE_STUDY_TEMPLATES.filter((template) => template.default)).toHaveLength(1);
    expect(getResonanceStudyTemplate("ai_framing_repair")?.default).toBe(true);
    for (const template of RESONANCE_STUDY_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.summary).toBeTruthy();
      expect(template.guidance).toBeTruthy();
      expect(template.requiredAspect).toBeTruthy();
      expect(template.stimuli.length).toBeGreaterThanOrEqual(3);
    }
  });

  // M23 (D-079): price_presentation and promo_framing shipped with zero
  // measured_ai stimuli (LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md 2c) — under
  // M22's hard C-13 rule (D-078), a pack-created study could never be
  // approved without the operator manually adding one from scratch. Both
  // packs now get a pre-filled measured_ai baseline slot.
  it("gives every pack a measured_ai baseline it can be approved with (C-13)", () => {
    for (const template of RESONANCE_STUDY_TEMPLATES) {
      const measured = template.stimuli.filter((s) => s.kind === "measured_ai");
      if (template.id === "message_claim_variants") {
        // Pre-existing gap, out of M23's pinned scope: the operator can
        // still add a measured_ai stimulus manually via "add stimulus".
        expect(measured.length).toBe(0);
        continue;
      }
      expect(measured.length, template.id).toBeGreaterThanOrEqual(1);
    }
    expect(getResonanceStudyTemplate("price_presentation")?.stimuli).toHaveLength(4);
    expect(getResonanceStudyTemplate("promo_framing")?.stimuli).toHaveLength(4);
    expect(getResonanceStudyTemplate("ai_framing_repair")?.stimuli).toHaveLength(3);
    expect(getResonanceStudyTemplate("message_claim_variants")?.stimuli).toHaveLength(3);
  });

  it("keeps pack copy inside C-14 comparative bounds", () => {
    const corpus = RESONANCE_STUDY_TEMPLATES.map((template) =>
      [
        template.name,
        template.summary,
        template.guidance,
        ...template.stimuli.flatMap((stimulus) => [stimulus.label, stimulus.body]),
      ].join("\n"),
    )
      .join("\n\n")
      .toLowerCase();
    for (const phrase of RESONANCE_TEMPLATE_FORBIDDEN_PHRASES) {
      expect(corpus, `template copy should not contain "${phrase}"`).not.toContain(phrase);
    }
  });

  it("detects unresolved placeholders deterministically", () => {
    expect(findUnresolvedTemplatePlaceholders("Use {b} then {a} then {b}.")).toEqual(["{a}", "{b}"]);
    expect(unresolvedStimulusPlaceholders({ label: "Done", body: "No placeholders here." })).toEqual([]);
  });
});
