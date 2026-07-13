import { describe, expect, it } from "vitest";
import {
  REQUIREMENT_JSON_SCHEMA,
  REQUIREMENT_MAX_BYTES,
  agentRequirementSchema,
  parseAgentRequirement,
  requirementReplayDecision,
} from "./agent-input";

const VALID = {
  schema_version: "1.0",
  asset_chain: "base",
  contract_address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
  discovery_category: "ai_agent",
  terms_version: "resonance-geo-terms-1.0",
  accept_terms: true,
};

describe("parseAgentRequirement (C-17 front door)", () => {
  it("accepts a valid requirement and produces a stable canonical hash", () => {
    const a = parseAgentRequirement(VALID);
    // Same content, different key order → same hash.
    const b = parseAgentRequirement({ ...VALID, accept_terms: true });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.canonicalHash).toBe(b.canonicalHash);
      expect(a.discoveryCategory).toBe("ai_agent");
    }
  });

  it.each([
    ["string_payload", JSON.stringify(VALID)],
    ["not_an_object", null],
    ["not_an_object", [VALID]],
    ["not_an_object", 42],
  ])("rejects %s", (reason, raw) => {
    const result = parseAgentRequirement(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("rejects an oversized payload before field validation", () => {
    const result = parseAgentRequirement({ ...VALID, extra: "x".repeat(REQUIREMENT_MAX_BYTES) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payload_too_large");
  });

  it.each([
    ["extra field", { ...VALID, project_name: "Shill Corp" }],
    ["wrong schema_version", { ...VALID, schema_version: "2.0" }],
    ["bad address", { ...VALID, contract_address: "0x123" }],
    ["unknown chain", { ...VALID, asset_chain: "solana" }],
    ["unknown category", { ...VALID, discovery_category: "gambling" }],
    ["wrong terms version", { ...VALID, terms_version: "resonance-geo-terms-0.9" }],
    ["terms not accepted", { ...VALID, accept_terms: false }],
    ["missing field", (({ accept_terms: _a, ...rest }) => rest)(VALID)],
  ])("rejects schema violation: %s", (_label, raw) => {
    const result = parseAgentRequirement(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("schema_violation");
  });

  it("never accepts buyer-supplied names/urls/facts (no such fields exist)", () => {
    for (const field of ["name", "website", "description", "fact_sheet", "competitors", "aliases"]) {
      const result = parseAgentRequirement({ ...VALID, [field]: "anything" });
      expect(result.ok, field).toBe(false);
    }
  });
});

describe("requirementReplayDecision (build plan §2)", () => {
  it("first valid requirement is stored; identical replay ignored; conflict rejects", () => {
    expect(requirementReplayDecision(null, "h1")).toBe("first");
    expect(requirementReplayDecision("h1", "h1")).toBe("ignore_replay");
    expect(requirementReplayDecision("h1", "h2")).toBe("conflict_reject");
  });
});

describe("REQUIREMENT_JSON_SCHEMA parity with the Zod source (R7)", () => {
  it("required list and additionalProperties match strict Zod behavior", () => {
    expect(REQUIREMENT_JSON_SCHEMA.additionalProperties).toBe(false);
    expect([...REQUIREMENT_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(agentRequirementSchema.shape).sort(),
    );
  });

  it("enums/consts match: every JSON-Schema-legal probe passes Zod, every illegal probe fails", () => {
    for (const chain of REQUIREMENT_JSON_SCHEMA.properties.asset_chain.enum) {
      expect(agentRequirementSchema.safeParse({ ...VALID, asset_chain: chain }).success).toBe(true);
    }
    for (const cat of REQUIREMENT_JSON_SCHEMA.properties.discovery_category.enum) {
      expect(agentRequirementSchema.safeParse({ ...VALID, discovery_category: cat }).success).toBe(true);
    }
    expect(
      agentRequirementSchema.safeParse({
        ...VALID,
        schema_version: REQUIREMENT_JSON_SCHEMA.properties.schema_version.const,
        terms_version: REQUIREMENT_JSON_SCHEMA.properties.terms_version.const,
        accept_terms: REQUIREMENT_JSON_SCHEMA.properties.accept_terms.const,
      }).success,
    ).toBe(true);
  });
});
