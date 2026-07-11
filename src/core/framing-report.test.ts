import { describe, expect, it } from "vitest";
import { renderFramingReportMarkdown, type FramingReportModel } from "./framing-report";

const report: FramingReportModel = {
  reportVersion: "m34a-framing-report.v1",
  projectName: "LensLoop",
  studyId: "study-1",
  completedDate: "2026-07-11",
  promptProtocolVersion: "representation-prompts.v4",
  promptWording: [{ variantKey: "a1", text: "What is LensLoop?" }],
  positioningText: "CLIENT-SUPPLIED POSITIONING — direct-to-share video.",
  positioningSource: "client-supplied",
  reviewerIdentity: "Analyst",
  reviewMethod: "single_analyst",
  reviewDisclosure: "One analyst completed full-sample coding; no second-human reliability result is claimed.",
  denominator: 6,
  availableResponses: 5,
  unavailableJobs: 1,
  recurrence: [{
    associationId: "durability",
    associationLabel: "Durability",
    responsesContainingAssociation: 2,
    denominator: 6,
    promptVariantsContainingAssociation: ["a1", "a2"],
    promptVariantDenominator: 5,
    scopes: [{ providerId: "mock", modelVersion: "v1", generationMode: "ungrounded", responsesContainingAssociation: 2, denominator: 5 }],
    reviewStatus: "human-reviewed",
  }],
  gaps: [{ classification: "missing", subject: "Direct-to-share video", rationale: "Not observed.", factStatements: ["Verified fact"] }],
  evidence: [{ associationLabel: "Durability", quote: "durable camera", variantKey: "a1", providerId: "mock", modelVersion: "v1", generationMode: "ungrounded" }],
  factSheetScope: "1 active fact snapshotted at reveal.",
};

describe("M34A standalone framing report", () => {
  it("renders prompt wording, n/N, source disclosure, and literal evidence", () => {
    const markdown = renderFramingReportMarkdown(report);
    expect(markdown).toContain("2/6");
    expect(markdown).toContain("What is LensLoop?");
    expect(markdown).toContain("client-supplied");
    expect(markdown).toContain("durable camera");
    expect(markdown).toContain("do not estimate a wider population");
  });

  it("does not introduce certification or bias-free vocabulary", () => {
    const markdown = renderFramingReportMarkdown(report).toLowerCase();
    for (const forbidden of ["bias-free", "unbiased", "vanilla ai", "certified framing", "statistically stable", "confidence interval", "eligibility", "stability index"] ) {
      expect(markdown).not.toContain(forbidden);
    }
  });
});
