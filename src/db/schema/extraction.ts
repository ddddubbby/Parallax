import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  claimSeverity,
  claimType,
  claimVerdict,
  extractionState,
  recommendationStrength,
  reviewState,
  sentiment,
} from "./enums";
import { brands, factClaims } from "./intake";
import { responses } from "./runs";

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id),
    extractionVersion: integer("extraction_version").notNull().default(1),
    state: extractionState("state").notNull().default("pending"),
    schemaVersion: integer("schema_version").notNull().default(1),
    extractionModel: text("extraction_model"),
    extractedJson: jsonb("extracted_json"),
    validationError: text("validation_error"),
    // D-022: live extraction is a second layer of paid LLM calls, counted
    // toward the run's actual cost and the extraction provider's daily
    // budget. Mock/fixture-backed extraction (the only path before M8)
    // leaves these at their zero defaults.
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    // QA semantics are formalized in M5; free text until then.
    qaStatus: text("qa_status"),
    qaNotes: text("qa_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("extractions_response_version_uq").on(
      t.responseId,
      t.extractionVersion,
    ),
  ],
);

export const brandMentions = pgTable(
  "brand_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extractions.id),
    brandId: uuid("brand_id").references(() => brands.id),
    observedName: text("observed_name").notNull(),
    position: integer("position"),
    recommended: boolean("recommended").notNull().default(false),
    recommendationStrength: recommendationStrength("recommendation_strength")
      .notNull()
      .default("neutral"),
    sentiment: sentiment("sentiment").notNull().default("neutral"),
    attributesJson: jsonb("attributes_json").notNull().default([]),
    evidenceQuote: text("evidence_quote"),
    // Derived rows, rebuilt on re-extraction: no updated_at.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("brand_mentions_brand_recommended_idx").on(t.brandId, t.recommended),
    // One resolved mention row per (extraction, brand). collapseDuplicateBrand-
    // Mentions already guarantees this at persist time; the index is the DB
    // backstop so a future extraction bug can't inflate a per-brand
    // mention_rate above 1.0 and break its Wilson interval (D-056 audit).
    // Partial: unresolved mentions (brand_id NULL) are legitimately many.
    uniqueIndex("brand_mentions_extraction_brand_uq")
      .on(t.extractionId, t.brandId)
      .where(sql`${t.brandId} is not null`),
  ],
);

export const claimsFound = pgTable("claims_found", {
  id: uuid("id").defaultRandom().primaryKey(),
  extractionId: uuid("extraction_id")
    .notNull()
    .references(() => extractions.id),
  brandId: uuid("brand_id").references(() => brands.id),
  factClaimId: uuid("fact_claim_id").references(() => factClaims.id),
  claimText: text("claim_text").notNull(),
  claimType: claimType("claim_type").notNull(),
  extractedVerdict: claimVerdict("extracted_verdict")
    .notNull()
    .default("not_checked"),
  extractedSeverity: claimSeverity("extracted_severity")
    .notNull()
    .default("none"),
  // Operator overrides live beside extracted values, never over them (SM-5).
  operatorVerdict: claimVerdict("operator_verdict"),
  operatorSeverity: claimSeverity("operator_severity"),
  reviewState: reviewState("review_state").notNull().default("unreviewed"),
  // Set whenever review_state leaves `unreviewed` (D-024).
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  evidenceQuote: text("evidence_quote"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
