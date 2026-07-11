import { describe, expect, it } from "vitest";
import {
  assertCompleteCoding,
  assertGapClassifications,
  assertPositioningReveal,
  computeRecurrenceMatrix,
  createBlindDiscoveryPacket,
  createSimulationEvidenceSnapshot,
  resolveUniqueExactQuote,
  lockCodebook,
  type CodingRecord,
  type FramingStudy,
  type GapClassification,
  type LockedCodebook,
  type PositioningReveal,
} from "./framing-evidence";

const study: FramingStudy = {
  studyId: "study-1",
  projectId: "project-1",
  projectLabel: "Example consumer brand",
  observedBrandName: "Example Brand",
  promptProtocolVersion: "representation-prompts.v4",
  createdAt: "2026-07-11T00:00:00.000Z",
  responses: [
    {
      responseId: "r-1",
      rawText: "Example Brand makes durable everyday shoes for casual wear.",
      lane: "neutral_elicited",
      promptVariant: "a1",
      promptText: "What is Example Brand?",
      providerId: "deepseek",
      modelVersion: "model-a",
      generationMode: "ungrounded",
      observedAt: "2026-07-11T00:01:00.000Z",
      terminalState: "ok",
    },
    {
      responseId: "r-2",
      rawText: "Example Brand is known for comfortable casual shoes.",
      lane: "neutral_elicited",
      promptVariant: "a2",
      promptText: "Describe Example Brand.",
      providerId: "deepseek",
      modelVersion: "model-a",
      generationMode: "ungrounded",
      observedAt: "2026-07-11T00:02:00.000Z",
      terminalState: "ok",
    },
    {
      responseId: "r-3",
      rawText: "I cannot tell which Example Brand you mean.",
      lane: "neutral_elicited",
      promptVariant: "a3",
      promptText: "Tell me about Example Brand.",
      providerId: "openai",
      modelVersion: "model-b",
      generationMode: "ungrounded",
      observedAt: "2026-07-11T00:03:00.000Z",
      terminalState: "entity_ambiguous",
    },
  ],
};

const codebook: LockedCodebook = lockCodebook({
  codebookId: "codebook-1",
  studyId: "study-1",
  discoveryPacketId: "packet-1",
  version: "v1",
  createdBy: "analyst-1",
  createdAt: "2026-07-11T00:10:00.000Z",
  lockedAt: "2026-07-11T00:20:00.000Z",
  associations: [
    { associationId: "casual-shoes", label: "Casual shoes", definition: "Frames the brand as casual footwear." },
    { associationId: "durability", label: "Durability", definition: "Frames the brand as durable." },
  ],
});

const reveal: PositioningReveal = {
  studyId: "study-1",
  codebookId: "codebook-1",
  codebookVersion: "v1",
  revealedAt: "2026-07-11T00:21:00.000Z",
  revealedBy: "analyst-1",
  positioningDigest: "positioning-sha",
  factSheetDigest: "fact-sheet-sha",
};

const coding: CodingRecord = {
  codingRunId: "coding-1",
  studyId: "study-1",
  codebookId: "codebook-1",
  codebookVersion: "v1",
  reviewerId: "analyst-1",
  reviewMethod: "single_analyst",
  createdAt: "2026-07-11T00:22:00.000Z",
  responseReviews: [
    { responseId: "r-1", outcome: "coded", reviewedBy: "analyst-1", reviewedAt: "2026-07-11T00:22:00.000Z" },
    { responseId: "r-2", outcome: "coded", reviewedBy: "analyst-1", reviewedAt: "2026-07-11T00:22:00.000Z" },
    { responseId: "r-3", outcome: "entity_ambiguous", reviewedBy: "analyst-1", reviewedAt: "2026-07-11T00:22:00.000Z" },
  ],
  annotations: [
    {
      annotationId: "a-1",
      responseId: "r-1",
      associationId: "casual-shoes",
      decision: "accepted",
      proposalSource: "ai_span_assist",
      start: 42,
      end: 54,
      reviewedBy: "analyst-1",
      reviewedAt: "2026-07-11T00:22:00.000Z",
      note: null,
    },
    {
      annotationId: "a-2",
      responseId: "r-2",
      associationId: "casual-shoes",
      decision: "accepted",
      proposalSource: "human_raw_read",
      start: 37,
      end: 49,
      reviewedBy: "analyst-1",
      reviewedAt: "2026-07-11T00:22:00.000Z",
      note: null,
    },
    {
      annotationId: "a-3",
      responseId: "r-1",
      associationId: "durability",
      decision: "accepted",
      proposalSource: "ai_span_assist",
      start: 20,
      end: 27,
      reviewedBy: "analyst-1",
      reviewedAt: "2026-07-11T00:22:00.000Z",
      note: null,
    },
  ],
  consistencyChecks: [
    {
      checkId: "check-intra",
      type: "intra_rater_consistency",
      status: "not_run",
      comparisonCount: 0,
      agreementCount: 0,
      completedAt: null,
      reviewerDescription: "Not run in this synthetic example.",
      note: "No consistency result is represented.",
    },
    {
      checkId: "check-machine",
      type: "machine_discrepancy_check",
      status: "not_run",
      comparisonCount: 0,
      agreementCount: 0,
      completedAt: null,
      reviewerDescription: "No machine comparison was run.",
      note: "A machine discrepancy check is not an independent coder.",
    },
    {
      checkId: "check-inter",
      type: "inter_rater_reliability",
      status: "not_run",
      comparisonCount: 0,
      agreementCount: 0,
      completedAt: null,
      reviewerDescription: "No second human reviewer was used.",
      note: "No inter-rater reliability is claimed.",
    },
  ],
};

describe("M34A framing evidence workflow (D-099)", () => {
  it("resolves only one literal quote occurrence and never falls back to fuzzy matching", () => {
    expect(resolveUniqueExactQuote("Alpha exact evidence omega", "exact evidence")).toEqual({
      start: 6,
      end: 20,
    });
    expect(() => resolveUniqueExactQuote("Alpha evidence", "alpha evidence")).toThrow(/literally/i);
    expect(() => resolveUniqueExactQuote("repeat and repeat", "repeat")).toThrow(/more than once/i);
  });
  it("builds a discovery packet that carries only blind text and a separate key", () => {
    const { packet, key } = createBlindDiscoveryPacket({
      study,
      responseIds: ["r-1", "r-3"],
      packetId: "packet-1",
      createdAt: "2026-07-11T00:05:00.000Z",
      shuffleSeed: "seed",
    });

    expect(packet.items).toHaveLength(2);
    expect(JSON.stringify(packet)).not.toContain("providerId");
    expect(JSON.stringify(packet)).not.toContain("promptVariant");
    expect(JSON.stringify(packet)).not.toContain("responseId");
    expect(key.entries.map((entry) => entry.responseId).sort()).toEqual(["r-1", "r-3"]);
  });

  it("locks a versioned codebook only after its creation timestamp", () => {
    expect(codebook.status).toBe("locked");
    expect(() => lockCodebook({ ...codebook, lockedAt: "2026-07-10T00:00:00.000Z" })).toThrow(/cannot precede/i);
    expect(() => lockCodebook({ ...codebook, associations: [...codebook.associations, codebook.associations[0]!] })).toThrow(/duplicate association/i);
  });

  it("requires positioning reveal after the codebook lock", () => {
    expect(() => assertPositioningReveal({ codebook, reveal: { ...reveal, revealedAt: "2026-07-11T00:19:00.000Z" } })).toThrow(/before the codebook is locked/i);
    expect(() => assertPositioningReveal({ codebook, reveal })).not.toThrow();
  });

  it("keeps entity ambiguity in the complete denominator", () => {
    assertCompleteCoding({ study, codebook, coding });
    const matrix = computeRecurrenceMatrix({ study, codebook, coding });
    const casual = matrix.find((row) => row.associationId === "casual-shoes")!;
    const durable = matrix.find((row) => row.associationId === "durability")!;
    expect(casual.responsesContainingAssociation).toBe(2);
    expect(casual.denominator).toBe(3);
    expect(casual.promptVariantsContainingAssociation).toEqual(["a1", "a2"]);
    expect(casual.promptVariantDenominator).toBe(3);
    expect(durable.responsesContainingAssociation).toBe(1);
    expect(durable.denominator).toBe(3);
    expect(casual.scopes).toEqual([
      { providerId: "deepseek", modelVersion: "model-a", generationMode: "ungrounded", responsesContainingAssociation: 2, denominator: 2 },
      { providerId: "openai", modelVersion: "model-b", generationMode: "ungrounded", responsesContainingAssociation: 0, denominator: 1 },
    ]);
  });

  it("keeps an uncheckpointed generation visible in the denominator without fabricating raw text", () => {
    const unavailableStudy = structuredClone(study);
    unavailableStudy.responses.push({
      responseId: "r-4",
      rawText: null,
      lane: "neutral_elicited",
      promptVariant: "a4",
      promptText: "Give an overview of Example Brand.",
      providerId: "deepseek",
      modelVersion: "unavailable-before-checkpoint",
      generationMode: "ungrounded",
      observedAt: "2026-07-11T00:04:00.000Z",
      terminalState: "generation_unavailable",
    });
    const unavailableCoding = structuredClone(coding);
    unavailableCoding.responseReviews.push({
      responseId: "r-4",
      outcome: "generation_unavailable",
      reviewedBy: "analyst-1",
      reviewedAt: "2026-07-11T00:22:00.000Z",
    });
    assertCompleteCoding({ study: unavailableStudy, codebook, coding: unavailableCoding });
    expect(computeRecurrenceMatrix({ study: unavailableStudy, codebook, coding: unavailableCoding })[0]!.denominator).toBe(4);
  });

  it("requires a response-review record for every response", () => {
    expect(() => assertCompleteCoding({ study, codebook, coding: { ...coding, responseReviews: coding.responseReviews.slice(0, 2) } })).toThrow(/every study response/i);
  });

  it("requires every accepted association to have an exact, non-blank source span", () => {
    const bad = structuredClone(coding);
    bad.annotations[0]!.end = 999;
    expect(() => assertCompleteCoding({ study, codebook, coding: bad })).toThrow(/exact in-bounds source span/i);
  });

  it("does not allow an accepted code to contradict the response review", () => {
    const bad = structuredClone(coding);
    bad.responseReviews[0]!.outcome = "no_relevant_association";
    expect(() => assertCompleteCoding({ study, codebook, coding: bad })).toThrow(/not marked coded/i);
  });

  it("keeps consistency-check methods separate and rejects a blended result", () => {
    const bad = structuredClone(coding);
    bad.consistencyChecks[0]!.status = "completed";
    bad.consistencyChecks[0]!.comparisonCount = 0;
    bad.consistencyChecks[0]!.completedAt = "2026-07-11T00:30:00.000Z";
    expect(() => assertCompleteCoding({ study, codebook, coding: bad })).toThrow(/needs comparisons/i);
  });

  it("allows a missing gap to name a post-reveal target without inventing an observed association", () => {
    const classifications: GapClassification[] = [
      {
        gapId: "g-1",
        kind: "missing",
        associationId: null,
        targetAssociation: "All-day walking comfort",
        rationale: "The intended positioning is not present in the reviewed evidence.",
        factSheetReferences: ["fact-1"],
        classifiedBy: "analyst-1",
        classifiedAt: "2026-07-11T00:23:00.000Z",
      },
    ];
    expect(() => assertGapClassifications({ codebook, reveal, classifications })).not.toThrow();
    expect(() => assertGapClassifications({ codebook, reveal, classifications: [{ ...classifications[0]!, targetAssociation: null }] })).toThrow(/requires targetAssociation/i);
  });

  it("creates a handoff snapshot with a visible low-recurrence label rather than an eligibility claim", () => {
    const snapshot = createSimulationEvidenceSnapshot({
      study,
      codebook,
      coding,
      reveal,
      responseId: "r-1",
      annotationId: "a-3",
    });
    expect(snapshot.evidence.text).toBe("durable");
    expect(snapshot.recurrence).toMatchObject({ numerator: 1, denominator: 3, label: "SINGLE OBSERVED INSTANCE" });
    expect(JSON.stringify(snapshot).toLowerCase()).not.toContain("eligible");
  });

  it("refuses a simulation handoff without an accepted reviewed annotation", () => {
    expect(() => createSimulationEvidenceSnapshot({
      study,
      codebook,
      coding,
      reveal,
      responseId: "r-1",
      annotationId: "missing",
    })).toThrow(/accepted reviewed annotation/i);
  });
});
