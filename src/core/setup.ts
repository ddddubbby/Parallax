import { z } from "zod";
import {
  basicsSchema,
  clientBrandSchema,
  competitorSchema,
  factClaimTypeSchema,
  nonEmpty,
  optionalText,
  personaSchema,
} from "./intake";

// M27 (D-084): post-intake Setup editing. Pure module — no project-layer
// imports (C-7). Reuses intake's exact Zod primitives/shapes wherever the
// field set matches, rather than redefining equivalent-but-drifting rules.

export const setupBasicsSchema = basicsSchema;
export const setupClientBrandSchema = clientBrandSchema;
export const setupCompetitorSchema = competitorSchema;
export const setupPersonaSchema = personaSchema;

/** A single market row (intake's marketsSchema wraps an array; Setup edits one at a time). */
export const setupMarketSchema = z.object({ name: nonEmpty });

/** A single attribute row (intake's attributesSchema wraps a 6-12-item array with a
 *  uniqueness refine; Setup adds/renames one at a time — DB uniqueness is enforced by
 *  attributes_project_name_uq). */
export const setupAttributeSchema = z.object({ name: nonEmpty });

/** A single fact-sheet row (intake's factSheetSchema wraps an array). */
export const setupFactClaimSchema = z.object({
  type: factClaimTypeSchema,
  statement: nonEmpty,
  source_note: optionalText,
  source_url: optionalText,
});

export type SetupBasics = z.infer<typeof setupBasicsSchema>;
export type SetupClientBrand = z.infer<typeof setupClientBrandSchema>;
export type SetupCompetitor = z.infer<typeof setupCompetitorSchema>;
export type SetupPersona = z.infer<typeof setupPersonaSchema>;
export type SetupMarket = z.infer<typeof setupMarketSchema>;
export type SetupAttribute = z.infer<typeof setupAttributeSchema>;
export type SetupFactClaim = z.infer<typeof setupFactClaimSchema>;
