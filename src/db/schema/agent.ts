import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { auditRuns } from "./runs";

// M39 — GEO agent commerce persistence (AGENT_BUILD_PLAN §4.3). Additive tables
// only; agent orders LINK to existing runs, never a parallel evidence engine.
// All state machines are kept separate (§9): ACP status (commerce) vs internal
// execution status vs terminal result state.

/** ACP job lifecycle as OBSERVED on-chain / via SDK (commerce truth). */
export const agentAcpStatus = pgEnum("agent_acp_status", [
  "created",
  "budgeted",
  "funded",
  "submitted",
  "completed",
  "rejected",
  "expired",
]);

/** Our internal execution status — distinct from commerce (§9). */
export const agentExecStatus = pgEnum("agent_exec_status", [
  "pending",
  "admitted",
  "processing",
  "submitted",
  "completed",
  "aborted",
]);

/** Terminal commerce outcome of the order. */
export const agentResultState = pgEnum("agent_result_state", [
  "open",
  "completed",
  "rejected",
  "refunded",
  "expired",
]);

/** Every chain action is a durable effect (§4.5). submit is two phases. */
export const agentEffectType = pgEnum("agent_effect_type", [
  "set_budget",
  "reject",
  "submit_offchain",
  "submit_onchain",
  "claim_refund",
  "message",
]);

/** Effect broadcast outcome — never blind-retry an `unknown` (§4.5). */
export const agentEffectState = pgEnum("agent_effect_state", [
  "pending",
  "confirmed",
  "unknown",
  "reverted",
]);

export const agentDeliverableState = pgEnum("agent_deliverable_state", [
  "draft",
  "published",
  "revoked",
]);

export const agentOrders = pgTable(
  "agent_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    settlementChainId: integer("settlement_chain_id").notNull(),
    onchainJobId: text("onchain_job_id").notNull(),
    buyerAddress: text("buyer_address").notNull(),
    providerAddress: text("provider_address").notNull(),
    evaluatorAddress: text("evaluator_address").notNull(),
    offeringVersion: text("offering_version").notNull(),
    offeringDigest: text("offering_digest").notNull(),
    // First valid requirement stored canonically; later conflicting ones reject.
    requirementJson: jsonb("requirement_json"),
    // Immutable asset-identity snapshot (address/chain/name/symbol/decimals).
    assetIdentityJson: jsonb("asset_identity_json"),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    acpStatus: agentAcpStatus("acp_status").notNull().default("created"),
    execStatus: agentExecStatus("exec_status").notNull().default("pending"),
    resultState: agentResultState("result_state").notNull().default("open"),
    // The phase attributed responsibility on a terminal reject/refund/expiry.
    terminalAttribution: text("terminal_attribution"),
    runId: uuid("run_id").references(() => auditRuns.id),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One order per on-chain job on its settlement chain (idempotent ingest).
    uniqueIndex("agent_orders_chain_job_uq").on(t.settlementChainId, t.onchainJobId),
    index("agent_orders_status_idx").on(t.acpStatus, t.execStatus),
  ],
);

export const agentOrderEvents = pgTable(
  "agent_order_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").references(() => agentOrders.id),
    settlementChainId: integer("settlement_chain_id").notNull(),
    onchainJobId: text("onchain_job_id").notNull(),
    // chain + job + kind/type + sender + content hash + timestamp (§4.4).
    fingerprint: text("fingerprint").notNull(),
    kind: text("kind").notNull(),
    sender: text("sender"),
    source: text("source").notNull(), // sse | history | poll
    rawPayloadJson: jsonb("raw_payload_json").notNull().default({}),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Durable dedupe: an identical observation is ignored, whatever its source.
    uniqueIndex("agent_order_events_fingerprint_uq").on(t.fingerprint),
    index("agent_order_events_order_idx").on(t.orderId),
  ],
);

export const agentEffects = pgTable(
  "agent_effects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => agentOrders.id),
    effectType: agentEffectType("effect_type").notNull(),
    // Canonical payload hash — the effectively-once identity of the action.
    payloadHash: text("payload_hash").notNull(),
    // The exact precondition asserted before broadcast (audit + reconcile).
    precondition: text("precondition"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    txHash: text("tx_hash"),
    state: agentEffectState("state").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Effectively-once: one effect row per (order, type, canonical payload). A
    // duplicate insert violates this and is caught, never re-broadcast (§4.5).
    uniqueIndex("agent_effects_once_uq").on(t.orderId, t.effectType, t.payloadHash),
    index("agent_effects_state_idx").on(t.state),
  ],
);

export const agentDeliverables = pgTable(
  "agent_deliverables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => agentOrders.id),
    envelopeJson: jsonb("envelope_json").notNull(),
    // The full immutable report artifact (§5.2: report artifacts in Postgres
    // JSONB — no object store at launch). The envelope stays < 2 KB; the
    // report lives here and is served by the capability-token endpoint.
    reportJson: jsonb("report_json"),
    reportSha256: text("report_sha256").notNull(),
    acpHash: text("acp_hash"),
    capabilityHash: text("capability_hash"),
    state: agentDeliverableState("state").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One deliverable per order; the canonical envelope + digest are immutable.
    uniqueIndex("agent_deliverables_order_uq").on(t.orderId),
  ],
);

export const agentSettlements = pgTable(
  "agent_settlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => agentOrders.id),
    grossMicroUsdc: bigint("gross_micro_usdc", { mode: "bigint" }).notNull().default(sql`0`),
    contractSnapshotJson: jsonb("contract_snapshot_json").notNull().default({}),
    expectedProviderCredit: bigint("expected_provider_credit", { mode: "bigint" }),
    actualProviderCredit: bigint("actual_provider_credit", { mode: "bigint" }),
    feeRecipientsJson: jsonb("fee_recipients_json").notNull().default([]),
    txRef: text("tx_ref"),
    logRef: text("log_ref"),
    cogsUsd: numeric("cogs_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    wastedCogsUsd: numeric("wasted_cogs_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agent_settlements_order_uq").on(t.orderId)],
);

export const serviceHeartbeats = pgTable(
  "service_heartbeats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    service: text("service").notNull(), // gateway | worker | web
    instanceId: text("instance_id").notNull(),
    state: text("state").notNull().default("online"),
    lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("service_heartbeats_service_instance_uq").on(t.service, t.instanceId)],
);

export const agentRuntimeControl = pgTable(
  "agent_runtime_control",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Singleton-ish keyed control rows (e.g. "admissions").
    controlKey: text("control_key").notNull(),
    admissionsEnabled: boolean("admissions_enabled").notNull().default(false),
    reason: text("reason"),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_runtime_control_key_uq").on(t.controlKey),
    check("agent_runtime_control_key_ck", sql`${t.controlKey} <> ''`),
  ],
);
