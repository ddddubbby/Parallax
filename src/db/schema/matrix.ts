import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { intent, matrixState } from "./enums";
import { markets, personas, projects } from "./intake";

export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    intent: intent("intent").notNull(),
    templateText: text("template_text").notNull(),
    variantKey: text("variant_key").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Unique while active: partial unique index per ENGINEERING_SPEC section 2.
    uniqueIndex("prompt_templates_intent_variant_active_uq")
      .on(t.intent, t.variantKey)
      .where(sql`${t.active} = true`),
  ],
);

export const matrixVersions = pgTable(
  "matrix_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    version: integer("version").notNull(),
    state: matrixState("state").notNull().default("draft"),
    cellCount: integer("cell_count").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("matrix_versions_project_version_uq").on(
      t.projectId,
      t.version,
    ),
    // C-1 structural cap, enforced at the database layer as well.
    check("matrix_versions_cell_cap_ck", sql`${t.cellCount} <= 50`),
  ],
);

export const promptCells = pgTable(
  "prompt_cells",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matrixVersionId: uuid("matrix_version_id")
      .notNull()
      .references(() => matrixVersions.id),
    intent: intent("intent").notNull(),
    personaId: uuid("persona_id").references(() => personas.id),
    marketId: uuid("market_id").references(() => markets.id),
    variantKey: text("variant_key").notNull(),
    resolvedText: text("resolved_text").notNull(),
    competitorOrderJson: jsonb("competitor_order_json").notNull().default([]),
    // No updated_at: cells are immutable once their parent version is approved.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("prompt_cells_version_intent_idx").on(t.matrixVersionId, t.intent)],
);
