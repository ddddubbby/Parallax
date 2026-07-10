import { describe, expect, it } from "vitest";
import {
  assertLockedConceptMap,
  assertManifestMatch,
  assertOrganicPin,
  completeLinkClusters,
  createBlindReviewPacket,
  createRunManifest,
  evaluateNeutralProfile,
  immutableManifestHash,
  resolveExactEvidenceOffset,
  verifyV3Frames,
  type LockedConceptMap,
  type V3ExtractionRecord,
} from "../../scripts/framing-feasibility/v3-core";
import { V3_ADMISSION_PROMPTS } from "../../scripts/framing-feasibility/v3-protocol";

function record(input: Partial<V3ExtractionRecord> & { responseId: string }): V3ExtractionRecord {
  return {
    responseId: input.responseId,
    projectKey: input.projectKey ?? "dev",
    brandName: input.brandName ?? "Example",
    lane: input.lane ?? "neutral_elicited",
    providerId: input.providerId ?? "deepseek",
    generationMode: input.generationMode ?? "ungrounded",
    sourceRunId: input.sourceRunId ?? null,
    standardExtractionVersion: input.standardExtractionVersion ?? null,
    variantKey: input.variantKey ?? null,
    cellId: input.cellId ?? null,
    repIndex: input.repIndex ?? null,
    terminalState: input.terminalState ?? "ok",
    frames: input.frames ?? [],
    unsupportedFrameCount: input.unsupportedFrameCount ?? 0,
    rawTextHash: input.rawTextHash ?? "raw",
    extractorInputHash: input.extractorInputHash ?? "input",
    generationManifestHash: input.generationManifestHash ?? "generation",
    extractionManifestHash: input.extractionManifestHash ?? "extraction",
    model: input.model ?? "fixture",
    costUsd: input.costUsd ?? 0,
  };
}

describe("v3 evidence offsets", () => {
  it("accepts only an exact contiguous source substring", () => {
    const raw = "The brand makes foam clogs and colorful casual footwear.";
    expect(resolveExactEvidenceOffset(raw, "makes foam clogs")).toEqual({ start: 10, end: 26 });
    expect(resolveExactEvidenceOffset(raw, "makes foam…colorful")).toBeNull();
    expect(resolveExactEvidenceOffset(raw, "Makes foam clogs")).toBeNull();
  });

  it("rejects unsupported frames individually and keeps the response denominator", () => {
    const raw = "The brand makes foam clogs for everyday wear.";
    const result = verifyV3Frames(raw, "ok", [
      {
        concept_label: "foam clog",
        frame_dimension: "offering",
        frame_kind: "identity",
        stance: "stated",
        evidence_quote: "makes foam clogs for everyday wear",
      },
      {
        concept_label: "comfort",
        frame_dimension: "attribute",
        frame_kind: "association",
        stance: "implied",
        evidence_quote: "comfort not actually present",
      },
    ]);
    expect(result.state).toBe("ok");
    expect(result.frames).toHaveLength(1);
    expect(result.unsupportedFrameCount).toBe(1);
  });
});

describe("v3 immutable manifests", () => {
  const base = createRunManifest({
    stage: "development",
    projectKey: "insta360",
    brandName: "Insta360",
    providerId: "deepseek",
    generationMode: "ungrounded",
    modelRequested: "deepseek-v4-flash",
    decoding: { temperature: 0.7 },
    promptProtocolVersion: "representation-prompts.v3",
    promptArm: "without_uncertainty_clause",
    prompts: [{ variantKey: "a1", text: "What is Insta360?" }],
    repetitions: 5,
    sourceRunId: null,
    standardExtractionVersion: null,
    protocolVersion: "framing-protocol.v3",
    createdAt: "2026-07-11T00:00:00.000Z",
  });

  it("ignores creation time but rejects any protocol identity change on resume", () => {
    const hash = immutableManifestHash(base);
    expect(() => assertManifestMatch(hash, { ...base, createdAt: "later" })).not.toThrow();
    expect(() =>
      assertManifestMatch(hash, { ...base, repetitions: 4 }),
    ).toThrow(/start a new run/);
  });
});

describe("v3 complete-link clustering", () => {
  it("does not chain-merge labels whose endpoints fall below threshold", () => {
    const clusters = completeLinkClusters(
      [
        { label: "a", vector: [1, 0] },
        { label: "b", vector: [0.8, 0.6] },
        { label: "c", vector: [0.28, 0.96] },
      ],
      0.75,
    );
    expect(clusters.some((cluster) => cluster.length === 3)).toBe(false);
    expect(clusters.flat().sort()).toEqual(["a", "b", "c"]);
  });
});

describe("v3 blinded review and profile eligibility", () => {
  const variants = V3_ADMISSION_PROMPTS.map((prompt) => prompt.variantKey);
  const records = variants.flatMap((variantKey) =>
    Array.from({ length: 5 }, (_, index) =>
      record({
        responseId: `${variantKey}-r${index + 1}`,
        variantKey,
        repIndex: index + 1,
        terminalState: index === 4 ? "no_frame" : "ok",
        frames:
          index === 4
            ? []
            : [
                {
                  conceptLabel: "foam clog",
                  dimension: index % 2 === 0 ? "category" : "offering",
                  kind: "identity",
                  stance: "stated",
                  evidenceQuote: "The company makes distinctive foam clog footwear.",
                  evidenceStart: 0,
                  evidenceEnd: 49,
                },
                {
                  conceptLabel: "casual comfort",
                  dimension: "attribute",
                  kind: "association",
                  stance: "stated",
                  evidenceQuote: "The footwear is associated with casual comfort.",
                  evidenceStart: 50,
                  evidenceEnd: 99,
                },
              ],
      }),
    ),
  );
  const packet = createBlindReviewPacket(records, "manifest");
  const map: LockedConceptMap = {
    reviewVersion: "blind-review.v1",
    packetHash: packet.packetHash,
    lockedAt: "2026-07-11T00:00:00.000Z",
    reviewer: "human-reviewer",
    mappings: packet.items.map((item) => ({
      labelId: item.labelId,
      conceptId: item.label === "foam clog" ? "foam-clog" : "casual-comfort",
      action: "accept",
    })),
  };

  it("keeps counts, variants and outcomes out of the review packet", () => {
    const serialized = JSON.stringify(packet);
    expect(serialized).not.toContain("variantKey");
    expect(serialized).not.toContain("responseId");
    expect(serialized).not.toContain("eligib");
    expect(serialized).not.toContain("providerId");
  });

  it("allows several independently stable concepts and counts no-frame responses", () => {
    const result = evaluateNeutralProfile({ records, packet, conceptMap: map });
    expect(result.status).toBe("eligible");
    expect(result.identityConcepts).toEqual(["foam-clog"]);
    expect(result.associationConcepts).toEqual(["casual-comfort"]);
    expect(result.stableConcepts.every((concept) => concept.variantWins === 6)).toBe(true);
    expect(result.medoidResponseId).toBe("a1-r1");
  });

  it("fails closed if the reviewer mapping is incomplete or unlocked", () => {
    expect(() =>
      assertLockedConceptMap(packet, { ...map, reviewer: "", mappings: map.mappings.slice(1) }),
    ).toThrow();
  });
});

describe("v3 organic pinning", () => {
  it("requires one declared run and extraction version", () => {
    expect(() =>
      assertOrganicPin([
        record({ responseId: "1", lane: "organic_in_context", sourceRunId: "run", standardExtractionVersion: 2 }),
        record({ responseId: "2", lane: "organic_in_context", sourceRunId: "run", standardExtractionVersion: 2 }),
      ]),
    ).not.toThrow();
    expect(() =>
      assertOrganicPin([
        record({ responseId: "1", lane: "organic_in_context", sourceRunId: "run-a", standardExtractionVersion: 2 }),
        record({ responseId: "2", lane: "organic_in_context", sourceRunId: "run-b", standardExtractionVersion: 2 }),
      ]),
    ).toThrow(/one source run/);
  });
});
