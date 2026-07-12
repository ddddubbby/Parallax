import { describe, expect, it } from "vitest";
import { PROMPT_CONTROL_V1, RISK_V1, containsAnyLexiconTerm } from "./agent-lexicons";
import {
  CRYPTO_GEO_PROMPTS,
  LANE_CELL_COUNTS,
  resolveCryptoMatrix,
  scanLaneAForIdentity,
  type CryptoIdentity,
} from "./crypto-prompts";

const IDENTITY: CryptoIdentity = {
  chain: "ethereum",
  address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
  name: "Pepe",
  symbol: "PEPE",
};

describe("crypto_geo_prompts_v1 — design-time invariants", () => {
  it("has exactly 20 cells split 6/8/6 across lanes", () => {
    expect(CRYPTO_GEO_PROMPTS).toHaveLength(LANE_CELL_COUNTS.total);
    expect(CRYPTO_GEO_PROMPTS.filter((c) => c.lane === "A")).toHaveLength(LANE_CELL_COUNTS.A);
    expect(CRYPTO_GEO_PROMPTS.filter((c) => c.lane === "B")).toHaveLength(LANE_CELL_COUNTS.B);
    expect(CRYPTO_GEO_PROMPTS.filter((c) => c.lane === "C")).toHaveLength(LANE_CELL_COUNTS.C);
  });

  it("stays under the C-1 50-cell cap", () => {
    expect(CRYPTO_GEO_PROMPTS.length).toBeLessThanOrEqual(50);
  });

  it("uses only discovery (Lane A) and representation (Lanes B/C) intents", () => {
    for (const cell of CRYPTO_GEO_PROMPTS) {
      expect(cell.intent).toBe(cell.lane === "A" ? "discovery" : "representation");
    }
  });

  it("has globally unique variant keys", () => {
    const keys = CRYPTO_GEO_PROMPTS.map((c) => c.variantKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // P4: no prompt in ANY lane may contain a risk_v1 term (a metric never counts
  // a signal its own prompt planted). Design-time, word-boundary matching.
  it("contains no risk_v1 term in any prompt (P4)", () => {
    for (const cell of CRYPTO_GEO_PROMPTS) {
      expect(containsAnyLexiconTerm(cell.text, RISK_V1)).toBe(false);
    }
  });

  it("contains no prompt-control term in any prompt", () => {
    for (const cell of CRYPTO_GEO_PROMPTS) {
      expect(containsAnyLexiconTerm(cell.text, PROMPT_CONTROL_V1)).toBe(false);
    }
  });

  // P3 at design time: Lane A templates never carry name/ticker/address slots.
  it("Lane A templates carry no {name}/{ticker}/{address} placeholders (P3)", () => {
    for (const cell of CRYPTO_GEO_PROMPTS.filter((c) => c.lane === "A")) {
      expect(cell.text).not.toMatch(/\{name\}|\{ticker\}|\{address\}/);
    }
  });
});

describe("resolveCryptoMatrix", () => {
  const cells = resolveCryptoMatrix(IDENTITY, "meme_token");

  it("resolves all 20 cells with no leftover placeholders", () => {
    expect(cells).toHaveLength(20);
    for (const cell of cells) expect(cell.resolvedText).not.toMatch(/\{[a-z_]+\}/);
  });

  it("interpolates the category phrase and chain into Lane A", () => {
    const a1 = cells.find((c) => c.variantKey === "a1");
    expect(a1?.resolvedText).toBe("What are the most talked-about meme tokens on Ethereum right now?");
  });

  it("interpolates name/ticker into Lane B and address into Lane C", () => {
    expect(cells.find((c) => c.variantKey === "b1")?.resolvedText).toBe("What is Pepe (PEPE)?");
    expect(cells.find((c) => c.variantKey === "c1")?.resolvedText).toContain(IDENTITY.address);
  });

  it("never leaks name/ticker/address into any Lane A cell", () => {
    for (const cell of cells.filter((c) => c.lane === "A")) {
      expect(cell.resolvedText).not.toContain(IDENTITY.name);
      expect(cell.resolvedText).not.toContain(IDENTITY.symbol);
      expect(cell.resolvedText).not.toContain(IDENTITY.address);
    }
  });
});

describe("scanLaneAForIdentity (P3, job-time)", () => {
  it("passes a normal token whose name does not collide with the frame", () => {
    const cells = resolveCryptoMatrix(IDENTITY, "meme_token");
    expect(scanLaneAForIdentity(cells, IDENTITY.name, IDENTITY.symbol)).toEqual([]);
  });

  it("flags a token whose NAME is exactly the category phrase", () => {
    const evil: CryptoIdentity = { ...IDENTITY, name: "meme tokens", symbol: "EVIL" };
    const cells = resolveCryptoMatrix(evil, "meme_token");
    const violations = scanLaneAForIdentity(cells, evil.name, evil.symbol);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.every((v) => v.terms.includes("meme tokens"))).toBe(true);
  });

  it("flags a token named after the chain", () => {
    const evil: CryptoIdentity = { chain: "base", address: IDENTITY.address, name: "Base", symbol: "BASE" };
    const cells = resolveCryptoMatrix(evil, "general_crypto");
    expect(scanLaneAForIdentity(cells, evil.name, evil.symbol).length).toBeGreaterThan(0);
  });
});
