import { z } from "zod";

// Intake domain: step definitions, Zod schemas (PRD 8.1-8.3), and pure
// rules. Pure module — imports nothing from other project layers (C-7).

export const INTAKE_STEPS = [
  { step: 1, key: "basics", label: "Basics" },
  { step: 2, key: "client_brand", label: "Client Brand" },
  { step: 3, key: "competitors", label: "Competitors" },
  { step: 4, key: "fact_sheet", label: "Fact Sheet" },
  { step: 5, key: "attributes", label: "Attributes" },
  { step: 6, key: "personas", label: "Personas" },
  { step: 7, key: "markets", label: "Markets" },
] as const;

export type IntakeStepKey = (typeof INTAKE_STEPS)[number]["key"];
export const REVIEW_STEP = 8;

const nonEmpty = z.string().trim().min(1, "Required");
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();
const aliasList = z.array(nonEmpty).default([]);

export const basicsSchema = z.object({
  name: nonEmpty.max(200, "Keep under 200 characters"),
  category: nonEmpty,
  job_to_be_done: nonEmpty,
});

export const clientBrandSchema = z.object({
  name: nonEmpty,
  aliases: aliasList,
  domain: nonEmpty,
  description: optionalText,
});

export const competitorSchema = z.object({
  name: nonEmpty,
  aliases: aliasList,
  domain: optionalText,
});

// BC-2: 3-8 competitors.
export const competitorsSchema = z.object({
  competitors: z
    .array(competitorSchema)
    .min(3, "At least 3 competitors")
    .max(8, "At most 8 competitors"),
});

export const factClaimTypeSchema = z.enum([
  "pricing",
  "feature",
  "company_fact",
  "security",
  "availability",
]);

export const factSheetSchema = z.object({
  rows: z
    .array(
      z.object({
        type: factClaimTypeSchema,
        statement: nonEmpty,
        source_note: optionalText,
        source_url: optionalText,
      }),
    )
    .default([]),
});

/** CM-2 normalization: trim, lowercase, collapse internal whitespace. */
export function normalizePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// CM-2: 6-12 normalized phrases, unique after normalization.
export const attributesSchema = z.object({
  attributes: z
    .array(nonEmpty)
    .min(6, "At least 6 attributes")
    .max(12, "At most 12 attributes")
    .refine(
      (list) => new Set(list.map(normalizePhrase)).size === list.length,
      "Attributes must be unique",
    ),
});

// CM-3: 2-5 persona cards.
export const personaSchema = z.object({
  title: nonEmpty,
  company_context: optionalText,
  pain_points: z.array(nonEmpty).default([]),
  buying_criteria: z.array(nonEmpty).default([]),
});

export const personasSchema = z.object({
  personas: z
    .array(personaSchema)
    .min(2, "At least 2 personas")
    .max(5, "At most 5 personas"),
});

// CM-4: ordered list; order controls allocation priority.
export const marketsSchema = z.object({
  markets: z
    .array(nonEmpty)
    .min(1, "At least 1 market")
    .refine(
      (list) => new Set(list.map(normalizePhrase)).size === list.length,
      "Markets must be unique",
    ),
});

export const STEP_SCHEMAS: Record<IntakeStepKey, z.ZodType> = {
  basics: basicsSchema,
  client_brand: clientBrandSchema,
  competitors: competitorsSchema,
  fact_sheet: factSheetSchema,
  attributes: attributesSchema,
  personas: personasSchema,
  markets: marketsSchema,
};

export type Basics = z.infer<typeof basicsSchema>;
export type ClientBrand = z.infer<typeof clientBrandSchema>;
export type Competitor = z.infer<typeof competitorSchema>;
export type FactSheet = z.infer<typeof factSheetSchema>;
export type Personas = z.infer<typeof personasSchema>;

/** Raw wizard working state; steps hold unvalidated form values (D-026). */
export type IntakeDraft = Partial<Record<IntakeStepKey, unknown>>;

export type FieldErrors = Record<string, string[]>;

/** Validate one step's payload, returning field-level errors keyed by path. */
export function validateStep(
  key: IntakeStepKey,
  payload: unknown,
): { ok: true; data: unknown } | { ok: false; fieldErrors: FieldErrors } {
  const result = STEP_SCHEMAS[key].safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".") || "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

export interface BrandAliasInput {
  name: string;
  aliases: string[];
}

export interface AliasOverlap {
  value: string;
  brands: [string, string];
}

/** BC-3: overlapping names/aliases across brands, flagged before matrix generation. */
export function findAliasOverlaps(brands: BrandAliasInput[]): AliasOverlap[] {
  const seen = new Map<string, string>();
  const overlaps: AliasOverlap[] = [];
  for (const brand of brands) {
    const terms = new Set(
      [brand.name, ...brand.aliases].map(normalizePhrase).filter(Boolean),
    );
    for (const term of terms) {
      const owner = seen.get(term);
      if (owner !== undefined && owner !== brand.name) {
        overlaps.push({ value: term, brands: [owner, brand.name] });
      } else {
        seen.set(term, brand.name);
      }
    }
  }
  return overlaps;
}

/** Slug generated from name at project creation; not operator-edited (spec §2). */
export function slugify(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "project"}-${suffix}`;
}
