import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRun: vi.fn(),
  getRunMatrixKind: vi.fn(),
  recomputeMetrics: vi.fn(),
  getReportSections: vi.fn(),
  computeFindings: vi.fn(),
  editSection: vi.fn(),
  generateReport: vi.fn(),
  generateResonanceReport: vi.fn(),
  isKnownReportSectionKey: vi.fn(),
  regenerateOneSection: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/repositories/runner", () => ({
  getRun: mocks.getRun,
  getRunMatrixKind: mocks.getRunMatrixKind,
}));
vi.mock("@/db/repositories/metrics", () => ({
  recomputeMetrics: mocks.recomputeMetrics,
}));
vi.mock("@/db/repositories/report", () => ({
  getReportSections: mocks.getReportSections,
}));
vi.mock("./service", () => ({
  computeFindings: mocks.computeFindings,
  editSection: mocks.editSection,
  generateReport: mocks.generateReport,
  generateResonanceReport: mocks.generateResonanceReport,
  isKnownReportSectionKey: mocks.isKnownReportSectionKey,
  regenerateOneSection: mocks.regenerateOneSection,
}));

import { fetchReportSections, generateReportForRun, regenerateSectionAction, saveSectionEdit } from "./actions";

describe("report action id guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isKnownReportSectionKey.mockReturnValue(true);
  });

  it("rejects malformed project/run/section ids before DB-backed repositories", async () => {
    await expect(generateReportForRun("project-id", "not-a-uuid")).resolves.toEqual({
      ok: false,
      error: "Invalid project or run id",
    });
    await expect(saveSectionEdit("project-id", "not-a-uuid", "also-not-a-uuid", "text")).resolves.toEqual({
      ok: false,
      error: "Invalid project, run, or section id",
    });
    await expect(regenerateSectionAction("project-id", "not-a-uuid", "also-not-a-uuid", "executive_summary")).resolves.toEqual({
      ok: false,
      error: "Invalid project, run, or section id",
    });
    await expect(fetchReportSections("project-id", "not-a-uuid")).resolves.toEqual([]);
    expect(mocks.getRun).not.toHaveBeenCalled();
  });

  it("rejects non-completed runs before report mutation or reads", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValue({ id: runId, projectId, state: "running" });

    await expect(generateReportForRun(projectId, runId)).resolves.toEqual({
      ok: false,
      error: "Run must be completed before generating a report",
    });
    await expect(saveSectionEdit(projectId, runId, sectionId, "text")).resolves.toEqual({
      ok: false,
      error: "Run must be completed before editing a report",
    });
    await expect(regenerateSectionAction(projectId, runId, sectionId, "executive_summary")).resolves.toEqual({
      ok: false,
      error: "Run must be completed before regenerating a report",
    });
    await expect(fetchReportSections(projectId, runId)).resolves.toEqual([]);

    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.editSection).not.toHaveBeenCalled();
    expect(mocks.regenerateOneSection).not.toHaveBeenCalled();
    expect(mocks.getReportSections).not.toHaveBeenCalled();
  });

  it("rejects unknown section keys before recomputing metrics or findings", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.isKnownReportSectionKey.mockReturnValue(false);

    await expect(regenerateSectionAction(projectId, runId, sectionId, "not_a_section")).resolves.toEqual({
      ok: false,
      error: "Unknown report section key",
    });

    expect(mocks.getRun).not.toHaveBeenCalled();
    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.regenerateOneSection).not.toHaveBeenCalled();
  });

  it("recomputes metrics before generating audit or resonance reports", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const auditRunId = "00000000-0000-4000-8000-000000000002";
    const resonanceRunId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockImplementation((runId: string) => Promise.resolve({ id: runId, projectId, state: "completed" }));
    mocks.getRunMatrixKind
      .mockResolvedValueOnce({ kind: "audit" })
      .mockResolvedValueOnce({ kind: "resonance" });
    mocks.recomputeMetrics.mockResolvedValue(12);
    mocks.generateReport.mockResolvedValue({ ok: true, created: 9 });
    mocks.generateResonanceReport.mockResolvedValue({ ok: true, created: 3 });

    await expect(generateReportForRun(projectId, auditRunId)).resolves.toEqual({ ok: true });
    await expect(generateReportForRun(projectId, resonanceRunId)).resolves.toEqual({ ok: true });

    expect(mocks.recomputeMetrics).toHaveBeenNthCalledWith(1, auditRunId);
    expect(mocks.computeFindings).toHaveBeenCalledWith(auditRunId);
    expect(mocks.generateReport).toHaveBeenCalledWith(auditRunId);
    expect(mocks.recomputeMetrics).toHaveBeenNthCalledWith(2, resonanceRunId);
    expect(mocks.generateResonanceReport).toHaveBeenCalledWith(resonanceRunId);
    expect(mocks.computeFindings).not.toHaveBeenCalledWith(resonanceRunId);
  });

  it("refreshes metrics and audit findings before regenerating an audit section", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValue({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "audit" });
    mocks.recomputeMetrics.mockResolvedValue(12);
    mocks.regenerateOneSection.mockResolvedValue("fresh markdown");

    await expect(regenerateSectionAction(projectId, runId, sectionId, "visibility")).resolves.toEqual({
      ok: true,
      generatedMd: "fresh markdown",
    });

    expect(mocks.recomputeMetrics).toHaveBeenCalledWith(runId);
    expect(mocks.computeFindings).toHaveBeenCalledWith(runId);
    expect(mocks.regenerateOneSection).toHaveBeenCalledWith(runId, sectionId, "visibility");
  });

  it("does not compute audit findings before regenerating a resonance section", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValue({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "resonance" });
    mocks.recomputeMetrics.mockResolvedValue(5);
    mocks.regenerateOneSection.mockResolvedValue("fresh resonance markdown");

    await expect(regenerateSectionAction(projectId, runId, sectionId, "resonance_results")).resolves.toEqual({
      ok: true,
      generatedMd: "fresh resonance markdown",
    });

    expect(mocks.recomputeMetrics).toHaveBeenCalledWith(runId);
    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.regenerateOneSection).toHaveBeenCalledWith(runId, sectionId, "resonance_results");
  });

  it("rejects resonance section regeneration for an audit run before recomputing metrics", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValue({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "audit" });

    await expect(regenerateSectionAction(projectId, runId, sectionId, "resonance_results")).resolves.toEqual({
      ok: false,
      error: "Report section does not belong to this run type",
    });

    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.regenerateOneSection).not.toHaveBeenCalled();
  });

  it("rejects audit section regeneration for a resonance run before recomputing metrics", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const runId = "00000000-0000-4000-8000-000000000002";
    const sectionId = "00000000-0000-4000-8000-000000000003";
    mocks.getRun.mockResolvedValue({ id: runId, projectId, state: "completed" });
    mocks.getRunMatrixKind.mockResolvedValue({ kind: "resonance" });

    await expect(regenerateSectionAction(projectId, runId, sectionId, "visibility")).resolves.toEqual({
      ok: false,
      error: "Report section does not belong to this run type",
    });

    expect(mocks.recomputeMetrics).not.toHaveBeenCalled();
    expect(mocks.computeFindings).not.toHaveBeenCalled();
    expect(mocks.regenerateOneSection).not.toHaveBeenCalled();
  });
});
