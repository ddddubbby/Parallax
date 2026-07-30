import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getRunMatrixKind: vi.fn(),
  recomputeMetrics: vi.fn(),
  getResonanceStudyExportLabel: vi.fn(),
  getMessageLiftPromptDisclosure: vi.fn(),
  getExportCitations: vi.fn(),
  getExportExtractions: vi.fn(),
  getExportMetrics: vi.fn(),
  getExportResponses: vi.fn(),
}));

vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
  getRunMatrixKind: mocks.getRunMatrixKind,
}));

vi.mock("@/db/repositories/export", () => ({
  getExportCitations: mocks.getExportCitations,
  getExportExtractions: mocks.getExportExtractions,
  getExportMetrics: mocks.getExportMetrics,
  getExportResponses: mocks.getExportResponses,
}));
vi.mock("@/db/repositories/metrics", () => ({
  recomputeMetrics: mocks.recomputeMetrics,
}));

vi.mock("@/db/repositories/resonance", () => ({
  getResonanceStudyExportLabel: mocks.getResonanceStudyExportLabel,
  getMessageLiftPromptDisclosure: mocks.getMessageLiftPromptDisclosure,
}));

import { GET } from "./route";

describe("GET report evidence JSON", () => {
  const projectId = "00000000-0000-4000-8000-000000000000";
  const runId = "11111111-1111-4111-8111-111111111111";
  const studyId = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getMessageLiftPromptDisclosure.mockResolvedValue(null);
  });

  it("rejects malformed project ids before UUID-backed DB queries", async () => {
    const request = new NextRequest(
      `http://localhost/projects/not-a-uuid/report/export/json?runId=${runId}`,
    );
    const res = await GET(request, { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid project id" });
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("rejects malformed runId before UUID-backed DB queries", async () => {
    const request = new NextRequest(
      `http://localhost/projects/${projectId}/report/export/json?runId=not-a-uuid`,
    );
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "invalid runId" });
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("labels generic resonance evidence exports in machine-readable metadata", async () => {
    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "resonance", resonanceStudyId: studyId });
    mocks.recomputeMetrics.mockResolvedValueOnce(4);
    mocks.getResonanceStudyExportLabel.mockResolvedValueOnce({
      id: studyId,
      name: "Generic study",
      genericUnconditioned: true,
    });
    mocks.getExportResponses.mockResolvedValueOnce([]);
    mocks.getExportExtractions.mockResolvedValueOnce([]);
    mocks.getExportMetrics.mockResolvedValueOnce([]);
    mocks.getExportCitations.mockResolvedValueOnce([]);

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/json?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(200);
    expect(mocks.recomputeMetrics).toHaveBeenCalledWith(runId);
    await expect(res.json()).resolves.toMatchObject({
      kind: "resonance",
      resonance: {
        studyId,
        studyName: "Generic study",
        genericUnconditioned: true,
        label: "SIMULATED GENERIC",
      },
    });
  });

  it("rejects non-completed runs before evidence export", async () => {
    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "running" });

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/json?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "run must be completed before export" });
    expect(mocks.getRunMatrixKind).not.toHaveBeenCalled();
    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.getExportResponses).not.toHaveBeenCalled();
  });

  it("returns a sanitized 500 when generation throws unexpectedly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getRun.mockResolvedValueOnce({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "audit" });
    mocks.recomputeMetrics.mockResolvedValueOnce(1);
    mocks.getExportResponses.mockRejectedValueOnce(new Error("db down: secret-detail"));

    const request = new NextRequest(`http://localhost/projects/${projectId}/report/export/json?runId=${runId}`);
    const res = await GET(request, { params: Promise.resolve({ id: projectId }) });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "export failed" });
    expect(JSON.stringify(body)).not.toContain("secret-detail");
    errorSpy.mockRestore();
  });
});
