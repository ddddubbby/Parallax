// Immutable offering manifest (AGENT_BUILD_PLAN §2). Checked-in source of
// truth the registry record is verified against every startup + every 2 min —
// drift in price/SLA/description/schema/visibility/evaluator/required-funds
// disables admissions. Changes NEVER mutate in place: a new hidden offering
// version supersedes. Description prose is OURS and C-16-governed
// (forbidden-phrase tested); the requirement schema embeds the R7-generated
// JSON Schema from core/agent-input.

import { AGENT_PRICE_MICRO_USDC } from "./agent-admission";
import { REQUIREMENT_JSON_SCHEMA, TERMS_VERSION } from "./agent-input";
import {
  ADVICE_PROSE_V1_VERSION,
  DESCRIPTOR_V1_VERSION,
  PROMPT_CONTROL_V1_VERSION,
  REFUSAL_V1_VERSION,
  RISK_V1_VERSION,
} from "./agent-lexicons";
import { METHODOLOGY_VERSION } from "./agent-report";
import { CRYPTO_GEO_PROMPTS_VERSION } from "./crypto-prompts";
import { canonicalSha256 } from "./canonical-json";

export const OFFERING_NAME = "resonance_geo_v1";
export const OFFERING_SLA_MINUTES = 90;
export const SETTLEMENT_CHAIN_ID = 8453; // Base mainnet only (§1)
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// OUR authored prose (C-16-governed — the forbidden-phrase suite runs over it).
const DESCRIPTION =
  "Descriptive AI-perception audit of a crypto token. Three AI engines with live web search answer 20 fixed questions about the token, five times each; we count what appears in the answers using fixed word lists and literal matching, and deliver an immutable report with exact quotes and per-engine figures. We never judge legitimacy, safety, or worth, verify no project claims, and provide no financial guidance of any kind. Requires skip-evaluation (zero-address evaluator): the job auto-completes when the report is submitted. The only input is a contract address plus a category selection.";

/** Model catalog — PROVISIONAL until the M38 capability contract pins them (register A5/A6). */
const MODEL_CATALOG = {
  openai: { model: "gpt-5.5", status: "provisional_until_m38_spike" },
  google: { model: "gemini-2.5-flash", status: "provisional_until_m38_spike" },
  xai: { model: "grok-4.3", status: "provisional_until_m38_spike" },
} as const;

const DELIVERABLE_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["type", "value"],
  properties: {
    type: { const: "object" },
    value: {
      type: "object",
      additionalProperties: false,
      required: [
        "schema",
        "report_url",
        "report_sha256",
        "representation_state",
        "methodology_version",
        "prompt_matrix_version",
        "terms_version",
      ],
      properties: {
        schema: { const: "resonance-geo-deliverable-1.0" },
        report_url: { type: "string" },
        report_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
        representation_state: { enum: ["estimable", "sparse", "not_estimable"] },
        methodology_version: { const: METHODOLOGY_VERSION },
        prompt_matrix_version: { const: CRYPTO_GEO_PROMPTS_VERSION },
        terms_version: { const: TERMS_VERSION },
      },
    },
  },
} as const;

const EXAMPLE_REQUIREMENT = {
  schema_version: "1.0",
  asset_chain: "base",
  contract_address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  discovery_category: "ai_agent",
  terms_version: TERMS_VERSION,
  accept_terms: true,
} as const;

export interface OfferingManifest {
  name: typeof OFFERING_NAME;
  description: string;
  price_micro_usdc: string; // bigint as string for JSON stability
  sla_minutes: number;
  settlement_chain_id: number;
  hook_address: typeof ZERO_ADDRESS;
  evaluator_address: typeof ZERO_ADDRESS;
  required_funds: false;
  requirement_schema: typeof REQUIREMENT_JSON_SCHEMA;
  deliverable_schema: typeof DELIVERABLE_JSON_SCHEMA;
  example_requirement: typeof EXAMPLE_REQUIREMENT;
  terms_version: string;
  terms_url: string;
  methodology_version: string;
  prompt_matrix_version: string;
  lexicon_versions: Record<string, string>;
  model_catalog: typeof MODEL_CATALOG;
  section_digests: Record<string, string>;
}

export interface SealedManifest {
  manifest: OfferingManifest;
  /** SHA-256 over the whole canonical manifest — the registry-drift comparator. */
  digest: string;
}

export function buildOfferingManifest(termsUrl = "https://resonance.example/terms"): SealedManifest {
  const sections = {
    description: DESCRIPTION,
    requirement_schema: REQUIREMENT_JSON_SCHEMA,
    deliverable_schema: DELIVERABLE_JSON_SCHEMA,
    model_catalog: MODEL_CATALOG,
  };
  const manifest: OfferingManifest = {
    name: OFFERING_NAME,
    description: DESCRIPTION,
    price_micro_usdc: AGENT_PRICE_MICRO_USDC.toString(),
    sla_minutes: OFFERING_SLA_MINUTES,
    settlement_chain_id: SETTLEMENT_CHAIN_ID,
    hook_address: ZERO_ADDRESS,
    evaluator_address: ZERO_ADDRESS,
    required_funds: false,
    requirement_schema: REQUIREMENT_JSON_SCHEMA,
    deliverable_schema: DELIVERABLE_JSON_SCHEMA,
    example_requirement: EXAMPLE_REQUIREMENT,
    terms_version: TERMS_VERSION,
    terms_url: termsUrl,
    methodology_version: METHODOLOGY_VERSION,
    prompt_matrix_version: CRYPTO_GEO_PROMPTS_VERSION,
    lexicon_versions: {
      risk: RISK_V1_VERSION,
      descriptor: DESCRIPTOR_V1_VERSION,
      prompt_control: PROMPT_CONTROL_V1_VERSION,
      advice_prose: ADVICE_PROSE_V1_VERSION,
      refusal: REFUSAL_V1_VERSION,
    },
    model_catalog: MODEL_CATALOG,
    section_digests: Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, canonicalSha256(v)]),
    ),
  };
  return { manifest, digest: canonicalSha256(manifest) };
}
