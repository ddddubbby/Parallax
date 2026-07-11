import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FramingReportModel } from "@/core/framing-report";

const mocks = vi.hoisted(() => ({ build: vi.fn(), reportError: vi.fn() }));
vi.mock("@/modules/framing/report", () => ({ buildFramingReport: mocks.build }));
vi.mock("@/observability", () => ({ reportError: mocks.reportError }));
import { GET } from "./route";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const STUDY_ID = "00000000-0000-4000-8000-000000000002";
const report: FramingReportModel = {
  reportVersion: "m34a-framing-report.v1", projectName: "LensLoop", studyId: STUDY_ID,
  sourceRunId: "00000000-0000-4000-8000-000000000003", sourceRunMode: "live_audit", sourceRepetitions: 1,
  completedDate: "2026-07-11", promptProtocolVersion: "representation-prompts.v4",
  promptWording: [{ variantKey: "a1", text: "What is LensLoop?" }],
  positioningText: "CLIENT-SUPPLIED POSITIONING — direct-to-share video.", positioningSource: "client-supplied",
  reviewerIdentity: "Analyst", reviewMethod: "single_analyst", reviewDisclosure: "Single analyst.",
  discoveryManifestDigest: "abc123", discoveryAttestation: "Attested before lock.",
  codebookLockedAt: "2026-07-11T01:00:00.000Z", revealedAt: "2026-07-11T02:00:00.000Z",
  codebook: [], gapOutcome: "no_actionable_gap_identified", reviewOutcomeCounts: { none: 5 },
  denominator: 5, availableResponses: 5, unavailableJobs: 0, recurrence: [], gaps: [], evidence: [], factSheetScope: "One fact.",
};

beforeEach(() => { vi.clearAllMocks(); mocks.build.mockResolvedValue(report); });

describe("framing Markdown export boundary", () => {
  it("rejects malformed ids before repository access", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "bad", studyId: STUDY_ID }) });
    expect(response.status).toBe(404);
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("exports only the ownership-scoped completed report", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: PROJECT_ID, studyId: STUDY_ID }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("framing-evidence");
    await expect(response.text()).resolves.toContain("What is LensLoop?");
    expect(mocks.build).toHaveBeenCalledWith(PROJECT_ID, STUDY_ID);
  });
  it("sanitizes unexpected failures", async () => {
    mocks.build.mockRejectedValueOnce(new Error("secret database detail"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: PROJECT_ID, studyId: STUDY_ID }) });
    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Export failed");
    expect(mocks.reportError).toHaveBeenCalled();
  });
});
