import { describe, expect, it } from "vitest";
import {
  AmbiguousBroadcastError,
  executeEffect,
  type ChainGateway,
  type CrashPoint,
  type EffectPayload,
  type EffectState,
  type EffectStore,
  type EffectType,
  type OnChainJob,
  type StoredEffect,
} from "./agent-effects";

// --- In-memory fakes (the §6.5 matrix runs on simulated state, no network) ---

class InMemoryEffectStore implements EffectStore {
  private rows = new Map<string, StoredEffect>();
  async upsert(effectType: EffectType, payloadHash: string): Promise<StoredEffect> {
    const id = `${effectType}|${payloadHash}`;
    let row = this.rows.get(id);
    if (!row) {
      row = { id, state: "pending", attempts: 0, txHash: null };
      this.rows.set(id, row);
    }
    return { ...row };
  }
  private mut(id: string, patch: Partial<StoredEffect>) {
    const row = this.rows.get(id);
    if (row) Object.assign(row, patch);
  }
  async incrementAttempts(id: string) {
    const row = this.rows.get(id);
    if (row) row.attempts += 1;
  }
  async recordBroadcast(id: string, txHash: string) {
    this.mut(id, { txHash });
  }
  async markConfirmed(id: string, txHash: string | null) {
    this.mut(id, { state: "confirmed", txHash });
  }
  async markUnknown(id: string) {
    this.mut(id, { state: "unknown" });
  }
  async markReverted(id: string) {
    this.mut(id, { state: "reverted" });
  }
}

type ChainMode = "normal" | "ambiguous_landed" | "ambiguous_notlanded" | "reverted";

class FakeChain implements ChainGateway {
  applied = 0; // count of SUCCESSFUL external state mutations for the tracked effect
  constructor(
    public job: OnChainJob,
    public mode: ChainMode = "normal",
  ) {}
  async readJob(): Promise<OnChainJob> {
    return { ...this.job, sentMessageHashes: [...this.job.sentMessageHashes] };
  }
  async broadcast(effectType: EffectType, payload: EffectPayload) {
    if (this.mode === "ambiguous_notlanded") throw new AmbiguousBroadcastError();
    this.applyToJob(effectType, payload);
    this.applied += 1;
    if (this.mode === "ambiguous_landed") throw new AmbiguousBroadcastError();
    return { txHash: `0xtx${this.applied}` };
  }
  async getReceipt(): Promise<{ status: "success" | "reverted" }> {
    return { status: this.mode === "reverted" ? "reverted" : "success" };
  }
  private applyToJob(effectType: EffectType, payload: EffectPayload) {
    const j = this.job;
    switch (effectType) {
      case "set_budget": j.budget = payload.amount ?? null; j.status = "budgeted"; break;
      case "reject": j.status = "rejected"; break;
      case "submit_offchain": j.offchainHash = payload.deliverableHash ?? null; break;
      case "submit_onchain": j.submittedHash = payload.deliverableHash ?? null; j.status = "completed"; break;
      case "claim_refund": j.refunded = true; j.status = "refunded"; break;
      case "message": if (payload.messageHash) j.sentMessageHashes.push(payload.messageHash); break;
    }
  }
}

function crasher(target: CrashPoint | null) {
  let fired = false;
  return (point: CrashPoint) => {
    if (point === target && !fired) {
      fired = true;
      throw new Error(`crash@${point}`);
    }
  };
}

const DHASH = "0xdeadbeefdeliverable";
const PAYLOAD: Record<EffectType, EffectPayload> = {
  set_budget: { amount: 99_000_000n },
  reject: { reason: "funding_timeout" },
  submit_offchain: { deliverableHash: DHASH },
  submit_onchain: { deliverableHash: DHASH },
  claim_refund: {},
  message: { messageHash: "0xmsg" },
};

function startJob(effectType: EffectType): OnChainJob {
  const base: OnChainJob = {
    status: "created", budget: null, offchainHash: null, submittedHash: null,
    refunded: false, expired: false, sentMessageHashes: [],
  };
  switch (effectType) {
    case "reject": return { ...base, status: "budgeted" };
    case "submit_offchain": return { ...base, status: "funded" };
    case "submit_onchain": return { ...base, status: "funded", offchainHash: DHASH };
    case "claim_refund": return { ...base, status: "submitted", expired: true };
    case "message": return { ...base, status: "funded" };
    default: return base;
  }
}

const EFFECT_TYPES: EffectType[] = [
  "set_budget", "reject", "submit_offchain", "submit_onchain", "claim_refund", "message",
];
const CRASH_POINTS: CrashPoint[] = ["after_insert", "after_broadcast", "after_record", "after_confirm"];

async function run(chain: FakeChain, store: InMemoryEffectStore, effectType: EffectType, crash: ReturnType<typeof crasher> | undefined) {
  return executeEffect(effectType, PAYLOAD[effectType], `hash:${effectType}`, "precond", { store, chain, crash });
}

describe("effectively-once effects ledger — crash matrix (§6.5)", () => {
  // Every effect type × every crash point: crash mid-flight, restart, assert the
  // external effect was applied EXACTLY ONCE and the effect ends confirmed.
  for (const effectType of EFFECT_TYPES) {
    for (const point of CRASH_POINTS) {
      it(`${effectType} — crash @ ${point} then restart applies exactly once`, async () => {
        const chain = new FakeChain(startJob(effectType));
        const store = new InMemoryEffectStore();
        // Run 1: crash injected.
        await expect(run(chain, store, effectType, crasher(point))).rejects.toThrow(/crash@/);
        // Run 2: restart, no crash.
        const outcome = await run(chain, store, effectType, undefined);
        expect(outcome.state).toBe("confirmed");
        expect(chain.applied).toBe(1);
      });
    }
  }

  it("double execute with no crash is idempotent (one broadcast)", async () => {
    const chain = new FakeChain(startJob("set_budget"));
    const store = new InMemoryEffectStore();
    await run(chain, store, "set_budget", undefined);
    const second = await run(chain, store, "set_budget", undefined);
    expect(second.state).toBe("confirmed");
    expect(chain.applied).toBe(1);
  });

  it("ambiguous-landed broadcast: restart confirms via chain state, never re-broadcasts", async () => {
    const chain = new FakeChain(startJob("set_budget"), "ambiguous_landed");
    const store = new InMemoryEffectStore();
    const first = await run(chain, store, "set_budget", undefined);
    expect(first.state).toBe("unknown");
    expect(chain.applied).toBe(1);
    chain.mode = "normal"; // relay recovers
    const second = await run(chain, store, "set_budget", undefined);
    expect(second.state).toBe("confirmed");
    expect(chain.applied).toBe(1); // NOT 2
  });

  it("ambiguous-not-landed broadcast: restart re-broadcasts exactly once", async () => {
    const chain = new FakeChain(startJob("set_budget"), "ambiguous_notlanded");
    const store = new InMemoryEffectStore();
    const first = await run(chain, store, "set_budget", undefined);
    expect(first.state).toBe("unknown");
    expect(chain.applied).toBe(0);
    chain.mode = "normal";
    const second = await run(chain, store, "set_budget", undefined);
    expect(second.state).toBe("confirmed");
    expect(chain.applied).toBe(1);
  });

  it("reverted broadcast marks reverted and does not confirm", async () => {
    const chain = new FakeChain(startJob("set_budget"), "reverted");
    const store = new InMemoryEffectStore();
    const outcome = await run(chain, store, "set_budget", undefined);
    expect(outcome.state).toBe("reverted");
  });

  it("P0 freeze: a different existing budget is never overwritten", async () => {
    const chain = new FakeChain({ ...startJob("set_budget"), budget: 42n, status: "budgeted" });
    const store = new InMemoryEffectStore();
    const outcome = await run(chain, store, "set_budget", undefined);
    expect(outcome.state).toBe("p0_freeze");
    expect(chain.applied).toBe(0);
  });

  it("blocked precondition performs no broadcast", async () => {
    // claim_refund on a not-yet-expired job.
    const chain = new FakeChain({ ...startJob("claim_refund"), expired: false });
    const store = new InMemoryEffectStore();
    const outcome = await run(chain, store, "claim_refund", undefined);
    expect(outcome.state).toBe("blocked");
    expect(chain.applied).toBe(0);
  });
});
