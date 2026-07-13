// M39 commerce persistence repositories (AGENT_BUILD_PLAN §4.3). Orders link to
// existing runs; events dedupe on a canonical fingerprint; effects are the
// durable, effectively-once rows the §4.5 ledger drives; advisory locks give
// gateway leadership + per-order serialization.

import { and, eq, sql } from "drizzle-orm";
import type { EffectState, EffectStore, EffectType, StoredEffect } from "@/core/agent-effects";
import { db } from "../client";
import {
  agentDeliverables,
  agentEffects,
  agentOrderEvents,
  agentOrders,
  agentRuntimeControl,
  agentSettlements,
  serviceHeartbeats,
} from "../schema";

// Advisory-lock namespaces (int4). Leadership is a fixed key; per-order locks
// hash the order id. Transaction-scoped (pg_advisory_xact_lock) so they release
// on commit and never leak across pooled connections.
const NS_LEADERSHIP = 4901;
const NS_ORDER = 4902;

export interface CreateOrderInput {
  settlementChainId: number;
  onchainJobId: string;
  buyerAddress: string;
  providerAddress: string;
  evaluatorAddress: string;
  offeringVersion: string;
  offeringDigest: string;
}

/** Idempotent order ingest: first writer wins on (chain, job); a replay returns the existing row. */
export async function upsertOrder(input: CreateOrderInput) {
  const [row] = await db
    .insert(agentOrders)
    .values(input)
    .onConflictDoNothing({ target: [agentOrders.settlementChainId, agentOrders.onchainJobId] })
    .returning({ id: agentOrders.id });
  if (row) return getOrder(row.id);
  return getOrderByJob(input.settlementChainId, input.onchainJobId);
}

export async function getOrder(id: string) {
  const [row] = await db.select().from(agentOrders).where(eq(agentOrders.id, id));
  return row ?? null;
}

export async function getOrderByJob(settlementChainId: number, onchainJobId: string) {
  const [row] = await db
    .select()
    .from(agentOrders)
    .where(and(eq(agentOrders.settlementChainId, settlementChainId), eq(agentOrders.onchainJobId, onchainJobId)));
  return row ?? null;
}

export interface OrderStatePatch {
  acpStatus?: "created" | "budgeted" | "funded" | "submitted" | "completed" | "rejected" | "expired";
  execStatus?: "pending" | "admitted" | "processing" | "submitted" | "completed" | "aborted";
  resultState?: "open" | "completed" | "rejected" | "refunded" | "expired";
  terminalAttribution?: string | null;
  runId?: string | null;
  requirementJson?: unknown;
  assetIdentityJson?: unknown;
  expiredAt?: Date | null;
}

export async function updateOrderState(id: string, patch: OrderStatePatch) {
  await db
    .update(agentOrders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(agentOrders.id, id));
}

export interface OrderEventInput {
  orderId: string | null;
  settlementChainId: number;
  onchainJobId: string;
  fingerprint: string;
  kind: string;
  sender?: string | null;
  source: string;
  rawPayloadJson?: unknown;
}

/**
 * Insert an observation, deduped on the canonical fingerprint. Returns whether
 * it was newly inserted — an identical replay (duplicate SSE, poll overlap,
 * post-restart replay) is a no-op (§4.4). Persist BEFORE any business action.
 */
export async function insertOrderEvent(input: OrderEventInput): Promise<{ inserted: boolean }> {
  const rows = await db
    .insert(agentOrderEvents)
    .values({
      orderId: input.orderId,
      settlementChainId: input.settlementChainId,
      onchainJobId: input.onchainJobId,
      fingerprint: input.fingerprint,
      kind: input.kind,
      sender: input.sender ?? null,
      source: input.source,
      rawPayloadJson: input.rawPayloadJson ?? {},
    })
    .onConflictDoNothing({ target: agentOrderEvents.fingerprint })
    .returning({ id: agentOrderEvents.id });
  return { inserted: rows.length > 0 };
}

export async function listOrderEvents(orderId: string) {
  return db.select().from(agentOrderEvents).where(eq(agentOrderEvents.orderId, orderId));
}

/** DB-backed EffectStore: the durable effectively-once rows the ledger drives (§4.5). */
export function createEffectStore(orderId: string): EffectStore {
  return {
    async upsert(effectType: EffectType, payloadHash: string, precondition: string): Promise<StoredEffect> {
      await db
        .insert(agentEffects)
        .values({ orderId, effectType, payloadHash, precondition })
        .onConflictDoNothing({
          target: [agentEffects.orderId, agentEffects.effectType, agentEffects.payloadHash],
        });
      const [row] = await db
        .select({ id: agentEffects.id, state: agentEffects.state, attempts: agentEffects.attempts, txHash: agentEffects.txHash })
        .from(agentEffects)
        .where(
          and(
            eq(agentEffects.orderId, orderId),
            eq(agentEffects.effectType, effectType),
            eq(agentEffects.payloadHash, payloadHash),
          ),
        );
      return { id: row.id, state: row.state as EffectState, attempts: row.attempts, txHash: row.txHash };
    },
    async incrementAttempts(id: string) {
      await db
        .update(agentEffects)
        .set({ attempts: sql`${agentEffects.attempts} + 1`, updatedAt: new Date() })
        .where(eq(agentEffects.id, id));
    },
    async recordBroadcast(id: string, txHash: string) {
      await db.update(agentEffects).set({ txHash, updatedAt: new Date() }).where(eq(agentEffects.id, id));
    },
    async markConfirmed(id: string, txHash: string | null) {
      await db
        .update(agentEffects)
        .set({ state: "confirmed", txHash: txHash ?? undefined, updatedAt: new Date() })
        .where(eq(agentEffects.id, id));
    },
    async markUnknown(id: string) {
      await db.update(agentEffects).set({ state: "unknown", updatedAt: new Date() }).where(eq(agentEffects.id, id));
    },
    async markReverted(id: string) {
      await db.update(agentEffects).set({ state: "reverted", updatedAt: new Date() }).where(eq(agentEffects.id, id));
    },
  };
}

/**
 * Run `fn` while holding the per-order advisory lock, if it can be acquired
 * WITHOUT blocking. Returns null if another instance holds it (duplicate-instance
 * protection §4.4). Transaction-scoped so the lock always releases.
 */
export async function withTryOrderLock<T>(orderId: string, fn: () => Promise<T>): Promise<T | null> {
  return db.transaction(async (tx) => {
    const got = await tx.execute(
      sql`select pg_try_advisory_xact_lock(${NS_ORDER}, hashtext(${orderId})) as locked`,
    );
    const locked = (got.rows[0] as { locked: boolean }).locked;
    if (!locked) return null;
    return fn();
  });
}

/** Try to acquire gateway leadership without blocking (only the leader acts). */
export async function withTryLeadership<T>(fn: () => Promise<T>): Promise<T | null> {
  return db.transaction(async (tx) => {
    const got = await tx.execute(sql`select pg_try_advisory_xact_lock(${NS_LEADERSHIP}, 0) as locked`);
    const locked = (got.rows[0] as { locked: boolean }).locked;
    if (!locked) return null;
    return fn();
  });
}

export async function recordHeartbeat(service: string, instanceId: string, state = "online") {
  await db
    .insert(serviceHeartbeats)
    .values({ service, instanceId, state, lastBeatAt: new Date() })
    .onConflictDoUpdate({
      target: [serviceHeartbeats.service, serviceHeartbeats.instanceId],
      set: { state, lastBeatAt: new Date() },
    });
}

export async function getAdmissions(controlKey = "admissions"): Promise<boolean> {
  const [row] = await db
    .select({ enabled: agentRuntimeControl.admissionsEnabled })
    .from(agentRuntimeControl)
    .where(eq(agentRuntimeControl.controlKey, controlKey));
  return row?.enabled ?? false;
}

export async function setAdmissions(enabled: boolean, reason: string, updatedBy: string, controlKey = "admissions") {
  await db
    .insert(agentRuntimeControl)
    .values({ controlKey, admissionsEnabled: enabled, reason, updatedBy })
    .onConflictDoUpdate({
      target: agentRuntimeControl.controlKey,
      set: { admissionsEnabled: enabled, reason, updatedBy, updatedAt: new Date() },
    });
}

export async function upsertDeliverable(input: {
  orderId: string;
  envelopeJson: unknown;
  reportSha256: string;
  acpHash?: string | null;
  capabilityHash?: string | null;
}) {
  const [row] = await db
    .insert(agentDeliverables)
    .values({
      orderId: input.orderId,
      envelopeJson: input.envelopeJson,
      reportSha256: input.reportSha256,
      acpHash: input.acpHash ?? null,
      capabilityHash: input.capabilityHash ?? null,
    })
    .onConflictDoNothing({ target: agentDeliverables.orderId })
    .returning({ id: agentDeliverables.id });
  return row ?? null;
}

export async function getDeliverable(orderId: string) {
  const [row] = await db.select().from(agentDeliverables).where(eq(agentDeliverables.orderId, orderId));
  return row ?? null;
}

/**
 * Publish the deliverable: store the immutable report artifact + canonical
 * envelope + capability hash and mark it published. Idempotent per order (the
 * unique constraint); the raw token is returned exactly once by the caller
 * that generated it and never persisted.
 */
export async function publishDeliverable(input: {
  orderId: string;
  envelopeJson: unknown;
  reportJson: unknown;
  reportSha256: string;
  capabilityHash: string;
  acpHash?: string | null;
}) {
  const [row] = await db
    .insert(agentDeliverables)
    .values({
      orderId: input.orderId,
      envelopeJson: input.envelopeJson,
      reportJson: input.reportJson,
      reportSha256: input.reportSha256,
      capabilityHash: input.capabilityHash,
      acpHash: input.acpHash ?? null,
      state: "published",
      publishedAt: new Date(),
    })
    .onConflictDoNothing({ target: agentDeliverables.orderId })
    .returning({ id: agentDeliverables.id });
  return row ?? null;
}

/**
 * Retrieval for the public report endpoint: the caller hashes the presented
 * token (verifyCapabilityToken) — only the hash ever reaches SQL. Published,
 * non-revoked deliverables only.
 */
export async function getPublishedDeliverableByCapabilityHash(capabilityHash: string) {
  const [row] = await db
    .select({
      id: agentDeliverables.id,
      reportJson: agentDeliverables.reportJson,
      reportSha256: agentDeliverables.reportSha256,
      capabilityHash: agentDeliverables.capabilityHash,
      state: agentDeliverables.state,
    })
    .from(agentDeliverables)
    .where(and(eq(agentDeliverables.capabilityHash, capabilityHash), eq(agentDeliverables.state, "published")));
  return row ?? null;
}

export async function upsertSettlement(input: {
  orderId: string;
  grossMicroUsdc: bigint;
  expectedProviderCredit?: bigint | null;
  actualProviderCredit?: bigint | null;
  contractSnapshotJson?: unknown;
}) {
  await db
    .insert(agentSettlements)
    .values({
      orderId: input.orderId,
      grossMicroUsdc: input.grossMicroUsdc,
      expectedProviderCredit: input.expectedProviderCredit ?? null,
      actualProviderCredit: input.actualProviderCredit ?? null,
      contractSnapshotJson: input.contractSnapshotJson ?? {},
    })
    .onConflictDoNothing({ target: agentSettlements.orderId });
}
