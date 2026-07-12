import { describe, expect, it } from "vitest";
import { DESCRIPTOR_V1, RISK_V1 } from "./agent-lexicons";
import { maskIdentity, maskedLexiconHits, qualifiedTickerSpans } from "./agent-extraction";

describe("maskIdentity (C-C length-preserving)", () => {
  it("blanks name and qualified-ticker spans without changing length or other offsets", () => {
    const text = "AI Corp ($AICORP) is an AI project on Base.";
    const masked = maskIdentity(text, { name: "AI Corp", symbol: "AICORP" });
    expect(masked).toHaveLength(text.length);
    // The second "AI" (in "an AI project") is NOT part of the name and survives.
    expect(masked).toContain("an AI project");
    // The name occurrence and $AICORP are blanked.
    expect(masked.startsWith("       ")).toBe(true);
    expect(masked).not.toContain("$AICORP");
  });

  it("does not blank a bare ticker that is not adjacent to the name", () => {
    // Name and ticker are distinct, so a bare ticker with no $/parens and no
    // adjacent name occurrence is NOT a qualified form and survives.
    const text = "WETH is great. Separately, WETH trades a lot.";
    const masked = maskIdentity(text, { name: "Wrapped Ether", symbol: "WETH" });
    expect(masked).toContain("WETH");
  });
});

describe("maskedLexiconHits", () => {
  it("does not count a descriptor that appears only inside the token name", () => {
    // "AI Corp" would otherwise yield a descriptor hit for "ai".
    const text = "AI Corp is a serious company.";
    const hits = maskedLexiconHits(text, { name: "AI Corp", symbol: "AIC" }, DESCRIPTOR_V1);
    expect(hits.filter((h) => h.term === "ai")).toHaveLength(0);
  });

  it("still counts a descriptor that appears in the surrounding prose", () => {
    const text = "AI Corp is a community meme token.";
    const hits = maskedLexiconHits(text, { name: "AI Corp", symbol: "AIC" }, DESCRIPTOR_V1);
    expect(hits.map((h) => h.term).sort()).toEqual(["community", "meme"]);
  });

  it("does not count a risk word that is part of the token name", () => {
    // "RugRadio" contains "rug"; masking the name removes it.
    const text = "RugRadio is a podcast network.";
    const hits = maskedLexiconHits(text, { name: "RugRadio", symbol: "RUG" }, RISK_V1);
    expect(hits).toHaveLength(0);
  });

  it("counts a genuine risk word in the prose with an original-text quote", () => {
    const text = "Some users call RugRadio a scam.";
    const hits = maskedLexiconHits(text, { name: "RugRadio", symbol: "RUG" }, RISK_V1);
    expect(hits).toHaveLength(1);
    expect(hits[0].term).toBe("scam");
    expect(text.slice(hits[0].start, hits[0].end)).toBe("scam");
    expect(hits[0].quoted).toBe("scam");
  });
});

describe("qualifiedTickerSpans", () => {
  it("matches $TICKER, (TICKER), and name-adjacent bare ticker only", () => {
    const text = "Pepe (PEPE) aka $PEPE. Unrelated PEPE elsewhere.";
    const spans = qualifiedTickerSpans(text, { name: "Pepe", symbol: "PEPE" });
    // (PEPE), $PEPE, and the adjacent "(PEPE)"-inner PEPE — but not the trailing standalone PEPE.
    // Count is at least 2 (the parenthesized and $-prefixed forms).
    expect(spans.length).toBeGreaterThanOrEqual(2);
    const trailing = text.lastIndexOf("PEPE");
    expect(spans.some((s) => s.start === trailing)).toBe(false);
  });
});
