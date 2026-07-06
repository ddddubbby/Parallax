import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getRunMatrixKind: vi.fn(),
  getReportSections: vi.fn(),
  getReportFreshness: vi.fn(),
  getResonanceStudyExportLabel: vi.fn(),
}));

vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
  getRunMatrixKind: mocks.getRunMatrixKind,
}));

vi.mock("@/db/repositories/report", () => ({
  getReportSections: mocks.getReportSections,
  getReportFreshness: mocks.getReportFreshness,
}));

vi.mock("@/db/repositories/resonance", () => ({
  getResonanceStudyExportLabel: mocks.getResonanceStudyExportLabel,
}));

import { GET } from "./route";

describe("GET report markdown export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReportFreshness.mockResolvedValue({
      latestMetricComputedAt: null,
      oldestSectionUpdatedAt: null,
      stale: false,
    });
  });

  it("labels generic resonance markdown exports even before sections are generated", async () => {
    const projectId = "00000000-0000-4000-8000-000000000000";
    const runId = "11111111-1111-4111-8111-111111111111";
    const studyId = "22222222-2222-4222-8222-222222222222";

    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "resonance", resonanceStudyId: studyId });
    mocks.getResonanceStudyExportLabel.mockResolvedValueOnce({
      id: studyId,
      name: "Generic study",
      genericUnconditioned: true,
    });
    mocks.getReportSections.mockResolvedValueOnce([]);

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/markdown?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("# Resonance Simulation Report — SIMULATED GENERIC");
  });

  it("marks markdown exports when persisted sections are older than recomputed metrics", async () => {
    const projectId = "00000000-0000-4000-8000-000000000000";
    const runId = "11111111-1111-4111-8111-111111111111";

    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "audit" });
    mocks.getReportFreshness.mockResolvedValueOnce({
      latestMetricComputedAt: new Date("2026-07-06T02:00:00.000Z"),
      oldestSectionUpdatedAt: new Date("2026-07-06T01:00:00.000Z"),
      stale: true,
    });
    mocks.getReportSections.mockResolvedValueOnce([
      {
        id: "33333333-3333-4333-8333-333333333333",
        sectionKey: "executive_summary",
        position: 0,
        generatedMd: "Existing summary",
        editedMd: null,
        state: "generated",
      },
    ]);

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/markdown?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Stale report warning");
    expect(body).toContain("Existing summary");
  });

  it("rejects non-completed runs before report export", async () => {
    const projectId = "00000000-0000-4000-8000-000000000000";
    const runId = "11111111-1111-4111-8111-111111111111";
    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "running" });

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/markdown?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "run must be completed before export" });
    expect(mocks.getRunMatrixKind).not.toHaveBeenCalled();
  });
});
