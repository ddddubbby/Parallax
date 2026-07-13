// ACP gateway (AGENT_BUILD_PLAN §4.4/§4.6). The VirtualsGatewayClient boundary
// wraps the young acp-node-v2 SDK so an SDK upgrade cannot silently change
// lifecycle or signer behavior; the orchestrator drives M39's proven
// effectively-once ledger + state machine from observed ACP events. Everything
// here is offline-testable with fixture events + a fake ChainGateway; the real
// SDK/viem-backed VirtualsGatewayClient is wired at live time (operator wallets).

import { contentHash, eventFingerprint, type BoundedDedupeSet } from "@/core/agent-transport";
import {
  executeEffect,
  type ChainGateway,
  type EffectOutcome,
} from "@/core/agent-effects";
import { acpFromChain, resultMapping } from "@/core/agent-order-state";
import {
  createEffectStore,
  getAdmissions,
  getOrderByJob,
  insertOrderEvent,
  updateOrderState,
  withTryOrderLock,
} from "@/db/repositories/agent-commerce";

/**
 * The §4.4 compatibility boundary: the ONLY surface that touches the ACP SDK /
 * chain. A fixture implementation backs the offline tests; the real Privy/viem
 * implementation is wired at live time. `ChainGateway` (M39) is the on-chain
 * action subset the ledger drives; this interface adds the SDK/transport reads.
 */
export interface VirtualsGatewayClient extends ChainGateway {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Verify the live registry record matches our immutable manifest (drift freezes admissions). */
  verifyRegistry(): Promise<{ ok: boolean; drift?: string }>;
  /** Awaited (never fire-and-forget) message send (§4.4). */
  sendMessage(jobId: string, content: string): Promise<{ txHash?: string }>;
}

// The fixed price the gateway sets on every job (AGENT_PRD §13) — one home
// (core/agent-admission), re-exported for existing importers.
import { AGENT_PRICE_MICRO_USDC } from "@/core/agent-admission";
export { AGENT_PRICE_MICRO_USDC };

export interface RawAcpEvent {
  chainId: number;
  jobId: string;
  kind: string;
  sender: string | null;
  timestamp: number | string;
  source: string; // sse | history | poll
  payload: unknown;
}

export interface GatewayDeps {
  chain: ChainGateway;
  /** In-memory dedupe (latency optimization); the DB fingerprint is the completeness guarantee. */
  dedupe: BoundedDedupeSet;
}

/**
 * Ingest one observed ACP event: dedupe (in-memory LRU + durable DB fingerprint),
 * persist BEFORE any business action (§4.4). Returns whether it was new and the
 * correlated order id (null if no order row exists yet).
 */
export async function ingestEvent(
  event: RawAcpEvent,
  deps: GatewayDeps,
): Promise<{ inserted: boolean; orderId: string | null }> {
  const fingerprint = eventFingerprint({
    chainId: event.chainId,
    jobId: event.jobId,
    kind: event.kind,
    sender: event.sender,
    contentHash: contentHash(event.payload),
    timestamp: event.timestamp,
  });
  // In-memory fast path: a known fingerprint is dropped without a DB round trip.
  if (!deps.dedupe.add(fingerprint)) return { inserted: false, orderId: null };

  const order = await getOrderByJob(event.chainId, event.jobId);
  const result = await insertOrderEvent({
    orderId: order?.id ?? null,
    settlementChainId: event.chainId,
    onchainJobId: event.jobId,
    fingerprint,
    kind: event.kind,
    sender: event.sender,
    source: event.source,
    rawPayloadJson: event.payload,
  });
  return { inserted: result.inserted, orderId: order?.id ?? null };
}

export interface AdvanceInput {
  orderId: string;
  /** The report digest to submit once funded (present after the run completes). */
  deliverableHash?: string;
}

export type AdvanceOutcome =
  | { action: "none"; reason: string }
  | { action: "skipped_not_leader" }
  | { action: "effect"; effectType: string; outcome: EffectOutcome };

/**
 * Advance one order by exactly one lifecycle step, based on the CANONICAL
 * on-chain job state (§4.4: never trust SDK-derived state). Runs under the
 * per-order advisory lock; the gateway loop holds process-level leadership
 * around its work (§4.4 duplicate-instance protection). Every chain action goes
 * through M39's effectively-once ledger.
 */
export async function advanceOrder(input: AdvanceInput, deps: GatewayDeps): Promise<AdvanceOutcome> {
  const result = await withTryOrderLock(input.orderId, async () => {
      const job = await deps.chain.readJob();
      const acp = acpFromChain(job);
      const store = createEffectStore(input.orderId);
      const runEffect = (effectType: Parameters<typeof executeEffect>[0], payload: Parameters<typeof executeEffect>[1], hash: string, pre: string) =>
        executeEffect(effectType, payload, hash, pre, { store, chain: deps.chain });

      // Reflect the observed commerce status.
      await updateOrderState(input.orderId, { acpStatus: acp });

      // Decision precedence (§4.6): delivered-terminal first; then expiry (a blown
      // deadline refunds rather than pressing on); then advance the live job.

      // submitted/completed → zero-evaluator auto-completes; record the terminal result.
      if (job.status === "submitted" || job.status === "completed") {
        const mapping = resultMapping({ delivered: true });
        await updateOrderState(input.orderId, {
          execStatus: "completed",
          resultState: mapping.resultState,
          terminalAttribution: mapping.attribution,
        });
        return { action: "none" as const, reason: "completed" };
      }

      // expired (and not yet refunded/terminal) → durable permissionless refund claim.
      if (job.expired && !job.refunded && job.status !== "rejected") {
        const outcome = await runEffect("claim_refund", {}, `claim_refund:${input.orderId}`, "expired");
        return { action: "effect" as const, effectType: "claim_refund", outcome };
      }

      // created → set the fixed budget (admissions must be enabled).
      if (job.status === "created") {
        if (!(await getAdmissions())) return { action: "none" as const, reason: "admissions_disabled" };
        const outcome = await runEffect("set_budget", { amount: AGENT_PRICE_MICRO_USDC }, `set_budget:${input.orderId}`, "created");
        return { action: "effect" as const, effectType: "set_budget", outcome };
      }

      // funded → submit the deliverable off-chain first, then its hash on-chain (§4.5).
      if (job.status === "funded") {
        if (!input.deliverableHash) return { action: "none" as const, reason: "awaiting_deliverable" };
        if (job.offchainHash !== input.deliverableHash) {
          const outcome = await runEffect("submit_offchain", { deliverableHash: input.deliverableHash }, `submit_offchain:${input.deliverableHash}`, "funded");
          return { action: "effect" as const, effectType: "submit_offchain", outcome };
        }
        const outcome = await runEffect("submit_onchain", { deliverableHash: input.deliverableHash }, `submit_onchain:${input.deliverableHash}`, "funded+offchain");
        return { action: "effect" as const, effectType: "submit_onchain", outcome };
      }

      return { action: "none" as const, reason: `no_step_for_${job.status}` };
  });
  // The order lock was held by another instance → this one stands down.
  if (result === null || result === undefined) return { action: "skipped_not_leader" };
  return result;
}
