import { describe, expect, it } from "vitest";
import {
  panelPersonasSchema,
  parsePanelPersonaLines,
  resonanceExportLabel,
  resonanceExportMetadata,
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

  it("rejects duplicate panel persona keys before compile-time metric scopes can collapse", () => {
    const persona = {
      key: "p1",
      label: "Primary buyer",
      ageBand: "35-44",
      incomeBand: "$100k-$150k",
      locationContext: "United States",
      behavioralProfile: "researches carefully",
    };
    expect(() => panelPersonasSchema.parse([persona, { ...persona, label: "Duplicate key" }])).toThrow(/unique/i);
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

  // M22 (D-078): GENERIC can no longer be CREATED (the wizard toggle and its
  // RPC-reachable FormData field are gone; the approval guard is now
  // unconditional — src/db/repositories/resonance.ts's
  // approveAndCompileResonanceStudy no longer consults genericUnconditioned
  // at all). This test is the historical-rendering regression: an EXISTING
  // row with generic_unconditioned=true (the dev DB's real approved
  // "weekday lunch $1 off" study predates M22) must keep rendering a
  // truthful GENERIC label on reports/exports/the results page.
  it("uses stable export labels for C-13 generic disclosure (label helper, historical rows only)", () => {
    expect(resonanceExportLabel(true)).toBe("SIMULATED GENERIC");
    expect(resonanceExportLabel(false)).toBe("SIMULATED EVIDENCE-CONDITIONED");
    expect(
      resonanceExportMetadata({
        id: "study-1",
        name: "Generic simulation",
        genericUnconditioned: true,
      }),
    ).toEqual({
      studyId: "study-1",
      studyName: "Generic simulation",
      genericUnconditioned: true,
      label: "SIMULATED GENERIC",
    });
  });
});
