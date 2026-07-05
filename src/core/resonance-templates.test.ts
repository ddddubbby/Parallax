import { describe, expect, it } from "vitest";
import {
  findUnresolvedTemplatePlaceholders,
  getResonanceStudyTemplate,
  RESONANCE_STUDY_TEMPLATES,
  RESONANCE_TEMPLATE_FORBIDDEN_PHRASES,
  unresolvedStimulusPlaceholders,
} from "./resonance-templates";

describe("resonance study templates (VA-1/VA-2)", () => {
  it("ships exactly four static v1 packs with three stimuli each", () => {
    expect(RESONANCE_STUDY_TEMPLATES).toHaveLength(4);
    expect(RESONANCE_STUDY_TEMPLATES.filter((template) => template.default)).toHaveLength(1);
    expect(getResonanceStudyTemplate("ai_framing_repair")?.default).toBe(true);
    for (const template of RESONANCE_STUDY_TEMPLATES) {
      expect(template.name).toBeTruthy();
      expect(template.summary).toBeTruthy();
      expect(template.guidance).toBeTruthy();
      expect(template.stimuli).toHaveLength(3);
    }
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
