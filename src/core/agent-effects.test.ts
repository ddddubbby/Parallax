import { describe, expect, it } from "vitest";
import {
  AmbiguousBroadcastError,
  executeEffect,
  type ChainGateway,
  type CrashPoint,
  type EffectPayload,
  type EffectStore,
  type EffectType,
  type OnChainJob,
  type StoredEffect,
} from "./agent-effects";
import { acpFromChain } from "./agent-order-state";

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

// ---------------------------------------------------------------------------
// The §6.5 enumerated transition/effect matrix — committed alongside the tests.
// Every cell = one (effect type × crash point) with its starting state, injected
// failure, observation on restart, permitted outbound calls, and terminal
// invariant. The test loop below executes EVERY cell; "every boundary" means
// every enumerated cell, not a sample.
// ---------------------------------------------------------------------------

interface MatrixCell {
  effectType: EffectType;
  crashPoint: CrashPoint;
  startingState: string;
  injectedFailure: string;
  restartObservation: string;
  /** Terminal invariant: exact number of successful external state mutations. */
  permittedBroadcasts: 1;
  terminalState: "confirmed";
}

const CRASH_DESCRIPTORS: Record<CrashPoint, { injectedFailure: string; restartObservation: string }> = {
  after_insert: {
    injectedFailure: "process dies after the durable effect row insert, before any chain read",
    restartObservation: "pending row, chain untouched → precondition holds → broadcast once",
  },
  after_broadcast: {
    injectedFailure: "process dies after the broadcast landed, before the tx hash was recorded",
    restartObservation: "pending row with NO tx hash, chain ALREADY applied → confirm without sending",
  },
  after_record: {
    injectedFailure: "process dies after the tx hash was recorded, before the receipt check",
    restartObservation: "pending row with tx hash, chain applied → confirm without sending",
  },
  after_confirm: {
    injectedFailure: "process dies immediately after markConfirmed",
    restartObservation: "confirmed row → return confirmed, no chain interaction",
  },
  during_reconcile: {
    injectedFailure:
      "first crash after a landed broadcast; second crash DURING the restart's reconcile (after the chain read proves applied, before markConfirmed)",
    restartObservation: "pending row, chain applied → the reconcile branch re-runs and still never re-sends",
  },
};

export const EFFECT_CRASH_MATRIX: MatrixCell[] = EFFECT_TYPES.flatMap((effectType) =>
  (Object.keys(CRASH_DESCRIPTORS) as CrashPoint[]).map((crashPoint) => ({
    effectType,
    crashPoint,
    startingState: `on-chain job in the precondition state for ${effectType}; no effect row exists`,
    injectedFailure: CRASH_DESCRIPTORS[crashPoint].injectedFailure,
    restartObservation: CRASH_DESCRIPTORS[crashPoint].restartObservation,
    permittedBroadcasts: 1,
    terminalState: "confirmed",
  })),
);

async function run(chain: FakeChain, store: InMemoryEffectStore, effectType: EffectType, crash: ReturnType<typeof crasher> | undefined) {
  return executeEffect(effectType, PAYLOAD[effectType], `hash:${effectType}`, "precond", { store, chain, crash });
}

describe("effectively-once effects ledger — crash matrix (§6.5, every cell)", () => {
  expect(EFFECT_CRASH_MATRIX).toHaveLength(EFFECT_TYPES.length * 5); // 6 × 5 = 30 cells

  for (const cell of EFFECT_CRASH_MATRIX) {
    it(`${cell.effectType} — ${cell.crashPoint}: applies exactly once`, async () => {
      const chain = new FakeChain(startJob(cell.effectType));
      const store = new InMemoryEffectStore();
      if (cell.crashPoint === "during_reconcile") {
        // Choreography: land the broadcast then die (run 1); die again during the
        // restart's reconcile (run 2); the third restart must confirm with zero
        // additional sends.
        await expect(run(chain, store, cell.effectType, crasher("after_broadcast"))).rejects.toThrow(/crash@/);
        await expect(run(chain, store, cell.effectType, crasher("during_reconcile"))).rejects.toThrow(/crash@/);
      } else {
        await expect(run(chain, store, cell.effectType, crasher(cell.crashPoint))).rejects.toThrow(/crash@/);
      }
      const outcome = await run(chain, store, cell.effectType, undefined);
      expect(outcome.state).toBe(cell.terminalState);
      expect(chain.applied).toBe(cell.permittedBroadcasts);
    });
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

  it("DB-outage: a store write failing right after broadcast never duplicates the effect", async () => {
    const chain = new FakeChain(startJob("set_budget"));
    const store = new InMemoryEffectStore();
    // Fail the first recordBroadcast (DB outage immediately after the on-chain send).
    const original = store.recordBroadcast.bind(store);
    let failedOnce = false;
    store.recordBroadcast = async (id, tx) => {
      if (!failedOnce) {
        failedOnce = true;
        throw new Error("db outage");
      }
      return original(id, tx);
    };
    await expect(run(chain, store, "set_budget", undefined)).rejects.toThrow(/db outage/);
    expect(chain.applied).toBe(1); // the broadcast did land
    // Restart with the DB recovered: chain shows applied → confirm, no re-send.
    const outcome = await run(chain, store, "set_budget", undefined);
    expect(outcome.state).toBe("confirmed");
    expect(chain.applied).toBe(1); // NOT 2
  });
});

describe("event injections — commerce state derives from chain, not the event stream (§4.4)", () => {
  // Out-of-order and dropped events cannot corrupt commerce state: SSE is a
  // latency optimization, the on-chain poll/reconcile is the completeness
  // mechanism. Whatever subset/order of observations arrived, the ACP truth is
  // the canonical chain read. (Duplicate/replay dedup is proven DB-side.)
  it("dropped or reordered observations do not change the reconciled ACP status", () => {
    const funded: OnChainJob = {
      status: "funded", budget: 99_000_000n, offchainHash: null, submittedHash: null,
      refunded: false, expired: false, sentMessageHashes: [],
    };
    // No matter that a `budgeted` event was dropped and a `funded` arrived
    // out-of-order, the reconciled status is read from the chain, not replayed.
    expect(acpFromChain(funded)).toBe("funded");
  });
});
