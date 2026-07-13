import { describe, expect, it } from "vitest";
import {
  AGENT_PRICE_MICRO_USDC,
  CAPACITY_DEFAULTS,
  evaluateCapacity,
  evaluateEconomics,
  evaluateStructural,
  fundingTimedOut,
  lateFunding,
  providerNetMicro,
  settlementReconciles,
  submitDeadline,
} from "./agent-admission";

describe("evaluateEconomics (§3)", () => {
  it("admits the whitepaper-typical case: $99 gross at 20% fee → $79.20 net ≥ $27", () => {
    expect(providerNetMicro({ grossMicroUsdc: AGENT_PRICE_MICRO_USDC, totalFeeBp: 2000 })).toBe(79_200_000n);
    expect(evaluateEconomics({ grossMicroUsdc: AGENT_PRICE_MICRO_USDC, totalFeeBp: 2000 })).toEqual({ ok: true });
  });

  it("rejects a fee above 20% — never hardcode the split (§3)", () => {
    const r = evaluateEconomics({ grossMicroUsdc: AGENT_PRICE_MICRO_USDC, totalFeeBp: 2001 });
    expect(r).toMatchObject({ ok: false, reason: "fee_too_high" });
  });

  it("rejects when net < 3× hard COGS (e.g. a mispriced $30 job)", () => {
    const r = evaluateEconomics({ grossMicroUsdc: 30_000_000n, totalFeeBp: 2000 }); // net $24 < $27
    expect(r).toMatchObject({ ok: false, reason: "net_below_cogs_multiple" });
  });

  it("rejects unreadable fee values", () => {
    expect(evaluateEconomics({ grossMicroUsdc: AGENT_PRICE_MICRO_USDC, totalFeeBp: -1 })).toMatchObject({ ok: false, reason: "fee_unreadable" });
    expect(evaluateEconomics({ grossMicroUsdc: AGENT_PRICE_MICRO_USDC, totalFeeBp: 12.5 })).toMatchObject({ ok: false, reason: "fee_unreadable" });
  });
});

describe("settlementReconciles (±$0.01)", () => {
  it("accepts within tolerance, rejects beyond", () => {
    expect(settlementReconciles(79_200_000n, 79_200_000n)).toBe(true);
    expect(settlementReconciles(79_200_000n, 79_190_000n)).toBe(true); // exactly $0.01
    expect(settlementReconciles(79_200_000n, 79_189_999n)).toBe(false);
    expect(settlementReconciles(79_200_000n, 79_210_001n)).toBe(false);
  });
});

describe("§4.6 timing", () => {
  const t0 = new Date("2026-07-13T00:00:00Z");
  it("funding timeout fires strictly after 10 minutes", () => {
    expect(fundingTimedOut(t0, new Date(t0.getTime() + 10 * 60_000))).toBe(false);
    expect(fundingTimedOut(t0, new Date(t0.getTime() + 10 * 60_000 + 1))).toBe(true);
  });
  it("late funding fires when runway to expiry < 75 minutes", () => {
    const expiredAt = new Date(t0.getTime() + 90 * 60_000);
    expect(lateFunding(new Date(t0.getTime() + 15 * 60_000), expiredAt)).toBe(false); // exactly 75 left
    expect(lateFunding(new Date(t0.getTime() + 15 * 60_000 + 1), expiredAt)).toBe(true);
  });
  it("submit deadline is expiry − 15 minutes", () => {
    const expiredAt = new Date(t0.getTime() + 90 * 60_000);
    expect(submitDeadline(expiredAt).getTime()).toBe(expiredAt.getTime() - 15 * 60_000);
  });
});

describe("evaluateCapacity (§4.6 launch defaults)", () => {
  const clear = { admittedConcurrent: 0, buyerNonterminal: 0, buyerFunded24h: 0, globalFunded24h: 0 };
  it("admits a clear slate and rejects each cap at its boundary", () => {
    expect(evaluateCapacity(clear)).toEqual({ ok: true });
    expect(evaluateCapacity({ ...clear, admittedConcurrent: 1 })).toMatchObject({ ok: false, reason: "capacity_concurrent" });
    expect(evaluateCapacity({ ...clear, buyerNonterminal: 1 })).toMatchObject({ ok: false, reason: "capacity_buyer_nonterminal" });
    expect(evaluateCapacity({ ...clear, buyerFunded24h: 2 })).toMatchObject({ ok: false, reason: "capacity_buyer_daily" });
    expect(evaluateCapacity({ ...clear, globalFunded24h: 6 })).toMatchObject({ ok: false, reason: "capacity_global_daily" });
  });
  it("launch defaults match §4.6", () => {
    expect(CAPACITY_DEFAULTS).toMatchObject({
      maxAdmittedConcurrent: 1,
      maxNonterminalPerBuyer: 1,
      maxFundedPerBuyerPer24h: 2,
      maxFundedGlobalPer24h: 6,
      maxCallsPerProviderPerDay: 750,
      globalDailySpendCapUsd: 54,
    });
  });
});

describe("evaluateStructural (§4.6 step 2)", () => {
  const ok = {
    providerMatches: true,
    settlementChainIsBase: true,
    hookIsZeroAddress: true,
    evaluatorIsZeroAddress: true,
    offeringMatches: true,
    registryDigestMatches: true,
  };
  it("admits only when every structural check holds, naming the failures", () => {
    expect(evaluateStructural(ok)).toEqual({ ok: true });
    const r = evaluateStructural({ ...ok, evaluatorIsZeroAddress: false, registryDigestMatches: false });
    expect(r).toMatchObject({ ok: false, reason: "structural_mismatch" });
    if (!r.ok) expect(r.detail).toBe("evaluatorIsZeroAddress, registryDigestMatches");
  });
});
