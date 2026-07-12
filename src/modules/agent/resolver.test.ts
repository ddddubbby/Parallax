import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AssetChain } from "@/core/crypto-resolver";
import {
  createFixtureMetadataReader,
  resolveTokenIdentity,
  type RawTokenMetadata,
} from "./resolver";

interface TokenFixtures {
  valid: Array<{ chain: AssetChain; address: string; metadata: RawTokenMetadata }>;
  adversarial: Array<{
    label: string;
    chain: AssetChain;
    address: string;
    metadata: RawTokenMetadata;
    expectedReason: string;
  }>;
}

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "mock-responses", "crypto", "tokens.json"), "utf8"),
) as TokenFixtures;

const reader = createFixtureMetadataReader([
  ...fixtures.valid,
  ...fixtures.adversarial.map((a) => ({ chain: a.chain, address: a.address, metadata: a.metadata })),
]);

describe("resolveTokenIdentity — valid tokens", () => {
  it.each(fixtures.valid.map((v) => [v.metadata.name, v] as const))(
    "resolves %s to a checksummed identity",
    async (_name, v) => {
      const result = await resolveTokenIdentity({ chain: v.chain, contractAddress: v.address }, reader);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.name).toBe(v.metadata.name);
        expect(result.symbol).toBe(v.metadata.symbol);
        // EIP-55 checksum: not all-lowercase for a mixed-case address.
        expect(result.address).toBe(v.address);
        expect(result.chainId).toBe(v.metadata.chainId);
      }
    },
  );

  it("resolves a lowercase input address to its checksummed form", async () => {
    const v = fixtures.valid[0];
    const result = await resolveTokenIdentity(
      { chain: v.chain, contractAddress: v.address.toLowerCase() },
      reader,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.address).toBe(v.address);
  });
});

describe("resolveTokenIdentity — adversarial fixtures are all rejected pre-budget", () => {
  it.each(fixtures.adversarial.map((a) => [a.label, a] as const))(
    "rejects: %s",
    async (_label, a) => {
      const result = await resolveTokenIdentity({ chain: a.chain, contractAddress: a.address }, reader);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(a.expectedReason);
    },
  );

  it("rejects a syntactically invalid address before reading", async () => {
    const result = await resolveTokenIdentity({ chain: "base", contractAddress: "0xnothex" }, reader);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_address");
  });

  it("maps a reader failure (unknown address) to metadata_read_failed", async () => {
    const result = await resolveTokenIdentity(
      { chain: "base", contractAddress: "0x" + "9".repeat(40) },
      reader,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("metadata_read_failed");
  });
});
