import type { StimulusKind } from "./resonance";

export type ResonanceStudyTemplateId =
  | "ai_framing_repair"
  | "promo_framing"
  | "price_presentation"
  | "message_claim_variants";

export interface ResonanceStudyTemplateStimulus {
  kind: StimulusKind;
  label: string;
  body: string;
}

export interface ResonanceStudyTemplate {
  id: ResonanceStudyTemplateId;
  name: string;
  summary: string;
  guidance: string;
  default: boolean;
  stimuli: ResonanceStudyTemplateStimulus[];
}

export const RESONANCE_STUDY_TEMPLATES: ResonanceStudyTemplate[] = [
  {
    id: "ai_framing_repair",
    name: "AI-framing repair",
    summary: "Compare the measured AI-channel framing against corrected and sharper alternatives.",
    guidance:
      "Use this when the audit found a weak or inaccurate AI framing. Keep the measured variant tied to stored evidence, then test corrected language before changing market-facing material.",
    default: true,
    stimuli: [
      {
        kind: "measured_ai",
        label: "Measured AI framing",
        body:
          "Paste the AI-channel framing buyers already see, quoting or summarizing the stored audit evidence: {measured_ai_framing}",
      },
      {
        kind: "corrected",
        label: "Corrected proof framing",
        body:
          "Rewrite the same idea with accurate proof, removing unsupported claims while preserving the buyer context: {corrected_proof_framing}",
      },
      {
        kind: "repositioned",
        label: "Sharper position framing",
        body:
          "Reframe the offer around the clearest differentiated position that remains supported by the fact sheet: {repositioned_framing}",
      },
    ],
  },
  {
    id: "promo_framing",
    name: "Promo framing",
    summary: "Test several ways to express the same offer before spending on creative.",
    guidance:
      "Use this for offer copy, not business-outcome claims. Keep the underlying promotion constant and compare how different framings change the simulated response.",
    default: false,
    stimuli: [
      {
        kind: "custom",
        label: "Direct offer framing",
        body: "Present the offer plainly with terms the buyer can evaluate: {offer_detail}",
      },
      {
        kind: "custom",
        label: "Problem-solution framing",
        body:
          "Frame the same offer through the buyer problem it addresses, without changing the commercial terms: {problem_solution_framing}",
      },
      {
        kind: "custom",
        label: "Proof-led offer framing",
        body:
          "Frame the same offer with the strongest truthful proof point available: {proof_led_offer_framing}",
      },
    ],
  },
  {
    id: "price_presentation",
    name: "Price presentation",
    summary: "Compare ways to explain the same price or package structure.",
    guidance:
      "Use this for presentation and comprehension of an unchanged price. It does not estimate demand, revenue, or price optimization.",
    default: false,
    stimuli: [
      {
        kind: "custom",
        label: "Plain price framing",
        body: "State the price or package structure directly, including the core terms: {price_context}",
      },
      {
        kind: "custom",
        label: "Value-context framing",
        body:
          "Explain the same price through included value, service scope, or avoided hassle: {value_context}",
      },
      {
        kind: "custom",
        label: "Risk-reducer framing",
        body:
          "Explain the same price with the clearest buyer-risk reducer, such as trial terms, approved assurance language, or transparent terms: {risk_reducer_context}",
      },
    ],
  },
  {
    id: "message_claim_variants",
    name: "Message / claim variants",
    summary: "Compare alternate truthful claims or message angles before publishing them.",
    guidance:
      "Use this when several claims are factually supportable and the operator needs a directional read on which framing is clearer or more persuasive.",
    default: false,
    stimuli: [
      {
        kind: "custom",
        label: "Claim variant A",
        body: "Present the first supportable message or claim in buyer-facing language: {claim_variant_a}",
      },
      {
        kind: "custom",
        label: "Claim variant B",
        body: "Present the second supportable message or claim in buyer-facing language: {claim_variant_b}",
      },
      {
        kind: "custom",
        label: "Claim variant C",
        body: "Present the third supportable message or claim in buyer-facing language: {claim_variant_c}",
      },
    ],
  },
];

export const RESONANCE_TEMPLATE_FORBIDDEN_PHRASES = [
  "will increase sales",
  "predicted revenue",
  "guaranteed uplift",
  "roi of",
  "purchase probability",
  "willingness to pay",
  "ideal price",
];

export function getResonanceStudyTemplate(id: string): ResonanceStudyTemplate | null {
  return RESONANCE_STUDY_TEMPLATES.find((template) => template.id === id) ?? null;
}

export function findUnresolvedTemplatePlaceholders(text: string): string[] {
  const matches = text.match(/\{[^{}\n]+\}/g) ?? [];
  return [...new Set(matches)].sort((a, b) => a.localeCompare(b));
}

export function unresolvedStimulusPlaceholders(input: { label: string; body: string }) {
  return findUnresolvedTemplatePlaceholders(`${input.label}\n${input.body}`);
}
