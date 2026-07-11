import { sql } from "drizzle-orm";
import {
  boolean,
  type AnyPgColumn,
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
import { projects } from "./intake";
import { framingEvidenceSnapshots } from "./framing";

export const resonanceStudies = pgTable(
  "resonance_studies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    state: text("state").notNull().default("draft"),
    panelPersonasJson: jsonb("panel_personas_json").notNull().default([]),
    anchorSetVersion: text("anchor_set_version").notNull().default("purchase_intent.v1"),
    baselineStimulusId: uuid("baseline_stimulus_id"),
    genericUnconditioned: boolean("generic_unconditioned").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resonance_studies_project_idx").on(t.projectId),
    check("resonance_studies_state_ck", sql`${t.state} in ('draft', 'approved', 'archived')`),
  ],
);

export const resonanceStimuli = pgTable(
  "resonance_stimuli",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studyId: uuid("study_id")
      .notNull()
      .references(() => resonanceStudies.id),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    body: text("body").notNull(),
    evidenceResponseIdsJson: jsonb("evidence_response_ids_json").notNull().default([]),
    framingEvidenceSnapshotId: uuid("framing_evidence_snapshot_id").references(
      (): AnyPgColumn => framingEvidenceSnapshots.id,
    ),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("resonance_stimuli_study_position_uq").on(t.studyId, t.position),
    index("resonance_stimuli_study_idx").on(t.studyId),
    check(
      "resonance_stimuli_kind_ck",
      sql`${t.kind} in ('measured_ai', 'corrected', 'repositioned', 'custom')`,
    ),
  ],
);
