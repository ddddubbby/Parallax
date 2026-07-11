import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ build: vi.fn(), reportError: vi.fn() }));
vi.mock("@/modules/framing/report", () => ({ buildFramingReport: mocks.build }));
vi.mock("@/observability", () => ({ reportError: mocks.reportError }));
import { GET } from "./route";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const STUDY_ID = "00000000-0000-4000-8000-000000000002";

beforeEach(() => { vi.clearAllMocks(); mocks.build.mockResolvedValue({ reportVersion: "m34a-framing-report.v1", studyId: STUDY_ID, evidence: [{ quote: "literal span" }] }); });

describe("framing JSON evidence export boundary", () => {
  it("returns not found when the ownership-scoped report is unavailable", async () => {
    mocks.build.mockResolvedValueOnce(null);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: PROJECT_ID, studyId: STUDY_ID }) });
    expect(response.status).toBe(404);
  });
  it("exports machine-readable evidence with a download name", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: PROJECT_ID, studyId: STUDY_ID }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("framing-evidence");
    await expect(response.json()).resolves.toMatchObject({ evidence: [{ quote: "literal span" }] });
  });
  it("sanitizes unexpected failures", async () => {
    mocks.build.mockRejectedValueOnce(new Error("secret database detail"));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: PROJECT_ID, studyId: STUDY_ID }) });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "export failed" });
    expect(mocks.reportError).toHaveBeenCalled();
  });
});
