import { describe, expect, it } from "vitest";
import {
  ENVELOPE_MAX_BYTES,
  buildDeliverableEnvelope,
  generateCapabilityToken,
  verifyCapabilityToken,
  type DeliverableEnvelopeInput,
} from "./agent-envelope";

const INPUT: DeliverableEnvelopeInput = {
  reportUrl: "https://resonance.example/api/agent-report/" + "a".repeat(64),
  reportSha256: "b".repeat(64),
  representationState: "sparse",
  methodologyVersion: "resonance-geo-methodology-1.0",
  promptMatrixVersion: "crypto_geo_prompts_v1",
  termsVersion: "resonance-geo-terms-1.0",
};

describe("buildDeliverableEnvelope", () => {
  it("produces a canonical, deterministic, under-2KB envelope with type/value retained", () => {
    const a = buildDeliverableEnvelope(INPUT);
    const b = buildDeliverableEnvelope({ ...INPUT });
    expect(a.canonical).toBe(b.canonical);
    expect(a.sha256).toBe(b.sha256);
    expect(a.bytes).toBeLessThanOrEqual(ENVELOPE_MAX_BYTES);
    expect(a.envelope.type).toBe("object");
    expect(a.envelope.value.report_sha256).toBe(INPUT.reportSha256);
    expect(a.envelope.value.representation_state).toBe("sparse");
    // Round-trips as JSON (what the SDK string field carries).
    expect(JSON.parse(a.canonical)).toEqual(JSON.parse(JSON.stringify(a.envelope)));
  });

  it("throws rather than submitting an oversized envelope", () => {
    expect(() =>
      buildDeliverableEnvelope({ ...INPUT, reportUrl: "https://x.example/" + "u".repeat(3000) }),
    ).toThrow(/2048/);
  });
});

describe("capability tokens", () => {
  it("verifies only the exact 256-bit token, storing just its hash", () => {
    const { token, capabilityHash } = generateCapabilityToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(capabilityHash).toMatch(/^[0-9a-f]{64}$/);
    expect(capabilityHash).not.toBe(token);
    expect(verifyCapabilityToken(token, capabilityHash)).toBe(true);
    expect(verifyCapabilityToken("f".repeat(64), capabilityHash)).toBe(false);
    expect(verifyCapabilityToken("not-hex", capabilityHash)).toBe(false);
    expect(verifyCapabilityToken(token.slice(0, 63), capabilityHash)).toBe(false);
  });

  it("generates unique tokens", () => {
    expect(generateCapabilityToken().token).not.toBe(generateCapabilityToken().token);
  });
});
