import { describe, expect, it } from "vitest";
import type { OnChainJob } from "./agent-effects";
import {
  acpFromChain,
  isValidExecTransition,
  resultMapping,
  type AcpStatus,
} from "./agent-order-state";

function job(status: OnChainJob["status"]): OnChainJob {
  return { status, budget: null, offchainHash: null, submittedHash: null, refunded: false, expired: false, sentMessageHashes: [] };
}

describe("acpFromChain", () => {
  it.each<[OnChainJob["status"], AcpStatus]>([
    ["created", "created"],
    ["budgeted", "budgeted"],
    ["funded", "funded"],
    ["submitted", "submitted"],
    ["completed", "completed"],
    ["rejected", "rejected"],
    ["refunded", "expired"],
  ])("maps chain %s to acp %s", (chain, acp) => {
    expect(acpFromChain(job(chain))).toBe(acp);
  });
});

describe("isValidExecTransition", () => {
  it("allows the forward path and abort, rejects jumps and terminal exits", () => {
    expect(isValidExecTransition("pending", "admitted")).toBe(true);
    expect(isValidExecTransition("processing", "submitted")).toBe(true);
    expect(isValidExecTransition("admitted", "aborted")).toBe(true);
    expect(isValidExecTransition("pending", "completed")).toBe(false); // no skipping
    expect(isValidExecTransition("completed", "processing")).toBe(false); // terminal
  });
});

describe("resultMapping (§4.6 — commerce decoupled from evidence)", () => {
  it("a delivered report completes regardless of sparse evidence", () => {
    expect(resultMapping({ delivered: true })).toEqual({ resultState: "completed", attribution: null });
  });

  it("expiry claims a refund and attributes the responsible phase", () => {
    expect(resultMapping({ expired: true, failurePhase: "deadline" })).toEqual({
      resultState: "expired",
      attribution: "deadline",
    });
  });

  it("a pre-funding funding_timeout rejects (no money moved)", () => {
    expect(resultMapping({ failurePhase: "funding_timeout" })).toEqual({
      resultState: "rejected",
      attribution: "funding_timeout",
    });
  });

  it("a post-funding technical failure refunds", () => {
    expect(resultMapping({ failurePhase: "provider", funded: true })).toEqual({
      resultState: "refunded",
      attribution: "provider",
    });
  });

  it("a pre-funding technical failure rejects", () => {
    expect(resultMapping({ failurePhase: "resolver", funded: false })).toEqual({
      resultState: "rejected",
      attribution: "resolver",
    });
  });

  it("an evaluator rejection is terminal, attributed, never auto-resubmitted", () => {
    expect(resultMapping({ failurePhase: "evaluator", funded: true })).toEqual({
      resultState: "rejected",
      attribution: "evaluator",
    });
  });
});
