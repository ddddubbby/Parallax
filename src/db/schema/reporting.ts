import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { claimSeverity, reportSectionState, runEventLevel } from "./enums";
import { auditRuns, jobs } from "./runs";

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => auditRuns.id),
    scopeType: text("scope_type").notNull(),
    scopeKey: text("scope_key").notNull(),
    metricKey: text("metric_key").notNull(),
    n: integer("n").notNull(),
    value: doublePrecision("value").notNull(),
    // Null when the metric has no defined interval method (D-023).
    ciLow: doublePrecision("ci_low"),
    ciHigh: doublePrecision("ci_high"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("metrics_scope_uq").on(
      t.runId,
      t.scopeType,
      t.scopeKey,
      t.metricKey,
    ),
  ],
);

export const findings = pgTable("findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id")
    .notNull()
    .references(() => auditRuns.id),
  findingType: text("finding_type").notNull(),
  severity: claimSeverity("severity").notNull().default("none"),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull(),
  evidenceJson: jsonb("evidence_json").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => auditRuns.id),
    sectionKey: text("section_key").notNull(),
    position: integer("position").notNull().default(0),
    generatedMd: text("generated_md"),
    // edited_md always wins over generated_md (C3 invariants).
    editedMd: text("edited_md"),
    state: reportSectionState("state").notNull().default("generated"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("report_sections_run_section_uq").on(t.runId, t.sectionKey)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => auditRuns.id),
    jobId: uuid("job_id").references(() => jobs.id),
    level: runEventLevel("level").notNull().default("info"),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    // Append-only: no updated_at by design.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("run_events_run_created_idx").on(t.runId, t.createdAt)],
);
