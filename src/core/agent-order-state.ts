// Order state machine (AGENT_BUILD_PLAN §9 / §4.6). THREE machines kept
// separate: ACP status (commerce, observed on-chain), our internal execution
// status, and the terminal result state. Commerce state and evidence state are
// decoupled (the 2026-07-12 ruling): any technically complete report — including
// a sparse one — is submitted and the ACP job COMPLETES; representation_state
// rides inside the report and is NEVER an ACP-level result.

import type { OnChainJob } from "./agent-effects";

export type AcpStatus =
  | "created" | "budgeted" | "funded" | "submitted" | "completed" | "rejected" | "expired";
export type ExecStatus =
  | "pending" | "admitted" | "processing" | "submitted" | "completed" | "aborted";
export type ResultState = "open" | "completed" | "rejected" | "refunded" | "expired";

/** Map the canonical on-chain job (§4.4: never trust SDK-derived state) to an ACP status. */
export function acpFromChain(job: OnChainJob): AcpStatus {
  if (job.status === "refunded") return "expired"; // refund is the terminal form of an expiry claim
  return job.status;
}

/** Legal internal execution transitions. Anything else is a bug, not a state. */
export const EXEC_TRANSITIONS: Record<ExecStatus, readonly ExecStatus[]> = {
  pending: ["admitted", "aborted"],
  admitted: ["processing", "aborted"],
  processing: ["submitted", "aborted"],
  submitted: ["completed", "aborted"],
  completed: [],
  aborted: [],
};

export function isValidExecTransition(from: ExecStatus, to: ExecStatus): boolean {
  return EXEC_TRANSITIONS[from].includes(to);
}

/** The phase responsible for a non-delivery terminal outcome (§4.6 attribution). */
export type FailurePhase =
  | "resolver"
  | "provider"
  | "rpc"
  | "report"
  | "cost"
  | "deadline"
  | "funding_timeout"
  | "late_funding"
  | "evaluator";

export interface ResultInput {
  /** A technically complete report was submitted and the job auto-completed. */
  delivered?: boolean;
  /** The job passed its on-chain expiry without a submission. */
  expired?: boolean;
  /** A non-delivery failure and the phase that owns it. */
  failurePhase?: FailurePhase;
  /** Whether the job had reached `funded` (money escrowed) when the failure hit. */
  funded?: boolean;
}

export interface ResultMapping {
  resultState: ResultState;
  attribution: FailurePhase | null;
}

/**
 * Map an order outcome to its terminal result state + attribution (§4.6):
 * delivered → completed; expiry → refunded (attributed to the phase that ran out
 * the clock, if any) via a permissionless claimRefund; a pre-funding failure →
 * rejected (no money moved); a post-funding technical/cost/deadline failure →
 * refunded; an evaluator rejection in graduation → rejected, terminal, no
 * auto-resubmit.
 */
export function resultMapping(input: ResultInput): ResultMapping {
  if (input.delivered) return { resultState: "completed", attribution: null };
  if (input.expired) return { resultState: "expired", attribution: input.failurePhase ?? null };
  const phase = input.failurePhase;
  if (!phase) return { resultState: "open", attribution: null };
  if (phase === "evaluator") return { resultState: "rejected", attribution: "evaluator" };
  if (phase === "funding_timeout") return { resultState: "rejected", attribution: "funding_timeout" };
  // Any other technical/cost/deadline failure: refund if funds were escrowed,
  // otherwise reject (nothing to refund).
  return { resultState: input.funded ? "refunded" : "rejected", attribution: phase };
}
