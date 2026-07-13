import { describe, expect, it } from "vitest";
import { ADVICE_PROSE_V1, RISK_V1, containsAnyLexiconTerm } from "./agent-lexicons";
import { parseAgentRequirement } from "./agent-input";
import { buildOfferingManifest, OFFERING_NAME, ZERO_ADDRESS } from "./agent-manifest";

describe("offering manifest (§2)", () => {
  const sealed = buildOfferingManifest();

  it("is deterministic — same inputs, same digest", () => {
    expect(buildOfferingManifest().digest).toBe(sealed.digest);
    expect(sealed.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("carries the locked commerce facts exactly", () => {
    expect(sealed.manifest.name).toBe(OFFERING_NAME);
    expect(sealed.manifest.price_micro_usdc).toBe("99000000");
    expect(sealed.manifest.sla_minutes).toBe(90);
    expect(sealed.manifest.settlement_chain_id).toBe(8453);
    expect(sealed.manifest.hook_address).toBe(ZERO_ADDRESS);
    expect(sealed.manifest.evaluator_address).toBe(ZERO_ADDRESS);
    expect(sealed.manifest.required_funds).toBe(false);
  });

  it("description (OUR prose) passes C-16: no advice term, no risk term planted", () => {
    expect(containsAnyLexiconTerm(sealed.manifest.description, ADVICE_PROSE_V1)).toBe(false);
    expect(containsAnyLexiconTerm(sealed.manifest.description, RISK_V1)).toBe(false);
  });

  it("the example requirement validates against the published schema's Zod source", () => {
    const parsed = parseAgentRequirement(sealed.manifest.example_requirement);
    expect(parsed.ok).toBe(true);
  });

  it("every section digest is present and content-sensitive", () => {
    expect(Object.keys(sealed.manifest.section_digests).sort()).toEqual([
      "deliverable_schema",
      "description",
      "model_catalog",
      "requirement_schema",
    ]);
    const other = buildOfferingManifest("https://different.example/terms");
    expect(other.digest).not.toBe(sealed.digest); // terms_url is part of the whole
    expect(other.manifest.section_digests).toEqual(sealed.manifest.section_digests); // sections unchanged
  });
});
