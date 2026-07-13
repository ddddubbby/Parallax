// Buyer input contract (AGENT_PRD §2 / C-17). The hostile front door: every
// buyer-submitted requirement is schema-validated (strict — extra fields
// reject), size-capped, and reduced to a canonical hash so replays and
// conflicts are mechanical decisions. NO free text, names, URLs, or fact
// assertions are accepted; the contract address is the only identity anchor.
// Zod is the application-side source of truth; the published ACP JSON Schema
// is generated from it (AGENT_PRD R7) — REQUIREMENT_JSON_SCHEMA below is that
// artifact, kept in lockstep by a parity test.

import { z } from "zod";
import { canonicalJsonStringify, canonicalSha256 } from "./canonical-json";
import type { DiscoveryCategory } from "./crypto-prompts";

export const REQUIREMENT_SCHEMA_VERSION = "1.0";
export const TERMS_VERSION = "resonance-geo-terms-1.0";
/** Build plan §2: payloads over 2 KB reject before budget. */
export const REQUIREMENT_MAX_BYTES = 2048;

export const DISCOVERY_CATEGORIES = [
  "meme_token",
  "ai_agent",
  "defi",
  "gaming",
  "rwa",
  "general_crypto",
] as const;

const CONTRACT_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** The six fields — nothing else (strict ⇒ additionalProperties: false). */
export const agentRequirementSchema = z
  .object({
    schema_version: z.literal(REQUIREMENT_SCHEMA_VERSION),
    asset_chain: z.enum(["base", "ethereum"]),
    contract_address: z.string().regex(CONTRACT_ADDRESS_RE, "not a 0x-prefixed 40-hex address"),
    discovery_category: z.enum(DISCOVERY_CATEGORIES),
    terms_version: z.literal(TERMS_VERSION),
    accept_terms: z.literal(true),
  })
  .strict();

export type AgentRequirement = z.infer<typeof agentRequirementSchema>;

/** The published ACP JSON Schema — generated from the Zod source (R7); parity-tested. */
export const REQUIREMENT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "asset_chain",
    "contract_address",
    "discovery_category",
    "terms_version",
    "accept_terms",
  ],
  properties: {
    schema_version: { const: REQUIREMENT_SCHEMA_VERSION },
    asset_chain: { enum: ["base", "ethereum"] },
    contract_address: { type: "string", pattern: CONTRACT_ADDRESS_RE.source },
    discovery_category: { enum: [...DISCOVERY_CATEGORIES] },
    terms_version: { const: TERMS_VERSION },
    accept_terms: { const: true },
  },
} as const;

export type RequirementRejectionReason =
  | "string_payload"
  | "not_an_object"
  | "payload_too_large"
  | "schema_violation";

export interface RequirementRejection {
  ok: false;
  reason: RequirementRejectionReason;
  detail: string;
}

export interface ParsedRequirement {
  ok: true;
  requirement: AgentRequirement;
  /** Canonical identity of the payload — replay/conflict decisions compare this. */
  canonicalHash: string;
  discoveryCategory: DiscoveryCategory;
}

export type RequirementParseResult = ParsedRequirement | RequirementRejection;

/**
 * Validate one buyer requirement payload (pre-budget). Order matters: shape
 * gates (string / non-object / size) run before field validation so a hostile
 * payload never reaches deeper parsing.
 */
export function parseAgentRequirement(raw: unknown): RequirementParseResult {
  if (typeof raw === "string") {
    return { ok: false, reason: "string_payload", detail: "requirement must be a JSON object, not a string" };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "not_an_object", detail: "requirement must be a JSON object" };
  }
  const bytes = Buffer.byteLength(canonicalJsonStringify(raw), "utf8");
  if (bytes > REQUIREMENT_MAX_BYTES) {
    return {
      ok: false,
      reason: "payload_too_large",
      detail: `requirement is ${bytes} bytes; max ${REQUIREMENT_MAX_BYTES}`,
    };
  }
  const parsed = agentRequirementSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      reason: "schema_violation",
      detail: `${first.path.join(".") || "(root)"}: ${first.message}`,
    };
  }
  return {
    ok: true,
    requirement: parsed.data,
    canonicalHash: canonicalSha256(parsed.data),
    discoveryCategory: parsed.data.discovery_category,
  };
}

export type RequirementReplayDecision = "first" | "ignore_replay" | "conflict_reject";

/**
 * Build plan §2 requirement handling: the first valid requirement is stored
 * canonically; an identical replay is ignored; a CONFLICTING second requirement
 * rejects the job.
 */
export function requirementReplayDecision(
  storedCanonicalHash: string | null,
  incomingCanonicalHash: string,
): RequirementReplayDecision {
  if (storedCanonicalHash === null) return "first";
  return storedCanonicalHash === incomingCanonicalHash ? "ignore_replay" : "conflict_reject";
}
