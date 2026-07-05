import { describe, expect, it } from "vitest";
import {
  parsePanelPersonaLines,
  renderResonancePrompt,
  validateResonanceCellCount,
} from "./resonance";

describe("Resonance core (M17)", () => {
  it("parses persona lines without gender or ethnicity axes", () => {
    const [persona] = parsePanelPersonaLines(
      "Primary buyer | 35-44 | $100k-$150k | Singapore | researches carefully",
    );
    expect(persona).toMatchObject({
      key: "p1",
      ageBand: "35-44",
      incomeBand: "$100k-$150k",
      locationContext: "Singapore",
      behavioralProfile: "researches carefully",
    });
    expect(persona).not.toHaveProperty("gender");
    expect(persona).not.toHaveProperty("ethnicity");
  });

  it("renders free-text prompts without numeric ratings", () => {
    const prompt = renderResonancePrompt({
      genericUnconditioned: false,
      persona: {
        key: "p1",
        label: "Primary buyer",
        ageBand: "35-44",
        incomeBand: "$100k-$150k",
        locationContext: "United States",
        behavioralProfile: "researches carefully",
      },
      stimulus: {
        id: "s1",
        kind: "measured_ai",
        label: "Measured AI framing",
        body: "LedgerFox is framed as easy to implement.",
        position: 1,
      },
    });
    expect(prompt).toContain("conditioned on stored AI-channel evidence");
    expect(prompt).toContain("Do not provide a numeric rating");
  });

  it("enforces the 50-cell cap at compile planning", () => {
    expect(validateResonanceCellCount(5, 10)).toBe(50);
    expect(() => validateResonanceCellCount(6, 10)).toThrow(/run cap/);
  });
});
