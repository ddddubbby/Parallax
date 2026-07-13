import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  executeEffect,
  type ChainGateway,
  type EffectPayload,
  type EffectType,
  type OnChainJob,
} from "@/core/agent-effects";
import { db, pool } from "../client";
import { agentDeliverables, agentEffects, agentOrderEvents, agentOrders } from "../schema";
import {
  createEffectStore,
  insertOrderEvent,
  upsertOrder,
  withTryOrderLock,
} from "./agent-commerce";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const createdOrderIds: string[] = [];

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await db.delete(agentDeliverables).where(inArray(agentDeliverables.orderId, createdOrderIds));
    await db.delete(agentEffects).where(inArray(agentEffects.orderId, createdOrderIds));
    await db.delete(agentOrderEvents).where(inArray(agentOrderEvents.orderId, createdOrderIds));
    await db.delete(agentOrders).where(inArray(agentOrders.id, createdOrderIds));
  }
  await pool.end().catch(() => {});
});

let jobCounter = 0;
async function freshOrder() {
  const onchainJobId = `job-${Date.now()}-${jobCounter++}`;
  const order = await upsertOrder({
    settlementChainId: 8453,
    onchainJobId,
    buyerAddress: "0xbuyer",
    providerAddress: "0xprovider",
    evaluatorAddress: "0x0000000000000000000000000000000000000000",
    offeringVersion: "resonance_geo_v1",
    offeringDigest: "0xdigest",
  });
  if (order) createdOrderIds.push(order.id);
  return order!;
}

class InlineChain implements ChainGateway {
  applied = 0;
  constructor(public job: OnChainJob) {}
  async readJob() {
    return { ...this.job, sentMessageHashes: [...this.job.sentMessageHashes] };
  }
  async broadcast(_effectType: EffectType, payload: EffectPayload) {
    this.job.budget = payload.amount ?? null;
    this.job.status = "budgeted";
    this.applied += 1;
    return { txHash: `0xtx${this.applied}` };
  }
  async getReceipt() {
    return { status: "success" as const };
  }
}

describe.skipIf(!dbUp)("agent-commerce repository (M39)", () => {
  it("upsertOrder is idempotent on (settlement_chain_id, onchain_job_id)", async () => {
    const a = await freshOrder();
    const b = await upsertOrder({
      settlementChainId: 8453,
      onchainJobId: a.onchainJobId,
      buyerAddress: "0xbuyer",
      providerAddress: "0xprovider",
      evaluatorAddress: "0x0000000000000000000000000000000000000000",
      offeringVersion: "resonance_geo_v1",
      offeringDigest: "0xdigest",
    });
    expect(b?.id).toBe(a.id);
  });

  it("insertOrderEvent dedupes on fingerprint (duplicate / replay-after-restart)", async () => {
    const order = await freshOrder();
    const ev = {
      orderId: order.id,
      settlementChainId: 8453,
      onchainJobId: order.onchainJobId,
      fingerprint: `fp-${order.id}-created`,
      kind: "job.created",
      source: "sse",
    };
    expect((await insertOrderEvent(ev)).inserted).toBe(true);
    expect((await insertOrderEvent(ev)).inserted).toBe(false); // duplicate
    expect((await insertOrderEvent({ ...ev, source: "poll" })).inserted).toBe(false); // same fp, other source
  });

  it("the effect unique constraint yields ONE row under concurrent upsert", async () => {
    const order = await freshOrder();
    const store = createEffectStore(order.id);
    const results = await Promise.all([
      store.upsert("set_budget", "hash-x", "precond"),
      store.upsert("set_budget", "hash-x", "precond"),
      store.upsert("set_budget", "hash-x", "precond"),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const rows = await db.select({ id: agentEffects.id }).from(agentEffects).where(inArray(agentEffects.orderId, [order.id]));
    expect(rows).toHaveLength(1);
  });

  it("withTryOrderLock serializes duplicate instances (only the leader acts)", async () => {
    const order = await freshOrder();
    let signalAcquired!: () => void;
    const acquired = new Promise<void>((r) => (signalAcquired = r));
    let release!: () => void;
    const barrier = new Promise<void>((r) => (release = r));

    const aDone = withTryOrderLock(order.id, async () => {
      signalAcquired();
      await barrier;
      return "A";
    });
    await acquired;
    const b = await withTryOrderLock(order.id, async () => "B"); // A holds the lock → null
    release();
    const a = await aDone;
    expect(b).toBeNull();
    expect(a).toBe("A");
  });

  it("publishDeliverable + capability-hash retrieval round-trips the report", async () => {
    const { generateCapabilityToken, verifyCapabilityToken } = await import("@/core/agent-envelope");
    const { sha256Hex } = await import("@/core/canonical-json");
    const { publishDeliverable, getPublishedDeliverableByCapabilityHash } = await import("./agent-commerce");
    const order = await freshOrder();
    const { token, capabilityHash } = generateCapabilityToken();
    const report = { schema: "resonance-geo-report-1.0", report_id: "rep_x" };
    const published = await publishDeliverable({
      orderId: order.id,
      envelopeJson: { type: "object", value: {} },
      reportJson: report,
      reportSha256: "c".repeat(64),
      capabilityHash,
    });
    expect(published).not.toBeNull();
    // Retrieval hashes the presented token — the raw token never reaches SQL.
    const row = await getPublishedDeliverableByCapabilityHash(sha256Hex(token));
    expect(row?.reportJson).toEqual(report);
    expect(verifyCapabilityToken(token, row!.capabilityHash!)).toBe(true);
    // A wrong token's hash finds nothing.
    expect(await getPublishedDeliverableByCapabilityHash(sha256Hex("f".repeat(64)))).toBeNull();
    // Idempotent per order: a second publish is a no-op.
    const again = await publishDeliverable({
      orderId: order.id,
      envelopeJson: {},
      reportJson: { different: true },
      reportSha256: "d".repeat(64),
      capabilityHash: generateCapabilityToken().capabilityHash,
    });
    expect(again).toBeNull();
  });

  it("DB-backed effects ledger applies exactly once and persists a confirmed row", async () => {
    const order = await freshOrder();
    const store = createEffectStore(order.id);
    const chain = new InlineChain({
      status: "created", budget: null, offchainHash: null, submittedHash: null,
      refunded: false, expired: false, sentMessageHashes: [],
    });
    const first = await executeEffect("set_budget", { amount: 99_000_000n }, "hash-budget", "created", { store, chain });
    expect(first.state).toBe("confirmed");
    // Re-run: DB row is confirmed → returns confirmed without a second broadcast.
    const second = await executeEffect("set_budget", { amount: 99_000_000n }, "hash-budget", "created", { store, chain });
    expect(second.state).toBe("confirmed");
    expect(chain.applied).toBe(1);
    const [row] = await db.select({ state: agentEffects.state }).from(agentEffects).where(inArray(agentEffects.orderId, [order.id]));
    expect(row.state).toBe("confirmed");
  });
});
