import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { BoundedDedupeSet } from "@/core/agent-transport";
import type { ChainGateway, EffectPayload, EffectType, OnChainJob } from "@/core/agent-effects";
import { db, pool } from "@/db/client";
import {
  agentEffects,
  agentOrderEvents,
  agentOrders,
  agentRuntimeControl,
} from "@/db/schema";
import {
  getOrder,
  setAdmissions,
  upsertOrder,
} from "@/db/repositories/agent-commerce";
import { advanceOrder, ingestEvent, type RawAcpEvent } from "./gateway";

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
    await db.delete(agentEffects).where(inArray(agentEffects.orderId, createdOrderIds));
    await db.delete(agentOrderEvents).where(inArray(agentOrderEvents.orderId, createdOrderIds));
    await db.delete(agentOrders).where(inArray(agentOrders.id, createdOrderIds));
  }
  await db.delete(agentRuntimeControl).where(inArray(agentRuntimeControl.controlKey, ["admissions"]));
  await pool.end().catch(() => {});
});

/** Stateful fake chain: broadcasts mutate the job; the test funds it externally. */
class FakeGateway implements ChainGateway {
  applied: Record<string, number> = {};
  constructor(public job: OnChainJob) {}
  async readJob() {
    return { ...this.job, sentMessageHashes: [...this.job.sentMessageHashes] };
  }
  async broadcast(effectType: EffectType, payload: EffectPayload) {
    this.applied[effectType] = (this.applied[effectType] ?? 0) + 1;
    switch (effectType) {
      case "set_budget": this.job.budget = payload.amount ?? null; this.job.status = "budgeted"; break;
      case "submit_offchain": this.job.offchainHash = payload.deliverableHash ?? null; break;
      case "submit_onchain": this.job.submittedHash = payload.deliverableHash ?? null; this.job.status = "completed"; break;
      case "claim_refund": this.job.refunded = true; this.job.status = "refunded"; break;
      default: break;
    }
    return { txHash: `0xtx-${effectType}-${this.applied[effectType]}` };
  }
  async getReceipt() {
    return { status: "success" as const };
  }
}

let jobN = 0;
async function freshOrder() {
  const order = await upsertOrder({
    settlementChainId: 8453,
    onchainJobId: `gw-job-${Date.now()}-${jobN++}`,
    buyerAddress: "0xbuyer",
    providerAddress: "0xprovider",
    evaluatorAddress: "0x0000000000000000000000000000000000000000",
    offeringVersion: "resonance_geo_v1",
    offeringDigest: "0xdigest",
  });
  if (order) createdOrderIds.push(order.id);
  return order!;
}

function freshJob(): OnChainJob {
  return { status: "created", budget: null, offchainHash: null, submittedHash: null, refunded: false, expired: false, sentMessageHashes: [] };
}

describe.skipIf(!dbUp)("ACP gateway orchestrator (M40, offline)", () => {
  it("ingestEvent dedupes on the canonical fingerprint (in-memory + DB)", async () => {
    const order = await freshOrder();
    const deps = { chain: new FakeGateway(freshJob()), dedupe: new BoundedDedupeSet() };
    const event: RawAcpEvent = {
      chainId: 8453, jobId: order.onchainJobId, kind: "job.created", sender: "0xbuyer",
      timestamp: 1000, source: "sse", payload: { a: 1 },
    };
    expect((await ingestEvent(event, deps)).inserted).toBe(true);
    expect((await ingestEvent(event, deps)).inserted).toBe(false); // in-memory drop
    // Same event via a different source: DB fingerprint still dedupes (fresh dedupe set).
    expect((await ingestEvent(event, { ...deps, dedupe: new BoundedDedupeSet() })).inserted).toBe(false);
  });

  it("drives a full lifecycle created → budget → funded → submit → completed, once each", async () => {
    const order = await freshOrder();
    const chain = new FakeGateway(freshJob());
    const deps = { chain, dedupe: new BoundedDedupeSet() };
    const DELIVERABLE = "0xreportdigest";

    await setAdmissions(true, "test", "test");

    // created → set_budget
    let r = await advanceOrder({ orderId: order.id }, deps);
    expect(r).toMatchObject({ action: "effect", effectType: "set_budget" });
    expect(chain.job.status).toBe("budgeted");

    // buyer funds externally
    chain.job.status = "funded";

    // funded, deliverable ready → submit off-chain then on-chain
    r = await advanceOrder({ orderId: order.id, deliverableHash: DELIVERABLE }, deps);
    expect(r).toMatchObject({ action: "effect", effectType: "submit_offchain" });
    r = await advanceOrder({ orderId: order.id, deliverableHash: DELIVERABLE }, deps);
    expect(r).toMatchObject({ action: "effect", effectType: "submit_onchain" });
    expect(chain.job.status).toBe("completed");

    // completed → terminal result recorded
    r = await advanceOrder({ orderId: order.id, deliverableHash: DELIVERABLE }, deps);
    expect(r).toMatchObject({ action: "none", reason: "completed" });

    const finalOrder = await getOrder(order.id);
    expect(finalOrder?.resultState).toBe("completed");
    expect(finalOrder?.acpStatus).toBe("completed");

    // Each external effect fired exactly once.
    expect(chain.applied).toEqual({ set_budget: 1, submit_offchain: 1, submit_onchain: 1 });

    // Re-advancing (a redundant poll) is idempotent — no extra broadcasts.
    await advanceOrder({ orderId: order.id, deliverableHash: DELIVERABLE }, deps);
    expect(chain.applied).toEqual({ set_budget: 1, submit_offchain: 1, submit_onchain: 1 });
  });

  it("does not set a budget while admissions are disabled", async () => {
    const order = await freshOrder();
    const chain = new FakeGateway(freshJob());
    await setAdmissions(false, "test", "test");
    const r = await advanceOrder({ orderId: order.id }, { chain, dedupe: new BoundedDedupeSet() });
    expect(r).toMatchObject({ action: "none", reason: "admissions_disabled" });
    expect(chain.applied.set_budget ?? 0).toBe(0);
  });

  it("claims a refund on an expired (funded, past-deadline) job, exactly once", async () => {
    const order = await freshOrder();
    const chain = new FakeGateway({ ...freshJob(), status: "funded", expired: true });
    const deps = { chain, dedupe: new BoundedDedupeSet() };
    const r = await advanceOrder({ orderId: order.id }, deps);
    expect(r).toMatchObject({ action: "effect", effectType: "claim_refund" });
    expect(chain.job.refunded).toBe(true);
    await advanceOrder({ orderId: order.id }, deps); // redundant
    expect(chain.applied.claim_refund).toBe(1);
  });
});
