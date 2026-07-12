// Effectively-once effects ledger (AGENT_BUILD_PLAN §4.5). Every on-chain action
// the GEO agent takes is a durable effect executed AT MOST ONCE successfully,
// even across process crashes, ambiguous broadcasts, and duplicate instances.
//
// This module is the pure driver: it is parameterized by an `EffectStore` (the
// durable effect rows — DB-backed in production, in-memory in the matrix tests)
// and a `ChainGateway` (the on-chain reads/broadcasts — a fake in tests, viem in
// M40). The nine-step protocol is implemented here; the DB unique constraint on
// (order, type, payload_hash) and Postgres advisory locks are the durable and
// concurrency backstops around it.

export type EffectType =
  | "set_budget"
  | "reject"
  | "submit_offchain"
  | "submit_onchain"
  | "claim_refund"
  | "message";

export type EffectState = "pending" | "confirmed" | "unknown" | "reverted";

/** Minimal on-chain job view the ledger reads before every action (§4.4: never trust SDK-derived state). */
export interface OnChainJob {
  status: "created" | "budgeted" | "funded" | "submitted" | "completed" | "rejected" | "refunded";
  budget: bigint | null;
  offchainHash: string | null;
  submittedHash: string | null;
  refunded: boolean;
  expired: boolean;
  sentMessageHashes: string[];
}

export interface EffectPayload {
  amount?: bigint;
  deliverableHash?: string;
  reason?: string;
  messageHash?: string;
}

/** Thrown by a broadcast whose outcome is unknown (submitted but unconfirmed). NEVER blind-retried. */
export class AmbiguousBroadcastError extends Error {
  constructor(message = "broadcast outcome unknown") {
    super(message);
    this.name = "AmbiguousBroadcastError";
  }
}

export interface ChainGateway {
  readJob(): Promise<OnChainJob>;
  /** Broadcast the effect. Resolves with a tx hash, or throws AmbiguousBroadcastError. */
  broadcast(effectType: EffectType, payload: EffectPayload): Promise<{ txHash: string }>;
  getReceipt(txHash: string): Promise<{ status: "success" | "reverted" }>;
}

export interface StoredEffect {
  id: string;
  state: EffectState;
  attempts: number;
  txHash: string | null;
}

export interface EffectStore {
  /** Insert-or-get by the effectively-once key (order, type, payloadHash). */
  upsert(effectType: EffectType, payloadHash: string, precondition: string): Promise<StoredEffect>;
  incrementAttempts(id: string): Promise<void>;
  recordBroadcast(id: string, txHash: string): Promise<void>;
  markConfirmed(id: string, txHash: string | null): Promise<void>;
  markUnknown(id: string): Promise<void>;
  markReverted(id: string): Promise<void>;
}

export type CrashPoint =
  | "after_insert"
  | "after_broadcast"
  | "after_record"
  | "after_confirm"
  | "during_reconcile";

export interface EffectOutcome {
  state: EffectState | "blocked" | "p0_freeze";
  txHash?: string | null;
}

export interface ExecuteEffectDeps {
  store: EffectStore;
  chain: ChainGateway;
  /** Test-only crash injector: throws at the named boundary to simulate process death. */
  crash?: (point: CrashPoint) => Promise<void> | void;
}

// --- Per-effect semantics: is the chain already in the desired-or-later state,
// and does the exact precondition hold? A mismatch that would overwrite an
// existing on-chain commitment (a different budget / a different submitted hash)
// is a P0 freeze, never a silent overwrite (§4.5 step 9). ---

const TERMINAL: OnChainJob["status"][] = ["completed", "rejected", "refunded"];

export function isApplied(effectType: EffectType, job: OnChainJob, payload: EffectPayload): boolean {
  switch (effectType) {
    case "set_budget":
      return job.budget !== null && job.budget === payload.amount;
    case "reject":
      return job.status === "rejected" || job.status === "refunded";
    case "submit_offchain":
      return job.offchainHash !== null && job.offchainHash === payload.deliverableHash;
    case "submit_onchain":
      return job.submittedHash !== null && job.submittedHash === payload.deliverableHash;
    case "claim_refund":
      return job.refunded || job.status === "refunded";
    case "message":
      return payload.messageHash !== undefined && job.sentMessageHashes.includes(payload.messageHash);
  }
}

export type PreconditionResult = "ok" | "blocked" | "p0_mismatch";

export function precondition(effectType: EffectType, job: OnChainJob, payload: EffectPayload): PreconditionResult {
  switch (effectType) {
    case "set_budget":
      if (job.budget !== null && job.budget !== payload.amount) return "p0_mismatch";
      return job.status === "created" ? "ok" : "blocked";
    case "reject":
      return TERMINAL.includes(job.status) ? "blocked" : "ok";
    case "submit_offchain":
      return job.status === "funded" ? "ok" : "blocked";
    case "submit_onchain":
      if (job.submittedHash !== null && job.submittedHash !== payload.deliverableHash) return "p0_mismatch";
      // On-chain submit requires the off-chain payload posted first (§4.5).
      return job.status === "funded" && job.offchainHash === payload.deliverableHash ? "ok" : "blocked";
    case "claim_refund":
      return job.expired ? "ok" : "blocked";
    case "message":
      return "ok";
  }
}

/**
 * Execute one effect at most once (§4.5). The caller MUST already hold gateway
 * leadership and the per-order advisory lock. Returns the terminal effect state;
 * an ambiguous broadcast yields `unknown` (reconcile later, never blind-retry),
 * a would-be-overwrite yields `p0_freeze`.
 */
export async function executeEffect(
  effectType: EffectType,
  payload: EffectPayload,
  payloadHash: string,
  precond: string,
  deps: ExecuteEffectDeps,
): Promise<EffectOutcome> {
  // Step 1: durable effect row (unique on order+type+payloadHash).
  const effect = await deps.store.upsert(effectType, payloadHash, precond);
  if (effect.state === "confirmed") return { state: "confirmed", txHash: effect.txHash };
  await deps.crash?.("after_insert");

  // Step 3: read canonical on-chain state.
  const job = await deps.chain.readJob();

  // Step 4: desired-or-later state already exists → confirm WITHOUT sending.
  // This is what makes a crash after a successful broadcast safe: the chain,
  // not our unrecorded tx hash, is the source of truth.
  if (isApplied(effectType, job, payload)) {
    await deps.store.markConfirmed(effect.id, effect.txHash);
    return { state: "confirmed", txHash: effect.txHash };
  }

  // Step 5/9: precondition. A mismatch that would overwrite an existing on-chain
  // commitment is a P0 freeze; a not-yet-ready precondition is a no-op.
  const pre = precondition(effectType, job, payload);
  if (pre === "p0_mismatch") return { state: "p0_freeze" };
  if (pre === "blocked") return { state: "blocked" };

  // Step 8: an `unknown` effect is only retried because we re-read the chain
  // above and proved the effect ABSENT (isApplied was false) with the
  // precondition still holding — never a blind retry.
  await deps.store.incrementAttempts(effect.id);

  // Step 5: broadcast exactly once.
  let txHash: string;
  try {
    ({ txHash } = await deps.chain.broadcast(effectType, payload));
  } catch (err) {
    if (err instanceof AmbiguousBroadcastError) {
      // Step 7: outcome unknown — mark and reconcile on-chain later.
      await deps.store.markUnknown(effect.id);
      return { state: "unknown" };
    }
    throw err;
  }
  await deps.crash?.("after_broadcast");

  // Step 6: record tx hash, then the receipt.
  await deps.store.recordBroadcast(effect.id, txHash);
  await deps.crash?.("after_record");
  const receipt = await deps.chain.getReceipt(txHash);
  if (receipt.status === "reverted") {
    await deps.store.markReverted(effect.id);
    return { state: "reverted", txHash };
  }
  await deps.store.markConfirmed(effect.id, txHash);
  await deps.crash?.("after_confirm");
  return { state: "confirmed", txHash };
}
