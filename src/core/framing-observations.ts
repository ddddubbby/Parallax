import { z } from "zod";

// M44 / D-114 (themes v2): the blind framing extractor's contract. Blindness
// is an architectural property: the prompt builder accepts ONLY the raw
// response text and the observed brand name — never the fact sheet, desired
// attributes, competitors, or operator labels — so discovery cannot be
// contaminated by hope (D-054's philosophy, D-094's extractor design).
// Observations are derived data organizing verbatim evidence; every quote
// must be an exact substring of the raw text (offset-verifiable), and an
// output that fails that check fails the whole row closed.

export const MAX_OBSERVATIONS_PER_RESPONSE = 5;
export const MAX_PHRASE_LENGTH = 80;

export const framingObservationSchema = z
  .object({
    /** Short framing phrase, e.g. "positioned as the budget option". */
    phrase: z.string().min(1).max(MAX_PHRASE_LENGTH),
    /** Verbatim substring of the raw response evidencing the phrase. */
    quote: z.string().min(1),
  })
  .strict();

export const framingExtractorOutputSchema = z
  .object({
    observations: z.array(framingObservationSchema).max(MAX_OBSERVATIONS_PER_RESPONSE),
  })
  .strict();

export type FramingObservation = z.infer<typeof framingObservationSchema>;

/** The blind prompt: raw text + brand name in, nothing else. */
export function buildBlindFramingPrompt(brandName: string, rawText: string): string {
  return [
    `You are given one AI assistant response and one brand name: "${brandName}".`,
    `List how the response FRAMES that brand — the positioning, category, or`,
    `character it assigns (e.g. "framed as the budget option", "credited with`,
    `reliability", "described as declining"). Rules:`,
    `- At most ${MAX_OBSERVATIONS_PER_RESPONSE} observations; fewer is fine; none is a valid answer.`,
    `- Each observation needs "phrase" (short, <= ${MAX_PHRASE_LENGTH} chars) and "quote" — an EXACT`,
    `  verbatim substring copied from the response that evidences the phrase.`,
    `- Only describe framings actually present. Never invent, never evaluate`,
    `  whether a framing is good or accurate.`,
    `Respond with strict JSON: {"observations": [{"phrase": "...", "quote": "..."}]}`,
    ``,
    `RESPONSE:`,
    rawText,
  ].join("\n");
}

/**
 * Fail-closed validation of extractor output: parse, then verify every quote
 * is a verbatim substring of the raw text. Returns the observations or throws.
 */
export function validateFramingObservations(rawText: string, output: unknown): FramingObservation[] {
  const parsed = framingExtractorOutputSchema.parse(output);
  for (const observation of parsed.observations) {
    if (!rawText.includes(observation.quote)) {
      throw new Error(
        `Framing observation quote is not a verbatim substring of the response: "${observation.quote.slice(0, 60)}"`,
      );
    }
  }
  return parsed.observations;
}

/**
 * Mock-mode extractor: deterministic, $0, fixture-free. Every sentence that
 * names the brand becomes one observation (phrase = trimmed sentence, capped;
 * quote = the exact sentence). Deterministic by construction so golden tests
 * and demo themes are stable, and identical sentences across sampled
 * responses embed to identical mock vectors and therefore cluster.
 */
export function deriveMockFramingObservations(brandName: string, rawText: string): FramingObservation[] {
  const needle = brandName.trim().toLowerCase();
  if (needle === "") return [];
  const sentences = rawText.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const observations: FramingObservation[] = [];
  for (const sentence of sentences) {
    if (!sentence.toLowerCase().includes(needle)) continue;
    const quote = sentence.trim();
    if (quote === "") continue;
    const phrase = quote.length > MAX_PHRASE_LENGTH ? quote.slice(0, MAX_PHRASE_LENGTH - 1).trimEnd() + "…" : quote;
    observations.push({ phrase, quote });
    if (observations.length === MAX_OBSERVATIONS_PER_RESPONSE) break;
  }
  return observations;
}
