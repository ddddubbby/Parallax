import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import {
  compileBuyerResponsePrompt,
  compileRecommendationPrompt,
  historicalBaselineProvenance,
  MESSAGE_LIFT_TEST_TYPES,
  type MessageLiftTestType,
  type PanelPersona,
  panelPersonasSchema,
  recommendationScenariosSchema,
  type RecommendationScenario,
  RECOMMENDATION_PROMPT_PROTOCOL_VERSION,
  RESONANCE_PROMPT_PROTOCOL_VERSION,
  type StimulusKind,
  type ResonanceBaselineProvenance,
  validateResonanceCellCount,
  stampBaselineProvenance,
} from "@/core/resonance";
import { findBrandTerms } from "@/core/matrix";
import { isUuid } from "@/core/id";
import { clusterFramingObservations } from "@/core/framing-themes";
import {
  baselineStampSchema,
  groupResponsesByAttributeThemes,
  type BaselineStamp,
  type FramingTheme,
} from "@/core/baseline";
import type { ResonanceStudyTemplate } from "@/core/resonance-templates";
import { unresolvedStimulusPlaceholders } from "@/core/resonance-templates";
import { getSsrAnchorSet } from "@/core/ssr-anchors";
import { pmfMean } from "@/core/ssr";
import { db } from "../client";
import {
  auditRuns,
  brandMentions,
  brands,
  extractions,
  framingObservations,
  framingEvidenceSnapshots,
  metrics,
  matrixVersions,
  promptCells,
  projects,
  resonanceStimuli,
  resonanceStudies,
  responses,
} from "../schema";
import { getEligibleExtractionsForRun } from "./extraction";
import { recomputeMetrics } from "./metrics";
import { verifyFramingEvidenceSnapshotRecord } from "./framing";

export interface ResonanceStudyPatch {
  name?: string;
  panelPersonas?: PanelPersona[];
  recommendationScenarios?: RecommendationScenario[];
  genericUnconditioned?: boolean;
}

export interface ResonanceEvidenceResponse {
  responseId: string;
  cellId: string;
  rawText: string;
  pmf: number[];
  meanScore: number;
  panelPersonaKey: string;
  panelPersonaLabel: string;
  stimulusId: string;
  stimulusLabel: string;
}

export interface ResonanceVariantResult {
  stimulusId: string;
  providerId: string;
  stimulusKind: string;
  label: string;
  n: number;
  piMean: number;
  pmf: number[];
  sufficientN: boolean;
  responses: ResonanceEvidenceResponse[];
}

export interface ResonancePersonaResult {
  key: string;
  stimulusId: string;
  panelPersonaKey: string;
  providerId: string;
  panelPersonaLabel: string;
  stimulusLabel: string;
  n: number;
  piMean: number;
  pmf: number[];
  directionalOnly: boolean;
  responses: ResonanceEvidenceResponse[];
}

export interface ResonanceDeltaResult {
  stimulusId: string;
  providerId: string;
  label: string;
  baselineStimulusId: string;
  baselineLabel: string;
  n: number;
  deltaPiMean: number;
  directionalOnly: boolean;
}

/**
 * D-080 (supersedes D-067): one group per selected engine — each provider is
 * a distinct synthetic population, so its variant ranking, delta table, and
 * persona slices are never pooled with another provider's. A single-provider
 * run produces exactly one group (the pre-M24 shape, just wrapped).
 */
export interface ResonanceProviderGroup {
  providerId: string;
  variants: ResonanceVariantResult[];
  personaRows: ResonancePersonaResult[];
  deltas: ResonanceDeltaResult[];
}

export interface ResonanceStudyResults {
  study: {
    id: string;
    name: string;
    genericUnconditioned: boolean;
    anchorSetVersion: string;
    anchorSetCalibrated: boolean;
    panelCount: number;
    baselineProvenance: ResonanceBaselineProvenance;
  };
  run: {
    id: string;
    runMode: string;
    completedAt: Date | null;
    repetitions: number;
  };
  providers: string[];
  providerGroups: ResonanceProviderGroup[];
}

/** M32 / D-088: ranking/deltas/segments/excerpts without raw response arrays. */
export type ResonanceVariantSummary = Omit<ResonanceVariantResult, "responses"> & {
  lowExcerpt: string | null;
  highExcerpt: string | null;
};

export type ResonancePersonaSummary = Omit<ResonancePersonaResult, "responses">;

export interface ResonanceProviderSummaryGroup {
  providerId: string;
  variants: ResonanceVariantSummary[];
  personaRows: ResonancePersonaSummary[];
  deltas: ResonanceDeltaResult[];
}

export interface ResonanceStudyResultSummary {
  study: ResonanceStudyResults["study"];
  run: ResonanceStudyResults["run"];
  providers: string[];
  providerGroups: ResonanceProviderSummaryGroup[];
}

export interface RecommendationConditionSummary {
  stimulusId: string;
  label: string;
  providerId: string;
  n: number;
  scenarioCount: number;
  inclusionRate: number;
  topPickRate: number;
  meanReciprocalRank: number;
  sufficientN: boolean;
}

export interface RecommendationLiftSummary {
  stimulusId: string;
  label: string;
  providerId: string;
  n: number;
  scenarioCount: number;
  shortlistLiftPp: number;
  shortlistCiLow: number | null;
  shortlistCiHigh: number | null;
  topPickLiftPp: number;
  reciprocalRankLift: number;
  directionalOnly: boolean;
}

export interface RecommendationStudyResultSummary {
  testType: "ai_recommendation";
  study: {
    id: string;
    name: string;
    scenarioCount: number;
    baselineProvenance: ResonanceBaselineProvenance;
  };
  run: ResonanceStudyResults["run"];
  providers: string[];
  providerGroups: Array<{
    providerId: string;
    conditions: RecommendationConditionSummary[];
    lifts: RecommendationLiftSummary[];
  }>;
}

export interface ResonanceEvidencePageItem {
  responseId: string;
  cellId: string;
  rawText: string;
  pmf: number[];
  meanScore: number;
  providerId: string;
  panelPersonaKey: string;
  panelPersonaLabel: string;
  stimulusId: string;
  stimulusLabel: string;
}

export interface ResonanceEvidencePage {
  items: ResonanceEvidencePageItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function excerptText(text: string, max = 180) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const item of items) {
    const value = key(item);
    grouped.set(value, [...(grouped.get(value) ?? []), item]);
  }
  return grouped;
}

function stripResponsesFromResults(results: ResonanceStudyResults): ResonanceStudyResultSummary {
  return {
    study: results.study,
    run: results.run,
    providers: results.providers,
    providerGroups: results.providerGroups.map((group) => ({
      providerId: group.providerId,
      deltas: group.deltas,
      personaRows: group.personaRows.map(({ responses: _responses, ...row }) => row),
      variants: group.variants.map(({ responses, ...variant }) => {
        const sorted = [...responses].sort(
          (a, b) => a.meanScore - b.meanScore || a.responseId.localeCompare(b.responseId),
        );
        const lowest = sorted[0];
        const highest = sorted[sorted.length - 1];
        return {
          ...variant,
          lowExcerpt: lowest ? excerptText(lowest.rawText) : null,
          highExcerpt: highest ? excerptText(highest.rawText) : null,
        };
      }),
    })),
  };
}

async function getResonanceBaselineProvenance(input: {
  projectId: string;
  studyId: string;
  studyState: string;
  categoryArchetype: string;
  baselineStimulusId?: string | null;
}): Promise<ResonanceBaselineProvenance> {
  const [row] = await db
    .select({
      snapshotId: framingEvidenceSnapshots.id,
      projectId: framingEvidenceSnapshots.projectId,
      framingStudyId: framingEvidenceSnapshots.framingStudyId,
      annotationId: framingEvidenceSnapshots.annotationId,
      gapClassificationId: framingEvidenceSnapshots.gapClassificationId,
      responseId: framingEvidenceSnapshots.responseId,
      evidenceJson: framingEvidenceSnapshots.evidenceJson,
      sha256: framingEvidenceSnapshots.sha256,
      stimulusId: resonanceStimuli.id,
      stimulusBody: resonanceStimuli.body,
      evidenceResponseIdsJson: resonanceStimuli.evidenceResponseIdsJson,
      baselineStampJson: resonanceStimuli.baselineStampJson,
    })
    .from(resonanceStimuli)
    .leftJoin(
      framingEvidenceSnapshots,
      eq(framingEvidenceSnapshots.id, resonanceStimuli.framingEvidenceSnapshotId),
    )
    .where(and(
      eq(resonanceStimuli.studyId, input.studyId),
      eq(resonanceStimuli.kind, "measured_ai"),
      input.studyState !== "draft" && input.baselineStimulusId
        ? eq(resonanceStimuli.id, input.baselineStimulusId)
        : undefined,
    ))
    .orderBy(asc(resonanceStimuli.position))
    .limit(1);
  if (!row?.snapshotId) {
    // M44 / D-114: stamped baselines render their own provenance; only rows
    // with neither snapshot nor stamp fall through to the historical labels.
    const stamp = row ? baselineStampSchema.safeParse(row.baselineStampJson) : null;
    if (stamp?.success) {
      return stampBaselineProvenance(stamp.data);
    }
    return historicalBaselineProvenance({
      state: input.studyState,
      categoryArchetype: input.categoryArchetype,
    });
  }
  if (
    !row.projectId ||
    !row.framingStudyId ||
    !row.annotationId ||
    !row.responseId ||
    !row.evidenceJson ||
    !row.sha256 ||
    row.projectId !== input.projectId
  ) {
    throw new Error("Simulation baseline snapshot is incomplete or belongs to another project (C-15)");
  }
  const payload = verifyFramingEvidenceSnapshotRecord({
    projectId: row.projectId,
    framingStudyId: row.framingStudyId,
    annotationId: row.annotationId,
    gapClassificationId: row.gapClassificationId,
    responseId: row.responseId,
    evidenceJson: row.evidenceJson,
    sha256: row.sha256,
  });
  const evidenceIds = readEvidenceResponseIds(row.evidenceResponseIdsJson);
  if (
    row.stimulusBody !== payload.verbatimResponse ||
    evidenceIds.length !== 1 ||
    evidenceIds[0] !== payload.responseId
  ) {
    throw new Error("Simulation baseline no longer matches its frozen framing evidence (C-15)");
  }
  const v2 = payload.snapshotVersion === "m34a-simulation-evidence.v2" ? payload : null;
  const truthfulLabel = payload.recurrence.numerator <= 1
    ? "SINGLE OBSERVED INSTANCE"
    : `OBSERVED IN ${payload.recurrence.numerator}/${payload.recurrence.denominator} SOURCE JOBS`;
  return {
    status: "snapshot",
    label: v2 ? truthfulLabel : `LEGACY M34A V1 · ${truthfulLabel}`,
    snapshotId: row.snapshotId,
    responseId: payload.responseId,
    associationId: payload.associationId,
    numerator: payload.recurrence.numerator,
    denominator: payload.recurrence.denominator,
    promptSpread: payload.recurrence.promptVariantsContainingAssociation.length,
    promptDenominator: payload.recurrence.promptVariantDenominator,
    providerId: payload.source.providerId,
    modelVersion: payload.source.modelVersion,
    generationMode: payload.source.generationMode,
    reviewMethod: payload.codingRun.reviewMethod,
    codebookVersion: payload.codebook.version,
    snapshotVersion: payload.snapshotVersion,
    snapshotSha256: row.sha256,
    promptProtocolVersion: payload.promptProtocolVersion,
    observedAt: payload.source.observedAt,
    sourceRunMode: v2?.source.runMode ?? null,
    sourceRunId: v2?.source.auditRunId ?? null,
    sourceRepetitions: v2?.source.repetitions ?? null,
    availableResponses: v2?.recurrence.availableResponses ?? null,
    unavailableJobs: v2?.recurrence.unavailableJobs ?? null,
    associationLabel: v2?.association.label ?? null,
    associationDefinition: v2?.association.definition ?? null,
    gapClassification: v2?.gap.classification ?? null,
    gapSubject: v2?.gap.subject ?? null,
    gapRationale: v2?.gap.rationale ?? null,
    scopes: payload.recurrence.scopes.map((scope) => ({
      providerId: scope.providerId,
      modelVersion: scope.modelVersion,
      generationMode: scope.generationMode,
      numerator: scope.responsesContainingAssociation,
      denominator: scope.denominator,
    })),
  };
}

export async function getResonanceStudyExportLabel(projectId: string, studyId: string) {
  const [study] = await db
    .select({
      id: resonanceStudies.id,
      name: resonanceStudies.name,
      state: resonanceStudies.state,
      genericUnconditioned: resonanceStudies.genericUnconditioned,
      categoryArchetype: projects.categoryArchetype,
      baselineStimulusId: resonanceStudies.baselineStimulusId,
    })
    .from(resonanceStudies)
    .innerJoin(projects, eq(projects.id, resonanceStudies.projectId))
    .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.projectId, projectId)));
  if (!study) return null;
  const baselineProvenance = await getResonanceBaselineProvenance({
    projectId,
    studyId,
    studyState: study.state,
    categoryArchetype: study.categoryArchetype,
    baselineStimulusId: study.baselineStimulusId,
  });
  const [snapshotRow] = baselineProvenance.snapshotId
    ? await db
        .select()
        .from(framingEvidenceSnapshots)
        .where(eq(framingEvidenceSnapshots.id, baselineProvenance.snapshotId))
        .limit(1)
    : [];
  const baselineSnapshotManifest = snapshotRow
    ? { payload: verifyFramingEvidenceSnapshotRecord(snapshotRow), sha256: snapshotRow.sha256 }
    : null;
  return {
    id: study.id,
    name: study.name,
    genericUnconditioned: study.genericUnconditioned,
    baselineLabel: baselineProvenance.label,
    framingEvidenceSnapshotId: baselineProvenance.snapshotId,
    baselineProvenance,
    baselineSnapshotManifest,
  };
}

type PmfMetricMetadata = {
  pmf?: unknown;
  stimulusKind?: unknown;
  label?: unknown;
  providerId?: unknown;
  sufficientN?: unknown;
  directionalOnly?: unknown;
};

type DeltaMetricMetadata = {
  baselineStimulusId?: unknown;
  providerId?: unknown;
  directionalOnly?: unknown;
};

/**
 * D-080 scope keys carry a trailing `|providerId` (resonance_variant/delta:
 * `stimulusId|providerId`; resonance_variant_persona:
 * `stimulusId|personaKey|providerId`). Stimulus ids and persona keys never
 * contain "|" (UUIDs and `[a-z0-9_-]+` respectively), so splitting from the
 * right by a fixed part count is unambiguous.
 */
function splitScopeKey(scopeKey: string, partCount: 2 | 3): string[] {
  const parts = scopeKey.split("|");
  return parts.length === partCount ? parts : [];
}

type SsrPayload = {
  kind?: unknown;
  pmf?: unknown;
  meanScore?: unknown;
};

function readPmf(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 5) return null;
  if (value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item < 0)) return null;
  const sum = value.reduce((total, item) => total + item, 0);
  if (sum <= 0 || Math.abs(sum - 1) > 1e-6) return null;
  return value;
}

function readSsrPayload(payload: unknown): { pmf: number[]; meanScore: number } | null {
  const parsed = payload as SsrPayload | null;
  if (!parsed || parsed.kind !== "ssr") return null;
  const pmf = readPmf(parsed.pmf);
  if (!pmf) return null;
  if (typeof parsed.meanScore !== "number" || !Number.isFinite(parsed.meanScore)) return null;
  const expectedMean = pmfMean(pmf);
  if (Math.abs(parsed.meanScore - expectedMean) > 1e-6) return null;
  return { pmf, meanScore: expectedMean };
}

function personaLabel(personas: PanelPersona[], key: string) {
  return personas.find((persona) => persona.key === key)?.label ?? key;
}

async function resonanceMetricsNeedRefresh(runId: string) {
  // Raw sql`max(...)` fragments bypass drizzle's per-column decoder and come
  // back as strings, not Dates (same reality D-074 hit in areMetricsStale) —
  // type them string and wrap in new Date() before comparing.
  const [[metricRow], [extractionRow]] = await Promise.all([
    db
      .select({ latestMetricComputedAt: sql<string | null>`max(${metrics.computedAt})` })
      .from(metrics)
      .where(and(eq(metrics.runId, runId), eq(metrics.scopeType, "resonance_variant"))),
    db
      .select({ latestExtractionUpdatedAt: sql<string | null>`max(${extractions.updatedAt})` })
      .from(extractions)
      .innerJoin(responses, eq(responses.id, extractions.responseId))
      .where(eq(responses.runId, runId)),
  ]);
  const latestMetric = metricRow?.latestMetricComputedAt ? new Date(metricRow.latestMetricComputedAt).getTime() : null;
  const latestExtraction = extractionRow?.latestExtractionUpdatedAt
    ? new Date(extractionRow.latestExtractionUpdatedAt).getTime()
    : null;
  return Boolean(latestMetric === null || (latestExtraction !== null && latestMetric < latestExtraction));
}

function assertEvidenceResponseIdShape(ids: string[]) {
  if (!ids.every(isUuid)) {
    throw new Error("Stimulus evidence response ids must be UUID strings (C-13)");
  }
}

function readEvidenceResponseIds(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Stimulus evidence response ids must be stored as an array (C-13)");
  }
  if (!value.every((item) => typeof item === "string" && isUuid(item))) {
    throw new Error("Stimulus evidence response ids must be UUID strings (C-13)");
  }
  return value;
}

export async function listResonanceStudies(projectId: string) {
  const [studies, projectRows] = await Promise.all([
    db
      .select()
      .from(resonanceStudies)
      .where(eq(resonanceStudies.projectId, projectId))
      .orderBy(desc(resonanceStudies.createdAt)),
    db
      .select({ categoryArchetype: projects.categoryArchetype })
      .from(projects)
      .where(eq(projects.id, projectId)),
  ]);

  if (studies.length === 0) return [];
  const studyIds = studies.map((s) => s.id);
  const [stimuli, versions] = await Promise.all([
    db
      .select()
      .from(resonanceStimuli)
      .where(inArray(resonanceStimuli.studyId, studyIds))
      .orderBy(asc(resonanceStimuli.position)),
    db
      .select({
        id: matrixVersions.id,
        studyId: matrixVersions.resonanceStudyId,
        version: matrixVersions.version,
        cellCount: matrixVersions.cellCount,
        state: matrixVersions.state,
      })
      .from(matrixVersions)
      .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.kind, "resonance"))),
  ]);

  const approvedVersionIds = versions.filter((v) => v.state === "approved" && v.studyId).map((v) => v.id);
  const latestRuns =
    approvedVersionIds.length === 0
      ? []
      : await db
          .select({
            id: auditRuns.id,
            state: auditRuns.state,
            runMode: auditRuns.runMode,
            matrixVersionId: auditRuns.matrixVersionId,
            completedAt: auditRuns.completedAt,
            createdAt: auditRuns.createdAt,
          })
          .from(auditRuns)
          .where(and(eq(auditRuns.projectId, projectId), inArray(auditRuns.matrixVersionId, approvedVersionIds)))
          .orderBy(desc(auditRuns.createdAt));

  const latestRunByVersion = new Map<string, (typeof latestRuns)[number]>();
  for (const run of latestRuns) {
    if (!latestRunByVersion.has(run.matrixVersionId)) latestRunByVersion.set(run.matrixVersionId, run);
  }

  const categoryArchetype = projectRows[0]?.categoryArchetype ?? "b2b";
  return Promise.all(studies.map(async (study) => {
    const matrixVersion = versions.find((v) => v.studyId === study.id && v.state === "approved") ?? null;
    const latestRun = matrixVersion ? (latestRunByVersion.get(matrixVersion.id) ?? null) : null;
    return {
      study,
      baselineProvenance: await getResonanceBaselineProvenance({
        projectId,
        studyId: study.id,
        studyState: study.state,
        categoryArchetype,
        baselineStimulusId: study.baselineStimulusId,
      }),
      stimuli: stimuli.filter((s) => s.studyId === study.id),
      matrixVersion,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            state: latestRun.state,
            runMode: latestRun.runMode,
            completedAt: latestRun.completedAt,
          }
        : null,
    };
  }));
}

/** Load one study with ownership check (projectId + studyId). */
export async function getResonanceStudy(projectId: string, studyId: string) {
  const [study] = await db
    .select()
    .from(resonanceStudies)
    .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.projectId, projectId)));
  if (!study) return null;
  const [project] = await db
    .select({ categoryArchetype: projects.categoryArchetype })
    .from(projects)
    .where(eq(projects.id, projectId));

  const [stimuli, versions] = await Promise.all([
    db
      .select()
      .from(resonanceStimuli)
      .where(eq(resonanceStimuli.studyId, studyId))
      .orderBy(asc(resonanceStimuli.position)),
    db
      .select({
        id: matrixVersions.id,
        studyId: matrixVersions.resonanceStudyId,
        version: matrixVersions.version,
        cellCount: matrixVersions.cellCount,
        state: matrixVersions.state,
      })
      .from(matrixVersions)
      .where(
        and(
          eq(matrixVersions.projectId, projectId),
          eq(matrixVersions.kind, "resonance"),
          eq(matrixVersions.resonanceStudyId, studyId),
        ),
      )
      .orderBy(desc(matrixVersions.version)),
  ]);

  const matrixVersion = versions.find((v) => v.state === "approved") ?? null;
  let latestRun: {
    id: string;
    state: string;
    runMode: string;
    completedAt: Date | null;
  } | null = null;
  let studyRuns: Array<{
    id: string;
    state: string;
    runMode: string;
    createdAt: Date;
    completedAt: Date | null;
  }> = [];

  if (matrixVersion) {
    studyRuns = await db
      .select({
        id: auditRuns.id,
        state: auditRuns.state,
        runMode: auditRuns.runMode,
        createdAt: auditRuns.createdAt,
        completedAt: auditRuns.completedAt,
      })
      .from(auditRuns)
      .where(and(eq(auditRuns.projectId, projectId), eq(auditRuns.matrixVersionId, matrixVersion.id)))
      .orderBy(desc(auditRuns.createdAt));
    const first = studyRuns[0];
    latestRun = first
      ? { id: first.id, state: first.state, runMode: first.runMode, completedAt: first.completedAt }
      : null;
  }

  const baselineProvenance = await getResonanceBaselineProvenance({
    projectId,
    studyId,
    studyState: study.state,
    categoryArchetype: project?.categoryArchetype ?? "b2b",
    baselineStimulusId: study.baselineStimulusId,
  });
  return { study, stimuli, matrixVersion, latestRun, studyRuns, baselineProvenance };
}

export interface MessageLiftPromptDisclosure {
  testType: MessageLiftTestType;
  state: "preview" | "frozen";
  protocolVersion: string | null;
  matrixVersion: number | null;
  parityVerified: boolean;
  currentMessage: { id: string; label: string; body: string } | null;
  newMessage: { id: string; label: string; body: string } | null;
  pairs: Array<{
    contextKey: string;
    contextLabel: string;
    currentPrompt: string;
    newPrompt: string;
    currentCellId?: string;
    newCellId?: string;
    currentResponseIds?: string[];
    newResponseIds?: string[];
  }>;
}

function frozenPromptParityText(resolvedText: string, messageText: string): string {
  const escapedMessage = JSON.stringify(messageText)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
  return resolvedText.replace(escapedMessage, JSON.stringify("__MESSAGE_UNDER_TEST__"));
}

export async function getMessageLiftPromptDisclosure(
  projectId: string,
  studyId: string,
): Promise<MessageLiftPromptDisclosure | null> {
  const detail = await getResonanceStudy(projectId, studyId);
  if (!detail) return null;
  const testType: MessageLiftTestType =
    detail.study.testType === "ai_recommendation" ? "ai_recommendation" : "buyer_response";
  const current = detail.stimuli.find((stimulus) => stimulus.kind === "measured_ai") ?? null;
  const next = detail.stimuli.find((stimulus) => stimulus.id !== current?.id) ?? null;
  const contexts: Array<{ key: string; label: string } & (PanelPersona | RecommendationScenario)> =
    testType === "ai_recommendation"
      ? recommendationScenariosSchema.parse(detail.study.recommendationScenariosJson)
      : panelPersonasSchema.parse(detail.study.panelPersonasJson);
  const base = {
    testType,
    state: detail.matrixVersion ? ("frozen" as const) : ("preview" as const),
    protocolVersion: detail.study.promptProtocolVersion,
    matrixVersion: detail.matrixVersion?.version ?? null,
    currentMessage: current
      ? { id: current.id, label: current.label, body: current.body }
      : null,
    newMessage: next ? { id: next.id, label: next.label, body: next.body } : null,
  };
  if (!current || !next) return { ...base, parityVerified: false, pairs: [] };

  if (detail.matrixVersion) {
    const cells = await db
      .select({
        id: promptCells.id,
        contextKey: promptCells.panelPersonaKey,
        stimulusId: promptCells.stimulusId,
        resolvedText: promptCells.resolvedText,
      })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, detail.matrixVersion.id));
    const responseRows = cells.length > 0
      ? await db
          .select({ id: responses.id, cellId: responses.cellId })
          .from(responses)
          .where(inArray(responses.cellId, cells.map((cell) => cell.id)))
      : [];
    const responseIdsByCell = groupBy(responseRows, (response) => response.cellId);
    const pairs = contexts.flatMap((context) => {
      const currentCell = cells.find(
        (cell) => cell.contextKey === context.key && cell.stimulusId === current.id,
      );
      const nextCell = cells.find(
        (cell) => cell.contextKey === context.key && cell.stimulusId === next.id,
      );
      return currentCell && nextCell
        ? [
            {
              contextKey: context.key,
              contextLabel: context.label,
              currentPrompt: currentCell.resolvedText,
              newPrompt: nextCell.resolvedText,
              currentCellId: currentCell.id,
              newCellId: nextCell.id,
              currentResponseIds: (responseIdsByCell.get(currentCell.id) ?? []).map((row) => row.id),
              newResponseIds: (responseIdsByCell.get(nextCell.id) ?? []).map((row) => row.id),
            },
          ]
        : [];
    });
    const parityVerified =
      pairs.length === contexts.length &&
      pairs.every(
        (pair) =>
          frozenPromptParityText(pair.currentPrompt, current.body) ===
          frozenPromptParityText(pair.newPrompt, next.body),
      );
    return {
      ...base,
      parityVerified,
      pairs,
    };
  }

  const pairs = contexts.map((context) => {
    const compile = (stimulus: typeof current) =>
      testType === "ai_recommendation"
        ? compileRecommendationPrompt({
            scenario: context as RecommendationScenario,
            stimulus: {
              ...stimulus,
              kind: stimulus.kind as StimulusKind,
            },
          })
        : compileBuyerResponsePrompt({
            persona: context as PanelPersona,
            stimulus: {
              ...stimulus,
              kind: stimulus.kind as StimulusKind,
            },
            genericUnconditioned: detail.study.genericUnconditioned,
          });
    const currentCompiled = compile(current);
    const nextCompiled = compile(next);
    return {
      contextKey: context.key,
      contextLabel: context.label,
      currentPrompt: currentCompiled.resolvedText,
      newPrompt: nextCompiled.resolvedText,
      parityVerified: currentCompiled.parityText === nextCompiled.parityText,
      protocolVersion: currentCompiled.protocolVersion,
    };
  });
  return {
    ...base,
    protocolVersion: pairs[0]?.protocolVersion ?? base.protocolVersion,
    parityVerified: pairs.length === contexts.length && pairs.every((pair) => pair.parityVerified),
    pairs: pairs.map(({ parityVerified: _parity, protocolVersion: _protocol, ...pair }) => pair),
  };
}

export async function getResonanceStudyResults(
  projectId: string,
  studyId: string,
  runId?: string,
  options: { refreshMetrics?: boolean } = {},
): Promise<ResonanceStudyResults | null> {
  const [study] = await db
    .select({ study: resonanceStudies, categoryArchetype: projects.categoryArchetype })
    .from(resonanceStudies)
    .innerJoin(projects, eq(projects.id, resonanceStudies.projectId))
    .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.projectId, projectId)));
  if (!study) return null;

  const [version] = await db
    .select({ id: matrixVersions.id })
    .from(matrixVersions)
    .where(
      and(
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "resonance"),
        eq(matrixVersions.resonanceStudyId, studyId),
        eq(matrixVersions.state, "approved"),
      ),
    )
    .orderBy(desc(matrixVersions.version))
    .limit(1);
  if (!version) return null;

  const runQuery = db
    .select({
      id: auditRuns.id,
      runMode: auditRuns.runMode,
      completedAt: auditRuns.completedAt,
      repetitions: auditRuns.repetitions,
    })
    .from(auditRuns)
    .where(
      runId
        ? and(
            eq(auditRuns.id, runId),
            eq(auditRuns.projectId, projectId),
            eq(auditRuns.matrixVersionId, version.id),
            eq(auditRuns.state, "completed"),
          )
        : and(eq(auditRuns.matrixVersionId, version.id), eq(auditRuns.state, "completed")),
    )
    .orderBy(desc(auditRuns.completedAt), desc(auditRuns.createdAt))
    .limit(1);
  const [run] = await runQuery;
  if (!run) return null;
  if (options.refreshMetrics && (await resonanceMetricsNeedRefresh(run.id))) {
    await recomputeMetrics(run.id);
  }

  const [metricRows, eligible, cellRows] = await Promise.all([
    db
      .select()
      .from(metrics)
      .where(eq(metrics.runId, run.id))
      .orderBy(metrics.scopeType, metrics.scopeKey),
    getEligibleExtractionsForRun(run.id),
    db
      .select({
        id: promptCells.id,
        stimulusId: promptCells.stimulusId,
        panelPersonaKey: promptCells.panelPersonaKey,
        stimulusLabel: resonanceStimuli.label,
      })
      .from(promptCells)
      .innerJoin(resonanceStimuli, eq(resonanceStimuli.id, promptCells.stimulusId))
      .where(eq(promptCells.matrixVersionId, version.id)),
  ]);

  const responseIds = eligible.map((row) => row.responseId);
  const responseRows =
    responseIds.length === 0
      ? []
      : await db
          .select({
            id: responses.id,
            cellId: responses.cellId,
            rawText: responses.rawText,
          })
          .from(responses)
          .where(inArray(responses.id, responseIds));

  const personas = study.study.panelPersonasJson as PanelPersona[];
  const anchorSet = getSsrAnchorSet(study.study.anchorSetVersion);
  const cellById = new Map(cellRows.map((cell) => [cell.id, cell]));
  const responseById = new Map(responseRows.map((response) => [response.id, response]));
  // D-080: evidence is keyed WITH the provider id — a stimulus run under two
  // engines must never mix engine A's responses into engine B's variant card.
  const evidenceByStimulus = new Map<string, ResonanceEvidenceResponse[]>();
  const evidenceByStimulusPersona = new Map<string, ResonanceEvidenceResponse[]>();

  for (const sample of [...eligible].sort((a, b) => a.responseId.localeCompare(b.responseId))) {
    const cell = cellById.get(sample.cellId);
    const response = responseById.get(sample.responseId);
    const ssr = readSsrPayload(sample.extractedJson);
    if (!cell?.stimulusId || !cell.panelPersonaKey || !response || !ssr) continue;
    const row: ResonanceEvidenceResponse = {
      responseId: sample.responseId,
      cellId: sample.cellId,
      rawText: response.rawText,
      pmf: ssr.pmf,
      meanScore: ssr.meanScore,
      panelPersonaKey: cell.panelPersonaKey,
      panelPersonaLabel: personaLabel(personas, cell.panelPersonaKey),
      stimulusId: cell.stimulusId,
      stimulusLabel: cell.stimulusLabel,
    };
    const stimulusProviderKey = `${cell.stimulusId}|${sample.providerId}`;
    if (!evidenceByStimulus.has(stimulusProviderKey)) evidenceByStimulus.set(stimulusProviderKey, []);
    evidenceByStimulus.get(stimulusProviderKey)?.push(row);
    const personaKey = `${cell.stimulusId}|${cell.panelPersonaKey}|${sample.providerId}`;
    if (!evidenceByStimulusPersona.has(personaKey)) evidenceByStimulusPersona.set(personaKey, []);
    evidenceByStimulusPersona.get(personaKey)?.push(row);
  }

  // variantById is keyed `stimulusId|providerId` so a delta row (same key
  // shape) can look up both its own variant AND its baseline WITHIN the same
  // provider — the within-population guarantee (D-080).
  const variantById = new Map<string, ResonanceVariantResult>();
  const variantsByProvider = new Map<string, ResonanceVariantResult[]>();
  for (const row of metricRows.filter((metric) => metric.scopeType === "resonance_variant" && metric.metricKey === "pi_mean")) {
    const [stimulusId, providerId] = splitScopeKey(row.scopeKey, 2);
    if (!stimulusId || !providerId) continue;
    const metadata = row.metadataJson as PmfMetricMetadata;
    const pmf = readPmf(metadata.pmf);
    if (!pmf) continue;
    const result: ResonanceVariantResult = {
      stimulusId,
      providerId,
      stimulusKind: typeof metadata.stimulusKind === "string" ? metadata.stimulusKind : "custom",
      label: typeof metadata.label === "string" ? metadata.label : stimulusId,
      n: row.n,
      piMean: row.value,
      pmf,
      sufficientN: metadata.sufficientN === true,
      responses: evidenceByStimulus.get(row.scopeKey) ?? [],
    };
    variantById.set(row.scopeKey, result);
    if (!variantsByProvider.has(providerId)) variantsByProvider.set(providerId, []);
    variantsByProvider.get(providerId)?.push(result);
  }

  const personaRowsByProvider = new Map<string, ResonancePersonaResult[]>();
  for (const row of metricRows.filter((metric) => metric.scopeType === "resonance_variant_persona" && metric.metricKey === "pi_mean")) {
    const [stimulusId, panelPersonaKey, providerId] = splitScopeKey(row.scopeKey, 3);
    if (!stimulusId || !panelPersonaKey || !providerId) continue;
    const metadata = row.metadataJson as PmfMetricMetadata;
    const pmf = readPmf(metadata.pmf);
    if (!pmf) continue;
    const label = typeof metadata.label === "string" ? metadata.label : variantById.get(`${stimulusId}|${providerId}`)?.label ?? stimulusId;
    if (!personaRowsByProvider.has(providerId)) personaRowsByProvider.set(providerId, []);
    personaRowsByProvider.get(providerId)?.push({
      key: row.scopeKey,
      stimulusId,
      panelPersonaKey,
      providerId,
      panelPersonaLabel: personaLabel(personas, panelPersonaKey),
      stimulusLabel: label,
      n: row.n,
      piMean: row.value,
      pmf,
      directionalOnly: true,
      responses: evidenceByStimulusPersona.get(row.scopeKey) ?? [],
    });
  }

  const deltasByProvider = new Map<string, ResonanceDeltaResult[]>();
  for (const row of metricRows.filter((metric) => metric.scopeType === "resonance_delta" && metric.metricKey === "delta_pi_mean")) {
    const [stimulusId, providerId] = splitScopeKey(row.scopeKey, 2);
    if (!stimulusId || !providerId) continue;
    const metadata = row.metadataJson as DeltaMetricMetadata;
    const baselineStimulusId = typeof metadata.baselineStimulusId === "string" ? metadata.baselineStimulusId : "";
    const variant = variantById.get(row.scopeKey);
    // D-080: the baseline lookup is scoped to the SAME provider as the delta
    // row — never another provider's variant, even if stimulus ids collide.
    const baseline = variantById.get(`${baselineStimulusId}|${providerId}`);
    if (!variant || !baseline) continue;
    if (!deltasByProvider.has(providerId)) deltasByProvider.set(providerId, []);
    deltasByProvider.get(providerId)?.push({
      stimulusId,
      providerId,
      label: variant.label,
      baselineStimulusId,
      baselineLabel: baseline.label,
      n: row.n,
      deltaPiMean: row.value,
      directionalOnly: metadata.directionalOnly !== false,
    });
  }

  const providers = [...variantsByProvider.keys()].sort();
  const providerGroups: ResonanceProviderGroup[] = providers.map((providerId) => {
    const variants = [...(variantsByProvider.get(providerId) ?? [])];
    variants.sort((a, b) => b.piMean - a.piMean || a.label.localeCompare(b.label));
    const personaRows = [...(personaRowsByProvider.get(providerId) ?? [])];
    personaRows.sort((a, b) => a.panelPersonaLabel.localeCompare(b.panelPersonaLabel) || b.piMean - a.piMean);
    const deltas = [...(deltasByProvider.get(providerId) ?? [])];
    deltas.sort((a, b) => b.deltaPiMean - a.deltaPiMean || a.label.localeCompare(b.label));
    return { providerId, variants, personaRows, deltas };
  });

  return {
    study: {
      id: study.study.id,
      name: study.study.name,
      genericUnconditioned: study.study.genericUnconditioned,
      anchorSetVersion: study.study.anchorSetVersion,
      anchorSetCalibrated: anchorSet.calibrated,
      panelCount: panelPersonasSchema.parse(study.study.panelPersonasJson).length,
      baselineProvenance: await getResonanceBaselineProvenance({
        projectId,
        studyId,
        studyState: study.study.state,
        categoryArchetype: study.categoryArchetype,
        baselineStimulusId: study.study.baselineStimulusId,
      }),
    },
    run,
    providers,
    providerGroups,
  };
}

/** M32 / D-088: same metrics as getResonanceStudyResults, without raw response arrays. */
export async function getResonanceStudyResultSummary(
  projectId: string,
  studyId: string,
  runId?: string,
  options: { refreshMetrics?: boolean } = {},
): Promise<ResonanceStudyResultSummary | null> {
  const results = await getResonanceStudyResults(projectId, studyId, runId, options);
  if (!results) return null;
  return stripResponsesFromResults(results);
}

export async function getRecommendationStudyResultSummary(
  projectId: string,
  studyId: string,
  runId?: string,
  options: { refreshMetrics?: boolean } = {},
): Promise<RecommendationStudyResultSummary | null> {
  const [study] = await db
    .select({ study: resonanceStudies, categoryArchetype: projects.categoryArchetype })
    .from(resonanceStudies)
    .innerJoin(projects, eq(projects.id, resonanceStudies.projectId))
    .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.projectId, projectId)));
  if (!study || study.study.testType !== "ai_recommendation") return null;
  const [version] = await db
    .select({ id: matrixVersions.id })
    .from(matrixVersions)
    .where(
      and(
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "resonance"),
        eq(matrixVersions.resonanceStudyId, studyId),
        eq(matrixVersions.state, "approved"),
      ),
    )
    .orderBy(desc(matrixVersions.version))
    .limit(1);
  if (!version) return null;
  const [run] = await db
    .select({
      id: auditRuns.id,
      runMode: auditRuns.runMode,
      completedAt: auditRuns.completedAt,
      repetitions: auditRuns.repetitions,
    })
    .from(auditRuns)
    .where(
      runId
        ? and(
            eq(auditRuns.id, runId),
            eq(auditRuns.projectId, projectId),
            eq(auditRuns.matrixVersionId, version.id),
            eq(auditRuns.state, "completed"),
          )
        : and(eq(auditRuns.matrixVersionId, version.id), eq(auditRuns.state, "completed")),
    )
    .orderBy(desc(auditRuns.completedAt), desc(auditRuns.createdAt))
    .limit(1);
  if (!run) return null;
  if (options.refreshMetrics && (await resonanceMetricsNeedRefresh(run.id))) {
    await recomputeMetrics(run.id);
  }
  const [metricRows, stimulusRows] = await Promise.all([
    db.select().from(metrics).where(eq(metrics.runId, run.id)),
    db
      .select({
        id: resonanceStimuli.id,
        label: resonanceStimuli.label,
        position: resonanceStimuli.position,
      })
      .from(resonanceStimuli)
      .where(eq(resonanceStimuli.studyId, studyId)),
  ]);
  const labelById = new Map(stimulusRows.map((row) => [row.id, row.label]));
  const conditionsByProvider = new Map<string, RecommendationConditionSummary[]>();
  const conditionRows = metricRows.filter((row) => row.scopeType === "recommendation_condition");
  for (const [scopeKey, rows] of groupBy(conditionRows, (row) => row.scopeKey)) {
    const [stimulusId, providerId] = splitScopeKey(scopeKey, 2);
    if (!stimulusId || !providerId) continue;
    const inclusion = rows.find((row) => row.metricKey === "top_k_inclusion_rate");
    const topPick = rows.find((row) => row.metricKey === "top_pick_rate");
    const reciprocal = rows.find((row) => row.metricKey === "mean_reciprocal_rank");
    if (!inclusion || !topPick || !reciprocal) continue;
    const metadata = inclusion.metadataJson as { scenarioCount?: unknown; sufficientN?: unknown };
    const item: RecommendationConditionSummary = {
      stimulusId,
      label: labelById.get(stimulusId) ?? stimulusId,
      providerId,
      n: inclusion.n,
      scenarioCount: typeof metadata.scenarioCount === "number" ? metadata.scenarioCount : 0,
      inclusionRate: inclusion.value,
      topPickRate: topPick.value,
      meanReciprocalRank: reciprocal.value,
      sufficientN: metadata.sufficientN === true,
    };
    if (!conditionsByProvider.has(providerId)) conditionsByProvider.set(providerId, []);
    conditionsByProvider.get(providerId)?.push(item);
  }

  const liftsByProvider = new Map<string, RecommendationLiftSummary[]>();
  const deltaRows = metricRows.filter((row) => row.scopeType === "recommendation_delta");
  for (const [scopeKey, rows] of groupBy(deltaRows, (row) => row.scopeKey)) {
    const [stimulusId, providerId] = splitScopeKey(scopeKey, 2);
    if (!stimulusId || !providerId) continue;
    const shortlist = rows.find((row) => row.metricKey === "top_k_lift_pp");
    const topPick = rows.find((row) => row.metricKey === "top_pick_lift_pp");
    const reciprocal = rows.find((row) => row.metricKey === "reciprocal_rank_lift");
    if (!shortlist || !topPick || !reciprocal) continue;
    const metadata = shortlist.metadataJson as {
      scenarioCount?: unknown;
      directionalOnly?: unknown;
    };
    const item: RecommendationLiftSummary = {
      stimulusId,
      label: labelById.get(stimulusId) ?? stimulusId,
      providerId,
      n: shortlist.n,
      scenarioCount: typeof metadata.scenarioCount === "number" ? metadata.scenarioCount : 0,
      shortlistLiftPp: shortlist.value,
      shortlistCiLow: shortlist.ciLow,
      shortlistCiHigh: shortlist.ciHigh,
      topPickLiftPp: topPick.value,
      reciprocalRankLift: reciprocal.value,
      directionalOnly: metadata.directionalOnly !== false,
    };
    if (!liftsByProvider.has(providerId)) liftsByProvider.set(providerId, []);
    liftsByProvider.get(providerId)?.push(item);
  }
  const providers = [...new Set([...conditionsByProvider.keys(), ...liftsByProvider.keys()])].sort();
  return {
    testType: "ai_recommendation",
    study: {
      id: studyId,
      name: study.study.name,
      scenarioCount: recommendationScenariosSchema.parse(study.study.recommendationScenariosJson).length,
      baselineProvenance: await getResonanceBaselineProvenance({
        projectId,
        studyId,
        studyState: study.study.state,
        categoryArchetype: study.categoryArchetype,
        baselineStimulusId: study.study.baselineStimulusId,
      }),
    },
    run,
    providers,
    providerGroups: providers.map((providerId) => ({
      providerId,
      conditions: (conditionsByProvider.get(providerId) ?? []).sort(
        (a, b) =>
          (stimulusRows.find((row) => row.id === a.stimulusId)?.position ?? 0) -
          (stimulusRows.find((row) => row.id === b.stimulusId)?.position ?? 0),
      ),
      lifts: liftsByProvider.get(providerId) ?? [],
    })),
  };
}

/**
 * M32 / D-088: deduplicated evidence page for one study/engine.
 * Each response appears once (not duplicated across variant/persona panels).
 */
export async function listResonanceEvidencePage(input: {
  projectId: string;
  studyId: string;
  runId?: string;
  providerId?: string;
  stimulusId?: string;
  panelPersonaKey?: string;
  page?: number;
  pageSize?: number;
}): Promise<ResonanceEvidencePage | null> {
  const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const results = await getResonanceStudyResults(input.projectId, input.studyId, input.runId, {
    refreshMetrics: false,
  });
  if (!results) return null;

  const providerId = input.providerId ?? results.providers[0];
  if (!providerId) {
    return { items: [], page, pageSize, total: 0, totalPages: 0 };
  }

  const group = results.providerGroups.find((g) => g.providerId === providerId);
  if (!group) {
    return { items: [], page, pageSize, total: 0, totalPages: 0 };
  }

  const byId = new Map<string, ResonanceEvidencePageItem>();
  for (const variant of group.variants) {
    for (const response of variant.responses) {
      if (input.stimulusId && response.stimulusId !== input.stimulusId) continue;
      if (input.panelPersonaKey && response.panelPersonaKey !== input.panelPersonaKey) continue;
      if (!byId.has(response.responseId)) {
        byId.set(response.responseId, {
          ...response,
          providerId,
        });
      }
    }
  }

  const items = [...byId.values()].sort(
    (a, b) =>
      a.stimulusLabel.localeCompare(b.stimulusLabel) ||
      a.panelPersonaLabel.localeCompare(b.panelPersonaLabel) ||
      a.responseId.localeCompare(b.responseId),
  );
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

async function selectRecommendationScenarios(projectId: string): Promise<RecommendationScenario[]> {
  const [version] = await db
    .select({ id: matrixVersions.id })
    .from(matrixVersions)
    .where(
      and(
        eq(matrixVersions.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(matrixVersions.state, "approved"),
      ),
    )
    .orderBy(desc(matrixVersions.version))
    .limit(1);
  if (!version) return [];

  const projectBrands = await db
    .select({ name: brands.name, aliasesJson: brands.aliasesJson })
    .from(brands)
    .where(eq(brands.projectId, projectId));
  const brandTerms = projectBrands.map((brand) => ({
    name: brand.name,
    aliases: Array.isArray(brand.aliasesJson) ? (brand.aliasesJson as string[]) : [],
  }));
  const cells = await db
    .select({
      id: promptCells.id,
      intent: promptCells.intent,
      variantKey: promptCells.variantKey,
      resolvedText: promptCells.resolvedText,
    })
    .from(promptCells)
    .where(eq(promptCells.matrixVersionId, version.id))
    .orderBy(asc(promptCells.createdAt));

  const seen = new Set<string>();
  const eligible = cells.filter((cell) => {
    if (cell.intent !== "discovery" && cell.intent !== "consideration") return false;
    if (findBrandTerms(cell.resolvedText, brandTerms).length > 0) return false;
    const key = cell.resolvedText.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return eligible.slice(0, 20).map((cell, index) => ({
    key: `s${index + 1}`,
    label: `Shopping situation ${index + 1}`,
    promptText: cell.resolvedText,
    sourceCellId: cell.id,
  }));
}

export async function createResonanceStudy(
  projectId: string,
  name: string,
  testType: MessageLiftTestType = "buyer_response",
  seedMessagePair = false,
) {
  if (!(MESSAGE_LIFT_TEST_TYPES as readonly string[]).includes(testType)) {
    throw new Error("Unknown Message Lift test type");
  }
  const recommendationScenarios =
    testType === "ai_recommendation" ? await selectRecommendationScenarios(projectId) : [];
  return db.transaction(async (tx) => {
    const [study] = await tx
      .insert(resonanceStudies)
      .values({
        projectId,
        name,
        testType,
        recommendationScenariosJson: recommendationScenarios,
        panelPersonasJson: [
          {
            key: "p1",
            label: "Primary buyer",
            ageBand: "35-44",
            incomeBand: "$100k-$150k",
            locationContext: "United States",
            behavioralProfile: "researches carefully before choosing a vendor",
          },
        ],
      })
      .returning({ id: resonanceStudies.id });
    if (seedMessagePair) {
      await tx.insert(resonanceStimuli).values([
        {
          studyId: study.id,
          kind: "measured_ai",
          label: "Current message",
          body: "Select a verbatim stored response.",
          evidenceResponseIdsJson: [],
          position: 1,
        },
        {
          studyId: study.id,
          kind: "custom",
          label: "New message",
          body: "",
          evidenceResponseIdsJson: [],
          position: 2,
        },
      ]);
    }
    return study;
  });
}

export async function createResonanceStudyFromTemplate(projectId: string, template: ResonanceStudyTemplate) {
  return db.transaction(async (tx) => {
    const [study] = await tx
      .insert(resonanceStudies)
      .values({
        projectId,
        name: template.name,
        panelPersonasJson: [
          {
            key: "p1",
            label: "Primary buyer",
            ageBand: "35-44",
            incomeBand: "$100k-$150k",
            locationContext: "United States",
            behavioralProfile: "researches carefully before choosing a vendor",
          },
        ],
      })
      .returning({ id: resonanceStudies.id });

    for (const [idx, stimulus] of template.stimuli.entries()) {
      await tx.insert(resonanceStimuli).values({
        studyId: study.id,
        kind: stimulus.kind,
        label: stimulus.label,
        body: stimulus.body,
        evidenceResponseIdsJson: [],
        position: idx + 1,
      });
    }
    return study;
  });
}

export async function updateResonanceStudy(projectId: string, studyId: string, patch: ResonanceStudyPatch) {
  const values: Partial<typeof resonanceStudies.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.panelPersonas !== undefined) values.panelPersonasJson = panelPersonasSchema.parse(patch.panelPersonas);
  if (patch.recommendationScenarios !== undefined) {
    values.recommendationScenariosJson = recommendationScenariosSchema.parse(patch.recommendationScenarios);
  }
  if (patch.genericUnconditioned !== undefined) values.genericUnconditioned = patch.genericUnconditioned;

  const updated = await db
    .update(resonanceStudies)
    .set(values)
    .where(
      and(
        eq(resonanceStudies.id, studyId),
        eq(resonanceStudies.projectId, projectId),
        eq(resonanceStudies.state, "draft"),
      ),
    )
    .returning({ id: resonanceStudies.id });
  return updated.length;
}

// C-4: a study's stimuli compile into a frozen matrix version at approval;
// once the study leaves 'draft' its stimuli are immutable. Server actions are
// RPC endpoints (the form's disabled inputs are UI-only), so the freeze must
// be enforced here, not just in the UI.
async function lockStudyForMutation(
  tx: Pick<typeof db, "execute">,
  projectId: string,
  studyId: string,
) {
  const locked = await tx.execute<{ state: string; categoryArchetype: string }>(sql`
    select s.state, p.category_archetype as "categoryArchetype"
    from ${resonanceStudies} s
    join ${projects} p on p.id = s.project_id
    where s.id = ${studyId}
      and s.project_id = ${projectId}
    for update
  `);
  const row = locked.rows[0];
  if (!row) throw new Error("Study not found");
  if (row.state !== "draft") {
    throw new Error("This study is approved and frozen (C-4); create a new study to change stimuli");
  }
  return row;
}

async function loadVerifiedFramingSnapshot(
  tx: Pick<typeof db, "select">,
  projectId: string,
  snapshotId: string,
) {
  if (!isUuid(snapshotId)) throw new Error("Invalid framing evidence snapshot id");
  const [row] = await tx
    .select()
    .from(framingEvidenceSnapshots)
    .where(
      and(
        eq(framingEvidenceSnapshots.id, snapshotId),
        eq(framingEvidenceSnapshots.projectId, projectId),
      ),
    );
  if (!row) throw new Error("Framing evidence snapshot not found in this project (C-15)");
  return { row, payload: verifyFramingEvidenceSnapshotRecord(row) };
}

export async function addResonanceStimulus(input: {
  projectId: string;
  studyId: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIds: string[];
  framingEvidenceSnapshotId?: string | null;
  baselineThemeKey?: string | null;
}) {
  assertEvidenceResponseIdShape(input.evidenceResponseIds);
  return db.transaction(async (tx) => {
    await lockStudyForMutation(tx, input.projectId, input.studyId);
    let body = input.body;
    const evidenceResponseIds = input.evidenceResponseIds;
    let baselineStampJson: BaselineStamp | null = null;
    if (input.framingEvidenceSnapshotId) {
      // D-114: the snapshot ceremony is retired for new writes; historical
      // rows keep their linkage for truthful rendering.
      throw new Error("The framing-snapshot workflow is retired (D-114) — pick a stored response instead");
    }
    if (input.kind === "measured_ai") {
      if (evidenceResponseIds.length === 0) {
        throw new Error("Pick the stored AI response this baseline quotes (C-13)");
      }
      await assertEvidenceIds(input.projectId, evidenceResponseIds);
      const source = await loadVerbatimBaselineSource(input.projectId, evidenceResponseIds[0]);
      body = source.rawText; // verbatim, server-enforced (C-13/C-15)
      baselineStampJson = await buildBaselineStamp(
        input.projectId,
        source,
        input.baselineThemeKey ?? null,
      );
    }
    const [{ latest }] = await tx
      .select({ latest: max(resonanceStimuli.position) })
      .from(resonanceStimuli)
      .where(eq(resonanceStimuli.studyId, input.studyId));
    const [row] = await tx
      .insert(resonanceStimuli)
      .values({
        studyId: input.studyId,
        kind: input.kind,
        label: input.label,
        body,
        evidenceResponseIdsJson: evidenceResponseIds,
        framingEvidenceSnapshotId: null,
        baselineStampJson,
        position: (latest ?? 0) + 1,
      })
      .returning({ id: resonanceStimuli.id });
    return row;
  });
}

export async function updateResonanceStimulus(input: {
  projectId: string;
  studyId: string;
  stimulusId: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIds: string[];
  framingEvidenceSnapshotId?: string | null;
  baselineThemeKey?: string | null;
}) {
  assertEvidenceResponseIdShape(input.evidenceResponseIds);
  return db.transaction(async (tx) => {
    await lockStudyForMutation(tx, input.projectId, input.studyId);
    let body = input.body;
    const evidenceResponseIds = input.evidenceResponseIds;
    let baselineStampJson: BaselineStamp | null = null;
    if (input.framingEvidenceSnapshotId) {
      // D-114: the snapshot ceremony is retired for new writes; historical
      // rows keep their linkage for truthful rendering.
      throw new Error("The framing-snapshot workflow is retired (D-114) — pick a stored response instead");
    }
    if (input.kind === "measured_ai") {
      if (evidenceResponseIds.length === 0) {
        throw new Error("Pick the stored AI response this baseline quotes (C-13)");
      }
      await assertEvidenceIds(input.projectId, evidenceResponseIds);
      const source = await loadVerbatimBaselineSource(input.projectId, evidenceResponseIds[0]);
      body = source.rawText; // verbatim, server-enforced (C-13/C-15)
      baselineStampJson = await buildBaselineStamp(
        input.projectId,
        source,
        input.baselineThemeKey ?? null,
      );
    }
    const updated = await tx
      .update(resonanceStimuli)
      .set({
        kind: input.kind,
        label: input.label,
        body,
        evidenceResponseIdsJson: evidenceResponseIds,
        framingEvidenceSnapshotId: null,
        baselineStampJson,
        updatedAt: new Date(),
      })
      .where(and(eq(resonanceStimuli.id, input.stimulusId), eq(resonanceStimuli.studyId, input.studyId)))
      .returning({ id: resonanceStimuli.id });
    return updated.length;
  });
}

export async function deleteResonanceStimulus(projectId: string, studyId: string, stimulusId: string) {
  return db.transaction(async (tx) => {
    await lockStudyForMutation(tx, projectId, studyId);
    const deleted = await tx
      .delete(resonanceStimuli)
      .where(and(eq(resonanceStimuli.id, stimulusId), eq(resonanceStimuli.studyId, studyId)))
      .returning({ id: resonanceStimuli.id });
    return deleted.length;
  });
}

export async function getResonanceStudyAnchorSetVersion(studyId: string): Promise<string | null> {
  const [study] = await db
    .select({ anchorSetVersion: resonanceStudies.anchorSetVersion })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, studyId));
  return study?.anchorSetVersion ?? null;
}

export async function getMessageLiftTestType(studyId: string): Promise<MessageLiftTestType | null> {
  const [study] = await db
    .select({ testType: resonanceStudies.testType })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, studyId));
  return study && (MESSAGE_LIFT_TEST_TYPES as readonly string[]).includes(study.testType)
    ? (study.testType as MessageLiftTestType)
    : null;
}

/** M46/D-117: persona × framing footprint for Simulation draw-floor math. */
export async function getResonanceDrawFootprint(studyId: string): Promise<{
  panelCount: number;
  framingCount: number;
  testType: MessageLiftTestType;
} | null> {
  const [study] = await db
    .select({
      testType: resonanceStudies.testType,
      panelPersonasJson: resonanceStudies.panelPersonasJson,
      recommendationScenariosJson: resonanceStudies.recommendationScenariosJson,
    })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, studyId));
  if (!study) return null;
  let panelCount = 0;
  try {
    panelCount =
      study.testType === "ai_recommendation"
        ? recommendationScenariosSchema.parse(study.recommendationScenariosJson).length
        : panelPersonasSchema.parse(study.panelPersonasJson).length;
  } catch {
    panelCount = 0;
  }
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(resonanceStimuli)
    .where(eq(resonanceStimuli.studyId, studyId));
  return {
    panelCount,
    framingCount: countRow?.n ?? 0,
    testType: study.testType === "ai_recommendation" ? "ai_recommendation" : "buyer_response",
  };
}

export async function listAuditEvidenceResponses(projectId: string, limit = 20) {
  return db
    .select({
      id: responses.id,
      rawText: responses.rawText,
      createdAt: responses.createdAt,
    })
    .from(responses)
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    )
    .orderBy(desc(responses.createdAt))
    .limit(limit);
}

async function assertEvidenceIds(projectId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: responses.id })
    .from(responses)
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        inArray(responses.id, ids),
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    );
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error("Measured-AI stimuli can only cite stored audit responses from the same project (C-13)");
  }
}

/**
 * M44 / D-114: the verbatim source for a measured_ai baseline — the stored
 * response row plus its resolved prompt, project-checked. The stimulus body
 * is always set from rawText server-side, never trusted from the client.
 */
async function loadVerbatimBaselineSource(projectId: string, responseId: string) {
  const [row] = await db
    .select({
      responseId: responses.id,
      rawText: responses.rawText,
      providerId: responses.providerId,
      generationMode: responses.generationMode,
      modelVersion: responses.modelVersion,
      createdAt: responses.createdAt,
      promptText: promptCells.resolvedText,
    })
    .from(responses)
    .innerJoin(promptCells, eq(promptCells.id, responses.cellId))
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(responses.id, responseId),
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    )
    .limit(1);
  if (!row) {
    throw new Error("Measured-AI stimuli can only cite stored audit responses from the same project (C-13)");
  }
  return row;
}

/**
 * M44 / D-114: picker data — stored responses with their client-brand
 * attributes (latest valid extraction per response) plus the derived framing
 * themes. Themes are presentation metadata for browsing; they never gate.
 */
export async function listBaselinePickerData(projectId: string, limit = 60) {
  const responseRows = await db
    .select({
      id: responses.id,
      rawText: responses.rawText,
      providerId: responses.providerId,
      generationMode: responses.generationMode,
      modelVersion: responses.modelVersion,
      createdAt: responses.createdAt,
      promptText: promptCells.resolvedText,
    })
    .from(responses)
    .innerJoin(promptCells, eq(promptCells.id, responses.cellId))
    .innerJoin(auditRuns, eq(auditRuns.id, responses.runId))
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, projectId),
        eq(matrixVersions.kind, "audit"),
        eq(auditRuns.state, "completed"),
      ),
    )
    .orderBy(desc(responses.createdAt))
    .limit(limit);
  if (responseRows.length === 0) {
    return { responses: [], themes: [] as FramingTheme[], themesSource: "attributes" as const };
  }
  const ids = responseRows.map((r) => r.id);
  const attributeRows = await db
    .select({
      responseId: extractions.responseId,
      extractionVersion: extractions.extractionVersion,
      attributesJson: brandMentions.attributesJson,
    })
    .from(extractions)
    .innerJoin(brandMentions, eq(brandMentions.extractionId, extractions.id))
    .innerJoin(brands, eq(brands.id, brandMentions.brandId))
    .where(
      and(
        inArray(extractions.responseId, ids),
        eq(extractions.state, "valid"),
        eq(brands.role, "client"),
      ),
    );
  // Latest valid extraction version per response wins (C-3: re-extraction
  // creates new versions; older versions stay but must not double-count).
  const latestVersion = new Map<string, number>();
  for (const row of attributeRows) {
    const seen = latestVersion.get(row.responseId) ?? 0;
    if (row.extractionVersion > seen) latestVersion.set(row.responseId, row.extractionVersion);
  }
  const attributesByResponse = new Map<string, string[]>();
  for (const row of attributeRows) {
    if (row.extractionVersion !== latestVersion.get(row.responseId)) continue;
    const list = attributesByResponse.get(row.responseId) ?? [];
    const attrs = Array.isArray(row.attributesJson) ? (row.attributesJson as string[]) : [];
    attributesByResponse.set(row.responseId, [...list, ...attrs.filter((a) => typeof a === "string")]);
  }
  // M44 / D-114 themes v2: when blind framing observations exist, cluster
  // them over their stored vectors (pure math, $0 at read time); otherwise
  // fall back to v1 attribute grouping. Source is reported so the UI can
  // label machine-grouped provenance and offer the extraction affordance.
  const observationRows = await db
    .select({
      responseId: framingObservations.responseId,
      version: framingObservations.version,
      state: framingObservations.state,
      observationsJson: framingObservations.observationsJson,
      vectorsJson: framingObservations.vectorsJson,
    })
    .from(framingObservations)
    .where(inArray(framingObservations.responseId, ids));
  const latestByResponse = new Map<string, (typeof observationRows)[number]>();
  for (const row of observationRows) {
    const seen = latestByResponse.get(row.responseId);
    if (!seen || row.version > seen.version) latestByResponse.set(row.responseId, row);
  }
  const validObservations = [...latestByResponse.values()].filter((r) => r.state === "valid");
  // M46/D-117: surface the first verbatim observation quote for picker rows.
  const quoteByResponse = new Map<string, string>();
  for (const row of validObservations) {
    const observations = Array.isArray(row.observationsJson)
      ? (row.observationsJson as Array<{ quote?: unknown }>)
      : [];
    const quote = observations
      .map((o) => (typeof o?.quote === "string" ? o.quote.trim() : ""))
      .find((q) => q.length > 0);
    if (quote) quoteByResponse.set(row.responseId, quote);
  }
  const mapResponses = () =>
    responseRows.map((r) => ({
      ...r,
      attributes: attributesByResponse.get(r.id) ?? [],
      observationQuote: quoteByResponse.get(r.id) ?? null,
    }));
  if (validObservations.length > 0) {
    const clusterInput = validObservations
      .map((row) => {
        const observations = Array.isArray(row.observationsJson)
          ? (row.observationsJson as Array<{ phrase?: unknown }>)
          : [];
        const vectors = Array.isArray(row.vectorsJson) ? (row.vectorsJson as number[][]) : [];
        return {
          responseId: row.responseId,
          phrases: observations.map((o) => String(o?.phrase ?? "")).filter((p) => p !== ""),
          vectors,
        };
      })
      .filter((row) => row.phrases.length > 0 && row.phrases.length === row.vectors.length)
      .sort((a, b) => a.responseId.localeCompare(b.responseId));
    const themes = clusterFramingObservations(clusterInput, responseRows.length);
    if (themes.length > 0) {
      return {
        responses: mapResponses(),
        themes,
        themesSource: "framing_observations" as const,
      };
    }
  }
  const themeSource = responseRows.map((r) => ({
    responseId: r.id,
    attributes: attributesByResponse.get(r.id) ?? [],
  }));
  return {
    responses: mapResponses(),
    themes: groupResponsesByAttributeThemes(themeSource),
    themesSource: "attributes" as const,
  };
}

/** Build the immutable D-114 baseline stamp for a picked response. */
async function buildBaselineStamp(
  projectId: string,
  source: Awaited<ReturnType<typeof loadVerbatimBaselineSource>>,
  themeKey: string | null,
): Promise<BaselineStamp> {
  let themeLabel: string | null = null;
  let recurrence: BaselineStamp["recurrence"] = null;
  if (themeKey) {
    const { themes } = await listBaselinePickerData(projectId);
    const theme = themes.find((t) => t.key === themeKey);
    if (theme) {
      themeLabel = theme.label;
      recurrence = { matching: theme.matching, total: theme.total };
    }
  }
  return baselineStampSchema.parse({
    responseId: source.responseId,
    providerId: source.providerId,
    generationMode: source.generationMode,
    modelVersion: source.modelVersion,
    promptText: source.promptText,
    respondedAt: source.createdAt.toISOString(),
    themeLabel,
    recurrence,
  });
}

export async function approveAndCompileResonanceStudy(projectId: string, studyId: string) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      state: string;
      testType: string;
      panelPersonasJson: unknown;
      recommendationScenariosJson: unknown;
      anchorSetVersion: string;
      genericUnconditioned: boolean;
      categoryArchetype: string;
    }>(sql`
      select
        state,
        test_type as "testType",
        panel_personas_json as "panelPersonasJson",
        recommendation_scenarios_json as "recommendationScenariosJson",
        anchor_set_version as "anchorSetVersion",
        generic_unconditioned as "genericUnconditioned",
        p.category_archetype as "categoryArchetype"
      from ${resonanceStudies} s
      join ${projects} p on p.id = s.project_id
      where s.id = ${studyId}
        and s.project_id = ${projectId}
      for update
    `);
    const study = locked.rows[0];
    if (!study) throw new Error("Study not found");
    if (study.state !== "draft") throw new Error("Only draft Resonance studies can be approved");

    const testType: MessageLiftTestType =
      study.testType === "ai_recommendation" ? "ai_recommendation" : "buyer_response";
    const personas =
      testType === "buyer_response" ? panelPersonasSchema.parse(study.panelPersonasJson) : [];
    const scenarios =
      testType === "ai_recommendation"
        ? recommendationScenariosSchema.parse(study.recommendationScenariosJson)
        : [];
    if (testType === "buyer_response" && personas.length === 0) {
      throw new Error("Add at least one buyer profile before approval");
    }
    if (testType === "ai_recommendation" && scenarios.length < 6) {
      throw new Error("AI recommendation tests need at least six eligible shopping situations");
    }
    if (testType === "buyer_response") getSsrAnchorSet(study.anchorSetVersion);

    const stimuli = await tx
      .select()
      .from(resonanceStimuli)
      .where(eq(resonanceStimuli.studyId, studyId))
      .orderBy(asc(resonanceStimuli.position));
    if (stimuli.length !== 2) throw new Error("Message Lift tests compare exactly two messages");
    const unresolved = stimuli.flatMap((stimulus) =>
      unresolvedStimulusPlaceholders({ label: stimulus.label, body: stimulus.body }),
    );
    if (unresolved.length > 0) {
      throw new Error(`Resolve template placeholders before approval: ${[...new Set(unresolved)].join(", ")}`);
    }
    const contexts = testType === "ai_recommendation" ? scenarios : personas;
    validateResonanceCellCount(contexts.length, stimuli.length);

    // M22 (D-078): C-13 is now a hard rule — every study needs a measured_ai
    // stimulus citing real evidence, with no genericUnconditioned escape.
    // The flag is intentionally NOT consulted here anymore; it stays on the
    // row (and in this query, above) purely so existing GENERIC studies
    // keep rendering a truthful historical label on reports/exports/the
    // results page (resonanceExportLabel, report-templates.ts) — it can no
    // longer affect whether a study is APPROVABLE.
    const measured = stimuli.filter((s) => s.kind === "measured_ai");
    if (measured.length === 0) {
      throw new Error("Evidence-conditioned studies need a measured_ai stimulus citing stored audit evidence (C-13)");
    }
    if (measured.length !== 1) {
      throw new Error("Message Lift tests need exactly one stored Current message and one New message");
    }
    for (const stimulus of stimuli) {
      if (stimulus.kind !== "measured_ai" && stimulus.framingEvidenceSnapshotId) {
        throw new Error("Only a measured-AI stimulus may carry framing evidence provenance (C-15)");
      }
    }
    for (const stimulus of measured) {
      const evidenceIds = readEvidenceResponseIds(stimulus.evidenceResponseIdsJson);
      if (stimulus.framingEvidenceSnapshotId) {
        // Codebook-era draft (pre-D-114): keep the original strict checks so
        // legacy drafts stay approvable exactly as their evidence recorded.
        const snapshot = await loadVerifiedFramingSnapshot(
          tx,
          projectId,
          stimulus.framingEvidenceSnapshotId,
        );
        if (snapshot.payload.snapshotVersion !== "m34a-simulation-evidence.v2") {
          throw new Error("Legacy consumer approvals require a live-audit M34A v2 snapshot (C-15)");
        }
        if (stimulus.body !== snapshot.payload.verbatimResponse) {
          throw new Error("Measured-AI baseline must be byte-equal to its snapshotted response (C-15)");
        }
        if (evidenceIds.length !== 1 || evidenceIds[0] !== snapshot.payload.responseId) {
          throw new Error("Measured-AI evidence ids must match the framing snapshot (C-15)");
        }
        continue;
      }
      // D-114 path (all archetypes): stored-response baseline + immutable stamp.
      if (evidenceIds.length === 0) {
        throw new Error("measured_ai stimuli must cite at least one stored audit response (C-13)");
      }
      await assertEvidenceIds(projectId, evidenceIds);
      const stamp = baselineStampSchema.safeParse(stimulus.baselineStampJson);
      if (!stamp.success) {
        throw new Error("Measured-AI baseline is missing its provenance stamp — re-pick the stored response (C-15)");
      }
      if (stamp.data.responseId !== evidenceIds[0]) {
        throw new Error("Baseline stamp must reference the cited stored response (C-15)");
      }
      const source = await loadVerbatimBaselineSource(projectId, stamp.data.responseId);
      if (stimulus.body !== source.rawText) {
        throw new Error("Measured-AI baseline must be byte-equal to its stored response (C-13/C-15)");
      }
    }

    const [{ latest }] = await tx
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const cellCount = contexts.length * stimuli.length;
    const baseline = measured[0] ?? stimuli[0];
    const [version] = await tx
      .insert(matrixVersions)
      .values({
        projectId,
        kind: "resonance",
        resonanceStudyId: studyId,
        version: (latest ?? 0) + 1,
        state: "approved",
        approvedAt: new Date(),
        cellCount,
      })
      .returning({ id: matrixVersions.id, version: matrixVersions.version });

    const parityByContext = new Map<string, string>();
    for (const context of contexts) {
      for (const stimulus of stimuli) {
        const compiled =
          testType === "ai_recommendation"
            ? compileRecommendationPrompt({
                scenario: context as RecommendationScenario,
                stimulus: {
                  id: stimulus.id,
                  kind: stimulus.kind as StimulusKind,
                  label: stimulus.label,
                  body: stimulus.body,
                  position: stimulus.position,
                },
              })
            : compileBuyerResponsePrompt({
                persona: context as PanelPersona,
                stimulus: {
                  id: stimulus.id,
                  kind: stimulus.kind as StimulusKind,
                  label: stimulus.label,
                  body: stimulus.body,
                  position: stimulus.position,
                },
                genericUnconditioned: study.genericUnconditioned,
              });
        const seenParity = parityByContext.get(context.key);
        if (seenParity !== undefined && seenParity !== compiled.parityText) {
          throw new Error(`A/B prompt parity failed for ${context.label}`);
        }
        parityByContext.set(context.key, compiled.parityText);
        await tx.insert(promptCells).values({
          matrixVersionId: version.id,
          intent: "simulation",
          personaId: null,
          marketId: null,
          stimulusId: stimulus.id,
          panelPersonaKey: context.key,
          variantKey: `${stimulus.position}-${stimulus.kind}`,
          resolvedText: compiled.resolvedText,
          competitorOrderJson: [],
          brandOrderJson: [],
        });
      }
    }

    const approvedStudy = await tx
      .update(resonanceStudies)
      .set({
        state: "approved",
        baselineStimulusId: baseline.id,
        promptProtocolVersion:
          testType === "ai_recommendation"
            ? RECOMMENDATION_PROMPT_PROTOCOL_VERSION
            : RESONANCE_PROMPT_PROTOCOL_VERSION,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(resonanceStudies.id, studyId),
          eq(resonanceStudies.projectId, projectId),
          eq(resonanceStudies.state, "draft"),
        ),
      )
      .returning({ id: resonanceStudies.id });
    if (approvedStudy.length === 0) {
      throw new Error("Only draft Resonance studies can be approved");
    }

    return version;
  });
}
