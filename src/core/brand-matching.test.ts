import { describe, expect, it } from "vitest";
import {
  brandTermEquals,
  compactKey,
  containsBrandTerm,
  findCompactKeyCollisions,
  resolveBrandTerms,
} from "./brand-matching";

// D-115 regression fixtures: observed names taken verbatim from the real
// Insta 360 failure run (a45cbc1e), where "Insta 360" (registered) vs
// "Insta360" (engine spelling) silently lost 334/338 client mentions.
const BRANDS = [
  { id: "client", name: "Insta 360", aliases: [] },
  { id: "dji", name: "DJI", aliases: [] },
  { id: "gopro", name: "Go Pro", aliases: [] },
  { id: "akaso", name: "Akaso", aliases: [] },
];

describe("compactKey / brandTermEquals (D-115 layer 1)", () => {
  it("equates spacing and punctuation variants of the same name", () => {
    expect(compactKey("Insta 360")).toBe("insta360");
    expect(brandTermEquals("Insta360", "Insta 360")).toBe(true);
    expect(brandTermEquals("insta-360", "Insta 360")).toBe(true);
    expect(brandTermEquals("GoPro", "Go Pro")).toBe(true);
    expect(brandTermEquals("Coca Cola", "Coca-Cola")).toBe(true);
  });

  it("never equates different names", () => {
    expect(brandTermEquals("Insta360 X4", "Insta 360")).toBe(false);
    expect(brandTermEquals("DJI", "Insta 360")).toBe(false);
    expect(brandTermEquals("", "Insta 360")).toBe(false);
    expect(brandTermEquals("Insta 360", "")).toBe(false);
  });
});

describe("containsBrandTerm (D-115 layer 2)", () => {
  it("finds a brand term inside product names across spacing variants", () => {
    expect(containsBrandTerm("Insta360 X4", "Insta 360")).toBe(true);
    expect(containsBrandTerm("Insta 360 X4", "Insta 360")).toBe(true);
    expect(containsBrandTerm("GoPro HERO13 Black", "Go Pro")).toBe(true);
    expect(containsBrandTerm("DJI Osmo Action 4", "DJI")).toBe(true);
    expect(containsBrandTerm("the Insta-360 GO 3S", "Insta 360")).toBe(true);
  });

  it("stays word-boundary safe in compact space", () => {
    // Brand "X" must not match inside token "x4".
    expect(containsBrandTerm("Insta360 X4", "X")).toBe(false);
    // "Akaso" is not inside "Akason" (window grows past target and stops).
    expect(containsBrandTerm("Akason cameras", "Akaso")).toBe(false);
    // Multi-token windows: "insta" + "360" tokens compact to the term.
    expect(containsBrandTerm("insta 360 review", "Insta360")).toBe(true);
  });
});

describe("resolveBrandTerms (D-115 resolution order)", () => {
  it("resolves the recorded failure spellings without any alias", () => {
    expect(resolveBrandTerms("Insta360", BRANDS)).toBe("client");
    expect(resolveBrandTerms("GoPro", BRANDS)).toBe("gopro");
    expect(resolveBrandTerms("Insta 360", BRANDS)).toBe("client");
    expect(resolveBrandTerms("DJI", BRANDS)).toBe("dji");
  });

  it("resolves model names via unique containment", () => {
    expect(resolveBrandTerms("Insta360 X4", BRANDS)).toBe("client");
    expect(resolveBrandTerms("Insta360 Ace Pro 2", BRANDS)).toBe("client");
    expect(resolveBrandTerms("GoPro HERO13 Black", BRANDS)).toBe("gopro");
    expect(resolveBrandTerms("GoPros", BRANDS)).toBe(null); // token "gopros" ≠ "gopro" — equality is honest, not stemmed
  });

  it("fails closed on ambiguity and unknowns", () => {
    expect(resolveBrandTerms("Insta360 vs GoPro comparison", BRANDS)).toBe(null);
    expect(resolveBrandTerms("Canon EOS R5", BRANDS)).toBe(null);
    expect(resolveBrandTerms("", BRANDS)).toBe(null);
  });

  it("equality across all brands beats containment in another", () => {
    // Observed "Go Pro" equals gopro exactly; even though a hypothetical
    // brand term could be contained, equality short-circuits first.
    const brands = [
      { id: "a", name: "Pro", aliases: [] },
      { id: "gopro", name: "Go Pro", aliases: [] },
    ];
    expect(resolveBrandTerms("GoPro", brands)).toBe("gopro");
  });

  it("aliases participate in both layers", () => {
    const brands = [{ id: "client", name: "Shenzhen Arashi Vision", aliases: ["Insta360"] }];
    expect(resolveBrandTerms("insta 360", brands)).toBe("client");
    expect(resolveBrandTerms("Insta360 X3", brands)).toBe("client");
  });
});

describe("findCompactKeyCollisions (D-115 guard)", () => {
  it("flags two tracked brands sharing a compact key", () => {
    const collisions = findCompactKeyCollisions([
      { id: "a", name: "Go Pro", aliases: [] },
      { id: "b", name: "GoPro", aliases: [] },
      { id: "c", name: "DJI", aliases: [] },
    ]);
    expect(collisions).toEqual([{ key: "gopro", names: ["Go Pro", "GoPro"] }]);
  });

  it("alias-vs-name collisions across brands are caught; within one brand they are fine", () => {
    expect(
      findCompactKeyCollisions([
        { id: "a", name: "Insta 360", aliases: ["Insta360"] }, // same brand: not a collision
        { id: "b", name: "DJI", aliases: [] },
      ]),
    ).toEqual([]);
    expect(
      findCompactKeyCollisions([
        { id: "a", name: "Insta 360", aliases: [] },
        { id: "b", name: "Osmo", aliases: ["insta-360"] },
      ]),
    ).toEqual([{ key: "insta360", names: ["Insta 360", "Osmo"] }]);
  });
});
