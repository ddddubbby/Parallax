import { describe, expect, it } from "vitest";
import { findRedactions, redactForPublication, shannonEntropy } from "./agent-redaction";

describe("redact_v1 — credential/secret patterns", () => {
  it("redacts a 0x private-key-shaped 64-hex", () => {
    const key = "0x" + "a1b2c3d4".repeat(8);
    const spans = findRedactions(`leaked: ${key} in a paste`);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ category: "credential_secret", rule: "hex_private_key" });
  });

  it("does NOT redact a 40-hex contract address", () => {
    expect(findRedactions("token at 0x6982508145454Ce325dDbE47a25d4ec3d2311933 on Ethereum")).toEqual([]);
  });

  it("redacts common API key formats", () => {
    for (const key of [
      "sk-abcDEF123456789012345",
      "AKIAIOSFODNN7EXAMPLE",
      "ghp_abcdefghij1234567890KLMNOP",
      "xoxb-1234567890-abcdef",
      "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    ]) {
      const spans = findRedactions(`credential ${key} found`);
      expect(spans.length, key).toBe(1);
      expect(spans[0].rule).toBe("api_key_format");
    }
  });

  it("redacts a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9P";
    expect(findRedactions(`token: ${jwt}`)[0]?.rule).toBe("jwt");
  });

  it("redacts a mnemonic-shaped word sequence but never ordinary prose", () => {
    const mnemonic = "abandon ability able about above absent absorb abstract absurd abuse access accident";
    expect(findRedactions(mnemonic)[0]?.rule).toBe("seed_phrase");
    const prose = "the token gained attention because many holders believed the project would deliver value over time";
    expect(findRedactions(prose)).toEqual([]);
  });

  it("high-entropy rule requires actual entropy", () => {
    expect(shannonEntropy("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeLessThan(1);
    expect(findRedactions("padding aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa end")).toEqual([]);
  });
});

describe("redact_v1 — personal-data patterns", () => {
  it("redacts emails, phones, and SSN-shaped numbers", () => {
    const spans = findRedactions("contact dev@scam.example or +1 415 555 0100, SSN 123-45-6789");
    expect(spans.map((s) => s.rule).sort()).toEqual(["email", "government_id", "phone"]);
    expect(spans.every((s) => s.category === "personal_data")).toBe(true);
  });

  it("does not redact dates or version numbers", () => {
    expect(findRedactions("released 2026-07-13, version 1.0.24, block 8453")).toEqual([]);
  });
});

describe("redactForPublication", () => {
  it("masks spans, keeps original offsets + source hash in the record", () => {
    const text = "email dev@scam.example now";
    const result = redactForPublication(text);
    expect(result.text).toBe("email [REDACTED:personal_data] now");
    expect(result.redactions).toHaveLength(1);
    const r = result.redactions[0];
    expect(text.slice(r.start, r.end)).toBe("dev@scam.example");
    expect(r.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.policy).toBe("redact_v1");
  });

  it("is a no-op on clean text", () => {
    const result = redactForPublication("Pepe is a meme token on Ethereum.");
    expect(result.redactions).toEqual([]);
    expect(result.text).toBe("Pepe is a meme token on Ethereum.");
  });
});
