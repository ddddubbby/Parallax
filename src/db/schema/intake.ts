import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  brandRole,
  categoryArchetype,
  factClaimStatus,
  factClaimType,
  projectStatus,
} from "./enums";

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  // Auto-generated from name at creation; not operator-edited in MVP.
  slug: text("slug").notNull().unique(),
  category: text("category"),
  categoryArchetype: categoryArchetype("category_archetype")
    .notNull()
    .default("b2b"),
  jobToBeDone: text("job_to_be_done"),
  status: projectStatus("status").notNull().default("draft"),
  intakeStep: integer("intake_step").notNull().default(1),
  // Wizard working memory (D-026): step-keyed raw form values. Normalized
  // into the intake tables in one transaction when intake completes.
  intakeDraftJson: jsonb("intake_draft_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    role: brandRole("role").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    description: text("description"),
    aliasesJson: jsonb("aliases_json").notNull().default([]),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("brands_project_role_name_uq").on(t.projectId, t.role, t.name),
    // Exactly one client brand per project.
    uniqueIndex("brands_one_client_per_project_uq")
      .on(t.projectId)
      .where(sql`${t.role} = 'client'`),
  ],
);

export const factClaims = pgTable("fact_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  type: factClaimType("type").notNull(),
  statement: text("statement").notNull(),
  sourceNote: text("source_note"),
  sourceUrl: text("source_url"),
  status: factClaimStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const attributes = pgTable(
  "attributes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("attributes_project_name_uq").on(t.projectId, t.name)],
);

export const personas = pgTable("personas", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  companyContext: text("company_context"),
  painPointsJson: jsonb("pain_points_json").notNull().default([]),
  buyingCriteriaJson: jsonb("buying_criteria_json").notNull().default([]),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("markets_project_name_uq").on(t.projectId, t.name)],
);
