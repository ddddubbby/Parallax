import {
  findGroundedUngroundedSplit,
  findLostShortlistCells,
  findLowStabilityClusters,
  findMisinformationFlag,
  findPositioningGaps,
  findSourceConcentration,
  type Finding,
} from "@/core/findings";
import { generateSection, REPORT_SECTIONS, type ReportContext } from "@/core/report-templates";
import { isSufficientN } from "@/core/metrics";
import { getCitedSources, getMisinformationRegister, getProjectBrandNames } from "@/db/repositories/dashboard";
import { getCellBrandPresence, listFindings, saveFindings } from "@/db/repositories/findings";
import { listMetrics } from "@/db/repositories/metrics";
import { ensureSection, getReportSections, regenerateSection, saveEdit } from "@/db/repositories/report";
import { getRun, getRunFailureCounts } from "@/db/repositories/runner";

/** RB-1: compute every finding type and persist (disposable, C-5 — same pattern as metrics recompute). */
export async function computeFindings(runId: string): Promise<number> {
  const [metrics, cellPresence] = await Promise.all([listMetrics(runId), getCellBrandPresence(runId)]);

  const attributeRows = metrics.filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("attribute_"));
  const stabilityByCell = metrics.filter((m) => m.scopeType === "cell" && m.metricKey === "stability_index");
  const groundedRow = metrics.find((m) => m.scopeType === "mode" && m.scopeKey === "grounded" && m.metricKey === "mention_rate");
  const ungroundedRow = metrics.find((m) => m.scopeType === "mode" && m.scopeKey === "ungrounded" && m.metricKey === "mention_rate");

  const run = await getRun(runId);
  const misinformation = run ? await getMisinformationRegister(runId) : [];
  const citedSources = run ? await getCitedSources(runId) : [];

  const computed: Finding[] = [
    ...findLostShortlistCells(cellPresence),
    ...(attributeRows.length > 0 && isSufficientN(attributeRows[0].n)
      ? findPositioningGaps(attributeRows.map((r) => ({ attribute: r.metricKey.replace("attribute_", ""), rate: r.value, n: r.n })))
      : []),
    ...findMisinformationFlag({
      highSeverityCount: misinformation.filter((m) => (m.operatorSeverity ?? m.extractedSeverity) === "high").length,
      mediumSeverityCount: misinformation.filter((m) => (m.operatorSeverity ?? m.extractedSeverity) === "medium").length,
      totalCount: misinformation.length,
    }),
    ...(groundedRow && ungroundedRow && isSufficientN(groundedRow.n) && isSufficientN(ungroundedRow.n)
      ? findGroundedUngroundedSplit([
          { mode: "grounded", rate: groundedRow.value, n: groundedRow.n },
          { mode: "ungrounded", rate: ungroundedRow.value, n: ungroundedRow.n },
        ])
      : []),
    ...findSourceConcentration(citedSources.map((s) => ({ domain: s.domain, citationCount: s.total }))),
    ...findLowStabilityClusters(
      stabilityByCell.map((r) => {
        const [cellId] = r.scopeKey.split("|");
        const cell = cellPresence.find((c) => c.cellId === cellId);
        return { cellId, intent: cell?.intent ?? "unknown", stabilityIndex: r.value, n: r.n };
      }),
    ),
  ];

  return saveFindings(runId, computed);
}

async function buildReportContext(runId: string): Promise<ReportContext | null> {
  const run = await getRun(runId);
  if (!run) return null;

  const [metrics, findingRows, misinformation, citedSources, projectBrands, failureCounts] = await Promise.all([
    listMetrics(runId),
    listFindings(runId),
    getMisinformationRegister(runId),
    getCitedSources(runId),
    getProjectBrandNames(run.projectId),
    getRunFailureCounts(runId),
  ]);

  const client = projectBrands.find((b) => b.role === "client");
  const competitors = projectBrands.filter((b) => b.role === "competitor");
  const sentimentEntries = metrics.filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("sentiment_"));
  const sentiment = Object.fromEntries(sentimentEntries.map((m) => [m.metricKey.replace("sentiment_", ""), m.value]));

  return {
    clientBrandName: client?.name ?? "the client brand",
    competitorNames: competitors.map((c) => c.name),
    runMode: run.runMode,
    isMock: run.runMode === "mock",
    isPartial: failureCounts.deadLettered > 0 || failureCounts.cancelled > 0,
    repetitions: run.repetitions,
    providers: (run.selectedProvidersJson as string[]) ?? [],
    modes: (run.selectedModesJson as string[]) ?? [],
    metrics: metrics.map((m) => ({ scopeType: m.scopeType, metricKey: m.metricKey, n: m.n, value: m.value, ciLow: m.ciLow, ciHigh: m.ciHigh })),
    findings: findingRows.map((f) => ({
      findingType: f.findingType,
      severity: f.severity,
      title: f.title,
      bodyMd: f.bodyMd,
      evidence: f.evidenceJson as Record<string, unknown>,
      directionalOnly: Boolean((f.evidenceJson as { directionalOnly?: boolean })?.directionalOnly),
    })),
    misinformation: misinformation.map((m) => ({
      claimText: m.claimText,
      verdict: m.operatorVerdict ?? m.extractedVerdict,
      severity: m.operatorSeverity ?? m.extractedSeverity,
      evidenceQuote: m.evidenceQuote,
      factStatement: m.factStatement,
    })),
    citedSources: citedSources.map((s) => ({ domain: s.domain, total: s.total })),
    sentiment,
  };
}

/** Creates the nine RB-4 sections if they don't already exist — never overwrites an existing (possibly edited) section. */
export async function generateReport(runId: string): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await buildReportContext(runId);
  if (!ctx) return { ok: false, error: "Run not found" };

  const existingSections = await getReportSections(runId);
  const existingKeys = new Set(existingSections.map((s) => s.sectionKey));

  let created = 0;
  for (const [i, section] of REPORT_SECTIONS.entries()) {
    if (existingKeys.has(section.key)) continue;
    const md = generateSection(section.key, ctx);
    await ensureSection(runId, section.key, i, md);
    created++;
  }
  return { ok: true, created };
}

/** RB-3: regenerate exactly one section from fresh data — siblings are never touched. */
export async function regenerateOneSection(runId: string, sectionId: string, sectionKey: string) {
  const ctx = await buildReportContext(runId);
  if (!ctx) throw new Error("Run not found");
  const md = generateSection(sectionKey as Parameters<typeof generateSection>[0], ctx);
  await regenerateSection(sectionId, md);
}

export async function editSection(sectionId: string, editedMd: string) {
  await saveEdit(sectionId, editedMd);
}
