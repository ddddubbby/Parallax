import { describe, expect, it } from "vitest";
import {
  classifyIdentity,
  deriveRepresentationState,
  extractAddresses,
  type ClassifierIdentity,
} from "./agent-identity";

const PEPE: ClassifierIdentity = {
  name: "Pepe",
  symbol: "PEPE",
  address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
  chain: "ethereum",
};

describe("classifyIdentity", () => {
  it("matched — target contract address appears in the answer", () => {
    const r = { rawText: `Pepe is a meme coin at ${PEPE.address} on Ethereum.`, citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("matched");
  });

  it("matched — target address appears only in a citation", () => {
    const r = {
      rawText: "Pepe ($PEPE) is a popular meme token.",
      citations: [`https://etherscan.io/token/${PEPE.address}`],
    };
    expect(classifyIdentity(r, PEPE)).toBe("matched");
  });

  it("matched — exact name + qualified ticker + matching chain, no conflicting contract", () => {
    const r = { rawText: "Pepe ($PEPE) is an Ethereum meme token.", citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("matched");
  });

  it("namesake — name/ticker tied to a different contract", () => {
    const r = {
      rawText: "Pepe (PEPE) here refers to the token at 0x1111111111111111111111111111111111111111.",
      citations: [],
    };
    expect(classifyIdentity(r, PEPE)).toBe("namesake");
  });

  it("namesake — name + ticker but only a different chain referenced", () => {
    const r = { rawText: "Pepe ($PEPE) is a token on Base.", citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("namesake");
  });

  it("ambiguous — name + ticker present but no chain/contract evidence", () => {
    const r = { rawText: "Pepe ($PEPE) is a token some people mention.", citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("ambiguous");
  });

  it("ambiguous — only the name appears, no qualified ticker or contract", () => {
    const r = { rawText: "Pepe is a well-known internet frog character.", citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("ambiguous");
  });

  it("absent — no contract, exact name, or qualified ticker", () => {
    const r = { rawText: "I could not find information about that token.", citations: [] };
    expect(classifyIdentity(r, PEPE)).toBe("absent");
  });
});

describe("extractAddresses", () => {
  it("pulls all 0x addresses lowercased", () => {
    expect(extractAddresses(`see ${PEPE.address}`)).toEqual([PEPE.address.toLowerCase()]);
  });
});

describe("deriveRepresentationState", () => {
  it("estimable when any engine reaches 30 matched", () => {
    expect(deriveRepresentationState([12, 31, 0])).toBe("estimable");
  });
  it("sparse when some matched but none reach 30", () => {
    expect(deriveRepresentationState([5, 10, 0])).toBe("sparse");
  });
  it("not_estimable when zero matched everywhere", () => {
    expect(deriveRepresentationState([0, 0, 0])).toBe("not_estimable");
  });
});
