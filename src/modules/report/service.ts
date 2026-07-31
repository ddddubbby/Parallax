import {
  generateResonanceSection,
  generateSection,
  REPORT_SECTIONS,
  RESONANCE_REPORT_SECTIONS,
  type SectionKey,
  type ReportContext,
  type ResonanceReportContext,
  type ResonanceSectionKey,
} from "@/core/report-templates";
import { getCitedSources, getMisinformationRegister, getProjectBrandNames } from "@/db/repositories/dashboard";
import { getExportExtractions } from "@/db/repositories/export";
import { listFindings } from "@/db/repositories/findings";
import { listMetrics } from "@/db/repositories/metrics";
import {
  getMessageLiftPromptDisclosure,
  getRecommendationStudyResultSummary,
  getResonanceStudyResults,
} from "@/db/repositories/resonance";
import {
  ensureSection,
  getFindingEvidenceExcerpts,
  getReportSections,
  regenerateSection,
  saveEdit,
} from "@/db/repositories/report";
import { getRun, getRunFailureCounts, getRunMatrixKind } from "@/db/repositories/runner";

async function buildReportContext(runId: string): Promise<ReportContext | null> {
  const run = await getRun(runId);
  if (!run) return null;
  const kind = await getRunMatrixKind(runId);
  if (kind?.kind === "resonance") return null;

  const [metrics, findingRows, misinformation, citedSources, projectBrands, failureCounts] = await Promise.all([
    listMetrics(runId),
    listFindings(runId),
    getMisinformationRegister(runId),
    getCitedSources(runId),
    getProjectBrandNames(run.projectId),
    getRunFailureCounts(runId),
  ]);
  const evidenceExcerpts = await getFindingEvidenceExcerpts(runId, findingRows);

  const client = projectBrands.find((b) => b.role === "client");
  const competitors = projectBrands.filter((b) => b.role === "competitor");
  const sentimentEntries = metrics.filter((m) => m.scopeType === "overall" && m.metricKey.startsWith("sentiment_"));
  const sentiment = Object.fromEntries(sentimentEntries.map((m) => [m.metricKey.replace("sentiment_", ""), m.value]));

  // CS-3: resolve per-brand metric rows (scope_key = brand id) to names.
  const brandById = new Map(projectBrands.map((b) => [b.id, b]));
  const brandMetrics = metrics
    .filter((m) => m.scopeType === "brand" && brandById.has(m.scopeKey))
    .map((m) => {
      const b = brandById.get(m.scopeKey)!;
      return { brandName: b.name, isClient: b.role === "client", metricKey: m.metricKey, value: m.value, n: m.n };
    });

  return {
    clientBrandName: client?.name ?? "the client brand",
    competitorNames: competitors.map((c) => c.name),
    runMode: run.runMode,
    runDate: (run.completedAt ?? run.createdAt).toISOString().slice(0, 10),
    isMock: run.runMode === "mock",
    isPartial: failureCounts.deadLettered > 0 || failureCounts.cancelled > 0,
    repetitions: run.repetitions,
    plannedCalls: run.plannedCalls,
    costCapUsd: Number(run.costCapUsd),
    providers: (run.selectedProvidersJson as string[]) ?? [],
    modes: (run.selectedModesJson as string[]) ?? [],
    metrics: metrics.map((m) => ({ scopeType: m.scopeType, metricKey: m.metricKey, n: m.n, value: m.value, ciLow: m.ciLow, ciHigh: m.ciHigh })),
    findings: findingRows.map((f) => ({
      id: f.id,
      findingType: f.findingType,
      severity: f.severity,
      title: f.title,
      bodyMd: f.bodyMd,
      evidence: f.evidenceJson as Record<string, unknown>,
      directionalOnly: Boolean((f.evidenceJson as { directionalOnly?: boolean })?.directionalOnly),
    })),
    evidenceExcerpts,
    misinformation: misinformation.map((m) => ({
      claimText: m.claimText,
      verdict: m.operatorVerdict ?? m.extractedVerdict,
      severity: m.operatorSeverity ?? m.extractedSeverity,
      evidenceQuote: m.evidenceQuote,
      factStatement: m.factStatement,
    })),
    citedSources: citedSources.map((s) => ({ domain: s.domain, total: s.total })),
    sentiment,
    brandMetrics,
  };
}

async function buildResonanceReportContext(runId: string): Promise<ResonanceReportContext | null> {
  const run = await getRun(runId);
  if (!run) return null;
  const kind = await getRunMatrixKind(runId);
  if (kind?.kind !== "resonance" || !kind.resonanceStudyId) return null;

  if (kind.testType === "ai_recommendation") {
    const [results, disclosure] = await Promise.all([
      getRecommendationStudyResultSummary(run.projectId, kind.resonanceStudyId, runId),
      getMessageLiftPromptDisclosure(run.projectId, kind.resonanceStudyId),
    ]);
    if (!results) return null;
    return {
      testType: "ai_recommendation",
      studyName: results.study.name,
      runMode: run.runMode,
      runDate: (run.completedAt ?? run.createdAt).toISOString().slice(0, 10),
      isMock: run.runMode === "mock",
      genericUnconditioned: false,
      baselineProvenance: results.study.baselineProvenance,
      repetitions: run.repetitions,
      panelCount: results.study.scenarioCount,
      providers: results.providers,
      modes: ["ungrounded"],
      anchorSetVersion: "not applicable",
      anchorSetCalibrated: false,
      embeddingModel: "not used",
      providerSections: [],
      promptDisclosure: {
        protocolVersion: disclosure?.protocolVersion ?? null,
        matrixVersion: disclosure?.matrixVersion ?? null,
        parityVerified: disclosure?.parityVerified ?? false,
        currentMessage: disclosure?.currentMessage?.body ?? "not available",
        newMessage: disclosure?.newMessage?.body ?? "not available",
        representativePair: disclosure?.pairs[0]
          ? {
              contextLabel: disclosure.pairs[0].contextLabel,
              currentPrompt: disclosure.pairs[0].currentPrompt,
              newPrompt: disclosure.pairs[0].newPrompt,
            }
          : null,
      },
      recommendationProviderSections: results.providerGroups.flatMap((group) => {
        const current = group.conditions[0];
        const next = group.conditions[1];
        const lift = group.lifts[0];
        return current && next && lift
          ? [{
              providerId: group.providerId,
              current: {
                inclusionRate: current.inclusionRate,
                topPickRate: current.topPickRate,
                n: current.n,
              },
              next: {
                inclusionRate: next.inclusionRate,
                topPickRate: next.topPickRate,
                n: next.n,
              },
              lift: {
                shortlistLiftPp: lift.shortlistLiftPp,
                shortlistCiLow: lift.shortlistCiLow,
                shortlistCiHigh: lift.shortlistCiHigh,
                topPickLiftPp: lift.topPickLiftPp,
                scenarioCount: lift.scenarioCount,
                directionalOnly: lift.directionalOnly,
              },
            }]
          : [];
      }),
    };
  }

  const [results, extractionRows, disclosure] = await Promise.all([
    getResonanceStudyResults(run.projectId, kind.resonanceStudyId, runId),
    getExportExtractions(runId),
    getMessageLiftPromptDisclosure(run.projectId, kind.resonanceStudyId),
  ]);
  if (!results) return null;

  const embeddingModel =
    extractionRows.find((row) => {
      const payload = row.extractedJson as { kind?: string } | null;
      return payload?.kind === "ssr";
    })?.extractionModel ?? "not available";

  return {
    testType: "buyer_response",
    studyName: results.study.name,
    runMode: run.runMode,
    runDate: (run.completedAt ?? run.createdAt).toISOString().slice(0, 10),
    isMock: run.runMode === "mock",
    genericUnconditioned: results.study.genericUnconditioned,
    baselineProvenance: results.study.baselineProvenance,
    repetitions: run.repetitions,
    panelCount: results.study.panelCount,
    providers: (run.selectedProvidersJson as string[]) ?? [],
    modes: (run.selectedModesJson as string[]) ?? [],
    anchorSetVersion: results.study.anchorSetVersion,
    anchorSetCalibrated: results.study.anchorSetCalibrated,
    embeddingModel,
    promptDisclosure: {
      protocolVersion: disclosure?.protocolVersion ?? null,
      matrixVersion: disclosure?.matrixVersion ?? null,
      parityVerified: disclosure?.parityVerified ?? false,
      currentMessage: disclosure?.currentMessage?.body ?? "not available",
      newMessage: disclosure?.newMessage?.body ?? "not available",
      representativePair: disclosure?.pairs[0]
        ? {
            contextLabel: disclosure.pairs[0].contextLabel,
            currentPrompt: disclosure.pairs[0].currentPrompt,
            newPrompt: disclosure.pairs[0].newPrompt,
          }
        : null,
    },
    // D-080: one section per engine — never pool a provider's variants,
    // deltas, persona slices, or evidence with another provider's.
    providerSections: results.providerGroups.map((group) => ({
      providerId: group.providerId,
      variants: group.variants.map((variant) => ({
        stimulusId: variant.stimulusId,
        label: variant.label,
        stimulusKind: variant.stimulusKind,
        n: variant.n,
        piMean: variant.piMean,
        pmf: variant.pmf,
        sufficientN: variant.sufficientN,
      })),
      deltas: group.deltas.map((delta) => ({
        label: delta.label,
        baselineLabel: delta.baselineLabel,
        n: delta.n,
        deltaPiMean: delta.deltaPiMean,
        directionalOnly: delta.directionalOnly,
      })),
      personaRows: group.personaRows.map((row) => ({
        panelPersonaLabel: row.panelPersonaLabel,
        stimulusLabel: row.stimulusLabel,
        n: row.n,
        piMean: row.piMean,
        directionalOnly: row.directionalOnly,
      })),
      evidence: group.variants.flatMap((variant) =>
        variant.responses.slice(0, 4).map((response) => ({
          stimulusLabel: variant.label,
          responseId: response.responseId,
          panelPersonaLabel: response.panelPersonaLabel,
          meanScore: response.meanScore,
          rawText: response.rawText,
        })),
      ),
    })),
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

export async function generateResonanceReport(runId: string): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const ctx = await buildResonanceReportContext(runId);
  if (!ctx) return { ok: false, error: "Resonance run not found" };

  const existingSections = await getReportSections(runId);
  const existingKeys = new Set(existingSections.map((s) => s.sectionKey));

  let created = 0;
  for (const [i, section] of RESONANCE_REPORT_SECTIONS.entries()) {
    if (existingKeys.has(section.key)) continue;
    const md = generateResonanceSection(section.key, ctx);
    await ensureSection(runId, section.key, i, md);
    created++;
  }
  return { ok: true, created };
}

function isAuditSectionKey(key: string): key is SectionKey {
  return REPORT_SECTIONS.some((section) => section.key === key);
}

export function isKnownReportSectionKey(key: string) {
  return isAuditSectionKey(key) || isResonanceSectionKey(key);
}

/** RB-3: regenerate exactly one section from fresh data — siblings are never touched. */
export async function regenerateOneSection(runId: string, sectionId: string, sectionKey: string): Promise<string> {
  if (isResonanceSectionKey(sectionKey)) {
    const ctx = await buildResonanceReportContext(runId);
    if (!ctx) throw new Error("Resonance run not found");
    const md = generateResonanceSection(sectionKey, ctx);
    const updated = await regenerateSection(runId, sectionId, sectionKey, md);
    if (updated === 0) throw new Error("Report section not found for run");
    return md;
  }
  if (!isAuditSectionKey(sectionKey)) throw new Error("Unknown report section key");
  const ctx = await buildReportContext(runId);
  if (!ctx) throw new Error("Run not found");
  const md = generateSection(sectionKey, ctx);
  const updated = await regenerateSection(runId, sectionId, sectionKey, md);
  if (updated === 0) throw new Error("Report section not found for run");
  return md;
}

function isResonanceSectionKey(key: string): key is ResonanceSectionKey {
  return RESONANCE_REPORT_SECTIONS.some((section) => section.key === key);
}

export async function editSection(runId: string, sectionId: string, editedMd: string) {
  const updated = await saveEdit(runId, sectionId, editedMd);
  if (updated === 0) throw new Error("Report section not found for run");
}
