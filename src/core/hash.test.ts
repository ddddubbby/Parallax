import { describe, expect, it } from "vitest";
import { stableHash, stableIndex } from "./hash";

describe("stableHash (D-016)", () => {
  it("is deterministic for the same input", () => {
    expect(stableHash("abc|mock|0")).toBe(stableHash("abc|mock|0"));
  });

  it("differs for different rep indices of the same cell", () => {
    const a = stableHash("Compare X and Y|mock|0");
    const b = stableHash("Compare X and Y|mock|1");
    expect(a).not.toBe(b);
  });

  it("returns a non-negative 32-bit integer", () => {
    const h = stableHash("anything");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
});

describe("stableIndex", () => {
  it("stays in range and is stable", () => {
    for (let i = 0; i < 50; i++) {
      const idx = stableIndex(`cell-${i}|mock|0`, 37);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(37);
    }
    expect(stableIndex("x", 10)).toBe(stableIndex("x", 10));
  });

  it("returns -1 for an empty list", () => {
    expect(stableIndex("x", 0)).toBe(-1);
  });
});
