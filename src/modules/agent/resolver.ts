// GEO agent identity resolution — orchestration (AGENT_PRD §3 steps 1–4),
// delegating the sanitization pipeline (steps 5–8) to the pure core module.
// The on-chain read sits behind an injectable `TokenMetadataReader` so the
// mock-first M36 path and the adversarial fixture set run fully offline; the
// live viem-backed reader lands with grounded engines (M38) / the gateway (M40).

import { createPublicClient, getAddress, hexToString, http, isAddress, type Address } from "viem";
import { base, mainnet } from "viem/chains";
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

// --- Live RPC reader (M38). Env-gated on operator-managed RPC URLs. ---

const ERC20_STRING_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
const ERC20_BYTES32_ABI = [
  { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
] as const;

/**
 * Decode an ERC-20 name/symbol that may be returned as a `bytes32` (pre-standard
 * tokens like MKR) instead of a `string`. Pure so the fallback is unit-testable
 * without a live node. Trims trailing NULs; returns "" for empty/all-zero.
 */
export function decodeErc20String(raw: string): string {
  // bytes32 values are right-padded with NUL; strip trailing NUL + whitespace.
  return raw.replace(/[\u0000\s]+$/u, "");
}

export interface RpcMetadataReaderConfig {
  /** Managed RPC URLs (never rate-limited public endpoints, §5.1). */
  rpcUrls: Partial<Record<AssetChain, string>>;
  timeoutMs?: number;
}

/**
 * viem-backed reader: chain id, bytecode presence, and name/symbol/decimals with
 * a bytes32 fallback and a bounded per-call timeout. Requires a configured RPC
 * URL for the requested chain (operator-managed); absent config throws, surfaced
 * upstream as metadata_read_failed. The sanitization pipeline still treats every
 * returned value as hostile (AGENT_PRD §3).
 */
export function createRpcMetadataReader(config: RpcMetadataReaderConfig): TokenMetadataReader {
  const timeout = config.timeoutMs ?? 5000;
  const viemChain: Record<AssetChain, typeof base | typeof mainnet> = { base, ethereum: mainnet };

  return {
    async read(chain, checksumAddress): Promise<RawTokenMetadata> {
      const url = config.rpcUrls[chain];
      if (!url) throw new Error(`no RPC URL configured for ${chain}`);
      const client = createPublicClient({ chain: viemChain[chain], transport: http(url, { timeout }) });
      const address = checksumAddress as Address;

      const chainId = await client.getChainId();
      const code = await client.getBytecode({ address });
      const hasBytecode = Boolean(code && code !== "0x");

      const readString = async (fn: "name" | "symbol"): Promise<string> => {
        try {
          return (await client.readContract({ address, abi: ERC20_STRING_ABI, functionName: fn })) as string;
        } catch {
          const bytes = (await client.readContract({ address, abi: ERC20_BYTES32_ABI, functionName: fn })) as `0x${string}`;
          return decodeErc20String(hexToString(bytes));
        }
      };

      let name = "";
      let symbol = "";
      let decimals: number | null = null;
      try { name = await readString("name"); } catch { name = ""; }
      try { symbol = await readString("symbol"); } catch { symbol = ""; }
      try {
        decimals = Number(await client.readContract({ address, abi: ERC20_STRING_ABI, functionName: "decimals" }));
      } catch {
        decimals = null;
      }

      return { chainId, hasBytecode, name, symbol, decimals };
    },
  };
}
