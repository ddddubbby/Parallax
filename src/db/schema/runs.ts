import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  generationMode,
  jobState,
  providerErrorType,
  providerId,
  runMode,
  runState,
} from "./enums";
import { projects } from "./intake";
import { matrixVersions, promptCells } from "./matrix";

export const auditRuns = pgTable(
  "audit_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    matrixVersionId: uuid("matrix_version_id")
      .notNull()
      .references(() => matrixVersions.id),
    runMode: runMode("run_mode").notNull(),
    state: runState("state").notNull().default("draft"),
    repetitions: integer("repetitions").notNull(),
    selectedProvidersJson: jsonb("selected_providers_json").notNull().default([]),
    selectedModesJson: jsonb("selected_modes_json").notNull().default([]),
    plannedCalls: integer("planned_calls").notNull().default(0),
    costCapUsd: numeric("cost_cap_usd", { precision: 12, scale: 6 }).notNull(),
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    failureRate: real("failure_rate").notNull().default(0),
    // Test-only chaos injection (M4): { rate: 0-1, errorType: ProviderErrorType }.
    // Applied by the worker before calling the provider — never part of the
    // frozen LLMProvider/GenerationRequest contract (D-027).
    debugFailureInjectionJson: jsonb("debug_failure_injection_json"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // C-1: k=5 is protected for audit-grade runs.
    check(
      "audit_runs_audit_repetitions_ck",
      sql`${t.runMode} <> 'live_audit' OR ${t.repetitions} = 5`,
    ),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => auditRuns.id),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => promptCells.id),
    providerId: providerId("provider_id").notNull(),
    generationMode: generationMode("generation_mode").notNull(),
    repIndex: integer("rep_index").notNull(),
    state: jobState("state").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastErrorType: providerErrorType("last_error_type"),
    lastErrorMessage: text("last_error_message"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // RN-3 idempotency key.
    uniqueIndex("jobs_identity_uq").on(
      t.runId,
      t.cellId,
      t.providerId,
      t.generationMode,
      t.repIndex,
    ),
    index("jobs_state_next_attempt_idx").on(t.state, t.nextAttemptAt),
  ],
);

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Written only when the job succeeds (D-011), so retries never collide.
    jobId: uuid("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => auditRuns.id),
    cellId: uuid("cell_id")
      .notNull()
      .references(() => promptCells.id),
    providerId: providerId("provider_id").notNull(),
    generationMode: generationMode("generation_mode").notNull(),
    modelVersion: text("model_version").notNull(),
    rawText: text("raw_text").notNull(),
    citationsJson: jsonb("citations_json").notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    latencyMs: integer("latency_ms").notNull().default(0),
    // Immutable (C-3): no updated_at by design.
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
