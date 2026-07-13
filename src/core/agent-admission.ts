// Admission preflight (AGENT_BUILD_PLAN §3 economics + §4.6 timing/capacity).
// Pure decision functions the gateway loop calls before any money moves; every
// reject maps to a §4.6 pre- or post-budget rejection with attribution. Fee
// basis points are read from the LIVE contract by the caller (mutable — the
// 80/20 split is never hardcoded, §3); these functions only do the math.

export const AGENT_PRICE_MICRO_USDC = 99_000_000n;
/** §3: provisional hard per-job COGS cap; re-pinned at the full M38 spike (A6). */
export const HARD_JOB_COGS_USD = 9.0;
/** §3: total effective fee must not exceed 20%. */
export const MAX_TOTAL_FEE_BP = 2000;
/** §3: provider net must be at least 3× the hard job COGS. */
export const MIN_NET_TO_COGS_MULTIPLE = 3;
/** §3: settlement must reconcile within ±$0.01. */
export const SETTLEMENT_TOLERANCE_MICRO = 10_000n; // $0.01 in micro-USDC

// §4.6 launch timing rules.
export const FUNDING_TIMEOUT_MS = 10 * 60_000; // unfunded after 10 min → reject
export const MIN_RUNWAY_AT_FUNDING_MS = 75 * 60_000; // < 75 min to expiry → late_funding_abort
export const SUBMIT_SAFETY_MARGIN_MS = 15 * 60_000; // submit no later than expiry − 15 min

export interface EconomicsInput {
  /** Gross job price in micro-USDC (what the buyer escrows). */
  grossMicroUsdc: bigint;
  /** Total effective fee in basis points, read from the LIVE contract. */
  totalFeeBp: number;
}

export type AdmissionDecision =
  | { ok: true }
  | { ok: false; reason: string; detail: string };

/** Provider net after fees, in micro-USDC. */
export function providerNetMicro(input: EconomicsInput): bigint {
  return input.grossMicroUsdc - (input.grossMicroUsdc * BigInt(input.totalFeeBp)) / 10_000n;
}

/** §3 economics gate: fee ≤ 20% AND provider net ≥ 3× hard job COGS. */
export function evaluateEconomics(input: EconomicsInput): AdmissionDecision {
  if (input.totalFeeBp < 0 || !Number.isInteger(input.totalFeeBp)) {
    return { ok: false, reason: "fee_unreadable", detail: `fee bp ${input.totalFeeBp} is not a valid basis-point value` };
  }
  if (input.totalFeeBp > MAX_TOTAL_FEE_BP) {
    return { ok: false, reason: "fee_too_high", detail: `total fee ${input.totalFeeBp} bp > ${MAX_TOTAL_FEE_BP} bp` };
  }
  const netMicro = providerNetMicro(input);
  const minNetMicro = BigInt(Math.round(HARD_JOB_COGS_USD * MIN_NET_TO_COGS_MULTIPLE * 1_000_000));
  if (netMicro < minNetMicro) {
    return {
      ok: false,
      reason: "net_below_cogs_multiple",
      detail: `provider net ${netMicro} micro-USDC < required ${minNetMicro} (3× $${HARD_JOB_COGS_USD.toFixed(2)})`,
    };
  }
  return { ok: true };
}

/** §3: actual wallet credit must equal expected settlement within ±$0.01. */
export function settlementReconciles(expectedMicro: bigint, actualMicro: bigint): boolean {
  const diff = expectedMicro > actualMicro ? expectedMicro - actualMicro : actualMicro - expectedMicro;
  return diff <= SETTLEMENT_TOLERANCE_MICRO;
}

// --- §4.6 timing ---

/** Step 4: unfunded 10 min after budget → reject `funding_timeout` (re-read chain first). */
export function fundingTimedOut(budgetSetAt: Date, now: Date): boolean {
  return now.getTime() - budgetSetAt.getTime() > FUNDING_TIMEOUT_MS;
}

/** Step 6: at funding, require ≥ 75 min to expiry, else reject/refund `late_funding_abort`. */
export function lateFunding(fundedAt: Date, expiredAt: Date): boolean {
  return expiredAt.getTime() - fundedAt.getTime() < MIN_RUNWAY_AT_FUNDING_MS;
}

/** Step 8: the hard submit deadline (expiry − 15 min). */
export function submitDeadline(expiredAt: Date): Date {
  return new Date(expiredAt.getTime() - SUBMIT_SAFETY_MARGIN_MS);
}

// --- §4.6 launch capacity defaults ---

export const CAPACITY_DEFAULTS = {
  maxAdmittedConcurrent: 1,
  maxNonterminalPerBuyer: 1,
  maxFundedPerBuyerPer24h: 2,
  maxFundedGlobalPer24h: 6,
  maxCallsPerProviderPerDay: 750,
  /** Global daily spend cap = 6 × the current hard job cap (§4.6). */
  globalDailySpendCapUsd: 6 * HARD_JOB_COGS_USD,
} as const;

export interface CapacityCounts {
  admittedConcurrent: number;
  buyerNonterminal: number;
  buyerFunded24h: number;
  globalFunded24h: number;
}

/** Capacity gate over caller-supplied counts (the DB queries live gateway-side). */
export function evaluateCapacity(
  counts: CapacityCounts,
  limits: typeof CAPACITY_DEFAULTS = CAPACITY_DEFAULTS,
): AdmissionDecision {
  if (counts.admittedConcurrent >= limits.maxAdmittedConcurrent) {
    return { ok: false, reason: "capacity_concurrent", detail: `admitted ${counts.admittedConcurrent} ≥ ${limits.maxAdmittedConcurrent}` };
  }
  if (counts.buyerNonterminal >= limits.maxNonterminalPerBuyer) {
    return { ok: false, reason: "capacity_buyer_nonterminal", detail: `buyer has ${counts.buyerNonterminal} nonterminal job(s)` };
  }
  if (counts.buyerFunded24h >= limits.maxFundedPerBuyerPer24h) {
    return { ok: false, reason: "capacity_buyer_daily", detail: `buyer funded ${counts.buyerFunded24h} in 24h ≥ ${limits.maxFundedPerBuyerPer24h}` };
  }
  if (counts.globalFunded24h >= limits.maxFundedGlobalPer24h) {
    return { ok: false, reason: "capacity_global_daily", detail: `global funded ${counts.globalFunded24h} in 24h ≥ ${limits.maxFundedGlobalPer24h}` };
  }
  return { ok: true };
}

/** §4.6 step 2 identity/structure checks the gateway composes with the above. */
export interface AdmissionStructural {
  providerMatches: boolean;
  settlementChainIsBase: boolean;
  hookIsZeroAddress: boolean;
  evaluatorIsZeroAddress: boolean;
  offeringMatches: boolean;
  registryDigestMatches: boolean;
}

export function evaluateStructural(s: AdmissionStructural): AdmissionDecision {
  const failures = (Object.entries(s) as [keyof AdmissionStructural, boolean][])
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  if (failures.length > 0) {
    return { ok: false, reason: "structural_mismatch", detail: failures.join(", ") };
  }
  return { ok: true };
}
