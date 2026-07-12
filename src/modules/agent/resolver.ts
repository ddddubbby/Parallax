// GEO agent identity resolution — orchestration (AGENT_PRD §3 steps 1–4),
// delegating the sanitization pipeline (steps 5–8) to the pure core module.
// The on-chain read sits behind an injectable `TokenMetadataReader` so the
// mock-first M36 path and the adversarial fixture set run fully offline; the
// live viem-backed reader lands with grounded engines (M38) / the gateway (M40).

import { getAddress, isAddress } from "viem";
import {
  CHAIN_IDS,
  sanitizeTokenMetadata,
  type AssetChain,
  type ResolverRejection,
} from "@/core/crypto-resolver";

/** Raw, still-hostile metadata as read from chain. Strings are undecoded display values. */
export interface RawTokenMetadata {
  /** The chain id the reader's RPC actually reports (verified against the requested chain). */
  chainId: number;
  /** Whether the address has deployed bytecode (EOA / empty ⇒ false). */
  hasBytecode: boolean;
  name: string;
  symbol: string;
  /** ERC-20 decimals, or null if the call reverted / is absent. */
  decimals: number | null;
}

export interface TokenMetadataReader {
  read(chain: AssetChain, checksumAddress: string): Promise<RawTokenMetadata>;
}

/** The fully resolved, sanitized token identity. Safe to hand to matrix building. */
export interface ResolvedIdentity {
  ok: true;
  /** EIP-55 checksummed address — the ONLY identity anchor (AGENT_PRD §2). */
  address: string;
  chain: AssetChain;
  chainId: number;
  name: string;
  symbol: string;
  decimals: number | null;
}

export type ResolveResult = ResolvedIdentity | ResolverRejection;

export interface ResolveInput {
  chain: AssetChain;
  contractAddress: string;
}

/**
 * Resolve a token's on-chain identity, or reject the job before any money
 * moves. Every non-ok result is a pre-budget ACP reject/refund reason — NEVER
 * an evidence finding (AGENT_PRD §3).
 */
export async function resolveTokenIdentity(
  input: ResolveInput,
  reader: TokenMetadataReader,
): Promise<ResolveResult> {
  // Step 1: normalize + checksum. The input schema already regex-validates the
  // address, but resolution is a security boundary and re-checks independently.
  if (!isAddress(input.contractAddress)) {
    return { ok: false, reason: "invalid_address", field: "address", detail: "not a valid EVM address" };
  }
  const address = getAddress(input.contractAddress);

  // Step 4 (read) — do it once; steps 2/3 validate its result. A thrown reader
  // (RPC failure, timeout, bad decode) is a metadata_read_failed rejection, not
  // an evidence finding.
  let raw: RawTokenMetadata;
  try {
    raw = await reader.read(input.chain, address);
  } catch (err) {
    return {
      ok: false,
      reason: "metadata_read_failed",
      field: "address",
      detail: err instanceof Error ? err.message : "metadata read failed",
    };
  }

  // Step 2: the RPC must actually be on the requested chain.
  if (raw.chainId !== CHAIN_IDS[input.chain]) {
    return {
      ok: false,
      reason: "chain_id_mismatch",
      field: "chain",
      detail: `RPC chain ${raw.chainId} ≠ expected ${CHAIN_IDS[input.chain]} for ${input.chain}`,
    };
  }

  // Step 3: non-empty bytecode (rejects EOAs and self-destructed contracts).
  if (!raw.hasBytecode) {
    return { ok: false, reason: "empty_bytecode", field: "bytecode", detail: "address has no deployed bytecode" };
  }

  // Steps 5–8: sanitize the hostile name/symbol.
  const sanitized = sanitizeTokenMetadata(raw.name, raw.symbol);
  if (!sanitized.ok) return sanitized;

  return {
    ok: true,
    address,
    chain: input.chain,
    chainId: raw.chainId,
    name: sanitized.name,
    symbol: sanitized.symbol,
    decimals: raw.decimals,
  };
}

/**
 * Offline reader seeded from fixtures, keyed by `chain:loweraddress`. Backs the
 * mock-first run path and the adversarial fixture suite. An unknown address
 * throws → surfaced as metadata_read_failed (mirrors a real RPC miss).
 */
export function createFixtureMetadataReader(
  fixtures: Array<{ chain: AssetChain; address: string; metadata: RawTokenMetadata }>,
): TokenMetadataReader {
  const table = new Map<string, RawTokenMetadata>();
  for (const f of fixtures) {
    table.set(`${f.chain}:${f.address.toLowerCase()}`, f.metadata);
  }
  return {
    async read(chain, checksumAddress) {
      const hit = table.get(`${chain}:${checksumAddress.toLowerCase()}`);
      if (!hit) throw new Error(`no fixture metadata for ${chain}:${checksumAddress}`);
      return hit;
    },
  };
}
