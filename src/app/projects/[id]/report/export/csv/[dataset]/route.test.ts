import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getRunMatrixKind: vi.fn(),
  recomputeMetrics: vi.fn(),
  getResonanceStudyExportLabel: vi.fn(),
  getExportMetrics: vi.fn(),
  getExportResponses: vi.fn(),
  getExportExtractions: vi.fn(),
  getExportBrandMetrics: vi.fn(),
  getExportCitations: vi.fn(),
}));

vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
  getRunMatrixKind: mocks.getRunMatrixKind,
}));

vi.mock("@/db/repositories/export", () => ({
  getExportBrandMetrics: mocks.getExportBrandMetrics,
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
}));

import { GET } from "./route";

function request(dataset = "metrics") {
  return new NextRequest(`http://localhost/projects/${PROJECT_ID}/report/export/csv/${dataset}?runId=${RUN_ID}`);
}

describe("GET report CSV export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects audit CSV datasets for resonance runs", async () => {
    mocks.getRun.mockResolvedValueOnce({ id: RUN_ID, projectId: PROJECT_ID, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "resonance" });

    const res = await GET(request(), {
      params: Promise.resolve({ id: PROJECT_ID, dataset: "brand_metrics" }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "unknown dataset" });
    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.getExportBrandMetrics).not.toHaveBeenCalled();
  });

  it("rejects resonance CSV datasets for audit runs", async () => {
    mocks.getRun.mockResolvedValueOnce({ id: RUN_ID, projectId: PROJECT_ID, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "audit" });

    const res = await GET(request(), {
      params: Promise.resolve({ id: PROJECT_ID, dataset: "resonance_metrics" }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "unknown dataset" });
    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.getExportMetrics).not.toHaveBeenCalled();
  });

  it("labels generic resonance CSV rows with self-describing simulation metadata", async () => {
    const studyId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValueOnce({ id: RUN_ID, projectId: PROJECT_ID, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "resonance", resonanceStudyId: studyId });
    mocks.recomputeMetrics.mockResolvedValueOnce(5);
    mocks.getResonanceStudyExportLabel.mockResolvedValueOnce({
      id: studyId,
      name: "Generic lower funnel",
      genericUnconditioned: true,
    });
    mocks.getExportMetrics.mockResolvedValueOnce([
      {
        scopeType: "resonance_variant",
        scopeKey: "stimulus-1",
        metricKey: "pi_mean",
        n: 10,
        value: 3.2,
        ciLow: null,
        ciHigh: null,
        metadataJson: { sufficientN: false },
        computedAt: new Date("2026-07-06T00:00:00.000Z"),
      },
    ]);

    const res = await GET(request("resonance_metrics"), {
      params: Promise.resolve({ id: PROJECT_ID, dataset: "resonance_metrics" }),
    });

    expect(res.status).toBe(200);
    expect(mocks.recomputeMetrics).toHaveBeenCalledWith(RUN_ID);
    const csv = await res.text();
    expect(csv.split("\r\n")[0]).toContain("simulationLabel,genericUnconditioned,studyId,studyName");
    expect(csv).toContain("SIMULATED GENERIC,true");
    expect(csv).toContain(studyId);
    expect(csv).toContain("Generic lower funnel");
  });

  it("returns a sanitized 500 when generation throws unexpectedly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getRun.mockResolvedValueOnce({ id: RUN_ID, projectId: PROJECT_ID, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValueOnce({ kind: "audit" });
    mocks.recomputeMetrics.mockResolvedValueOnce(1);
    mocks.getExportMetrics.mockRejectedValueOnce(new Error("db down: secret-connection-string"));

    const res = await GET(request("metrics"), {
      params: Promise.resolve({ id: PROJECT_ID, dataset: "metrics" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "export failed" });
    // The internal detail never reaches the client payload.
    expect(JSON.stringify(body)).not.toContain("secret-connection-string");
    errorSpy.mockRestore();
  });

  it("rejects non-completed runs before CSV export", async () => {
    mocks.getRun.mockResolvedValueOnce({ id: RUN_ID, projectId: PROJECT_ID, state: "running" });

    const res = await GET(request("metrics"), {
      params: Promise.resolve({ id: PROJECT_ID, dataset: "metrics" }),
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: "run must be completed before export" });
    expect(mocks.getRunMatrixKind).not.toHaveBeenCalled();
    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.getExportMetrics).not.toHaveBeenCalled();
  });
});
