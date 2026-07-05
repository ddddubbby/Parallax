import { z } from "zod";
import { MAX_CELLS_PER_RUN } from "./constants";

export const STIMULUS_KINDS = ["measured_ai", "corrected", "repositioned", "custom"] as const;
export type StimulusKind = (typeof STIMULUS_KINDS)[number];

export const panelPersonaSchema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9_-]+$/),
  label: z.string().min(1),
  ageBand: z.string().min(1),
  incomeBand: z.string().min(1),
  locationContext: z.string().min(1),
  behavioralProfile: z.string().min(1),
});

export const panelPersonasSchema = z.array(panelPersonaSchema).min(1);
export type PanelPersona = z.infer<typeof panelPersonaSchema>;

export interface ResonanceStimulusInput {
  id: string;
  kind: StimulusKind;
  label: string;
  body: string;
  position: number;
}

export function parsePanelPersonaLines(text: string): PanelPersona[] {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return rows.map((row, idx) => {
    const [label, ageBand, incomeBand, locationContext, behavioralProfile] = row
      .split("|")
      .map((part) => part.trim());
    return panelPersonaSchema.parse({
      key: `p${idx + 1}`,
      label,
      ageBand,
      incomeBand,
      locationContext,
      behavioralProfile,
    });
  });
}

export function formatPanelPersonaLines(personas: PanelPersona[]): string {
  return personas
    .map((p) =>
      [p.label, p.ageBand, p.incomeBand, p.locationContext, p.behavioralProfile].join(" | "),
    )
    .join("\n");
}

export function validateResonanceCellCount(panelCount: number, stimulusCount: number) {
  const cellCount = panelCount * stimulusCount;
  if (cellCount > MAX_CELLS_PER_RUN) {
    throw new Error(`Resonance study compiles to ${cellCount} cells; the run cap is ${MAX_CELLS_PER_RUN} (C-1)`);
  }
  return cellCount;
}

// Single source of truth for detecting a resonance prompt. The mock provider
// imports this exact constant to select resonance fixtures, so editing the
// prompt wording can never silently route resonance runs to audit fixtures
// (the detection is coupled to the string the renderer actually emits).
export const RESONANCE_PROMPT_MARKER =
  "You are simulating one buyer's free-text reaction for a Resonance lower-funnel study.";

export function renderResonancePrompt(input: {
  persona: PanelPersona;
  stimulus: ResonanceStimulusInput;
  genericUnconditioned: boolean;
}): string {
  const conditioning = input.genericUnconditioned
    ? "This is a generic, unconditioned simulation without stored AI-channel evidence."
    : "This simulation is conditioned on stored AI-channel evidence from this project.";
  return [
    RESONANCE_PROMPT_MARKER,
    conditioning,
    `Buyer profile: ${input.persona.label}. Age band: ${input.persona.ageBand}. Income band: ${input.persona.incomeBand}. Location context: ${input.persona.locationContext}. Behavioral profile: ${input.persona.behavioralProfile}.`,
    `Stimulus variant (${input.stimulus.kind}): ${input.stimulus.label}`,
    input.stimulus.body,
    "Write 2-4 sentences in first person about how this affects your interest in taking the next buying step. Do not provide a numeric rating.",
  ].join("\n\n");
}
