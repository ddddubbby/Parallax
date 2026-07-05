import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import {
  type PanelPersona,
  renderResonancePrompt,
  type StimulusKind,
  validateResonanceCellCount,
} from "@/core/resonance";
import type { ResonanceStudyTemplate } from "@/core/resonance-templates";
import { unresolvedStimulusPlaceholders } from "@/core/resonance-templates";
import { getSsrAnchorSet } from "@/core/ssr-anchors";
import { db } from "../client";
import {
  auditRuns,
  metrics,
  matrixVersions,
  promptCells,
  resonanceStimuli,
  resonanceStudies,
  responses,
} from "../schema";
import { getEligibleExtractionsForRun } from "./extraction";

export interface ResonanceStudyPatch {
  name?: string;
  panelPersonas?: PanelPersona[];
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
  label: string;
  baselineStimulusId: string;
  baselineLabel: string;
  n: number;
  deltaPiMean: number;
  directionalOnly: boolean;
}

export interface ResonanceStudyResults {
  study: {
    id: string;
    name: string;
    genericUnconditioned: boolean;
    anchorSetVersion: string;
    anchorSetCalibrated: boolean;
  };
  run: {
    id: string;
    runMode: string;
    completedAt: Date | null;
    repetitions: number;
  };
  variants: ResonanceVariantResult[];
  personaRows: ResonancePersonaResult[];
  deltas: ResonanceDeltaResult[];
}

type PmfMetricMetadata = {
  pmf?: unknown;
  stimulusKind?: unknown;
  label?: unknown;
  sufficientN?: unknown;
  directionalOnly?: unknown;
};

type DeltaMetricMetadata = {
  baselineStimulusId?: unknown;
};

type SsrPayload = {
  kind?: unknown;
  pmf?: unknown;
  meanScore?: unknown;
};

function readPmf(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 5) return [0, 0, 0, 0, 0];
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : 0));
}

function readSsrPayload(payload: unknown): { pmf: number[]; meanScore: number } | null {
  const parsed = payload as SsrPayload | null;
  if (!parsed || parsed.kind !== "ssr") return null;
  const pmf = readPmf(parsed.pmf);
  if (pmf.every((value) => value === 0)) return null;
  if (typeof parsed.meanScore !== "number" || !Number.isFinite(parsed.meanScore)) return null;
  return { pmf, meanScore: parsed.meanScore };
}

function personaLabel(personas: PanelPersona[], key: string) {
  return personas.find((persona) => persona.key === key)?.label ?? key;
}

export async function listResonanceStudies(projectId: string) {
  const studies = await db
    .select()
    .from(resonanceStudies)
    .where(eq(resonanceStudies.projectId, projectId))
    .orderBy(desc(resonanceStudies.createdAt));

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
  return studies.map((study) => ({
    study,
    stimuli: stimuli.filter((s) => s.studyId === study.id),
    matrixVersion: versions.find((v) => v.studyId === study.id && v.state === "approved") ?? null,
  }));
}

export async function getResonanceStudyResults(
  projectId: string,
  studyId: string,
  runId?: string,
): Promise<ResonanceStudyResults | null> {
  const [study] = await db
    .select()
    .from(resonanceStudies)
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

  const personas = study.panelPersonasJson as PanelPersona[];
  const anchorSet = getSsrAnchorSet(study.anchorSetVersion);
  const cellById = new Map(cellRows.map((cell) => [cell.id, cell]));
  const responseById = new Map(responseRows.map((response) => [response.id, response]));
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
    if (!evidenceByStimulus.has(cell.stimulusId)) evidenceByStimulus.set(cell.stimulusId, []);
    evidenceByStimulus.get(cell.stimulusId)?.push(row);
    const personaKey = `${cell.stimulusId}|${cell.panelPersonaKey}`;
    if (!evidenceByStimulusPersona.has(personaKey)) evidenceByStimulusPersona.set(personaKey, []);
    evidenceByStimulusPersona.get(personaKey)?.push(row);
  }

  const variantById = new Map<string, ResonanceVariantResult>();
  const variants = metricRows
    .filter((row) => row.scopeType === "resonance_variant" && row.metricKey === "pi_mean")
    .map((row) => {
      const metadata = row.metadataJson as PmfMetricMetadata;
      const result: ResonanceVariantResult = {
        stimulusId: row.scopeKey,
        stimulusKind: typeof metadata.stimulusKind === "string" ? metadata.stimulusKind : "custom",
        label: typeof metadata.label === "string" ? metadata.label : row.scopeKey,
        n: row.n,
        piMean: row.value,
        pmf: readPmf(metadata.pmf),
        sufficientN: metadata.sufficientN === true,
        responses: evidenceByStimulus.get(row.scopeKey) ?? [],
      };
      variantById.set(result.stimulusId, result);
      return result;
    })
    .sort((a, b) => b.piMean - a.piMean || a.label.localeCompare(b.label));

  const personaRows = metricRows
    .filter((row) => row.scopeType === "resonance_variant_persona" && row.metricKey === "pi_mean")
    .map((row) => {
      const [stimulusId, panelPersonaKey = "unknown"] = row.scopeKey.split("|");
      const metadata = row.metadataJson as PmfMetricMetadata;
      const label = typeof metadata.label === "string" ? metadata.label : variantById.get(stimulusId)?.label ?? stimulusId;
      return {
        key: row.scopeKey,
        stimulusId,
        panelPersonaKey,
        panelPersonaLabel: personaLabel(personas, panelPersonaKey),
        stimulusLabel: label,
        n: row.n,
        piMean: row.value,
        pmf: readPmf(metadata.pmf),
        directionalOnly: metadata.directionalOnly === true,
        responses: evidenceByStimulusPersona.get(row.scopeKey) ?? [],
      };
    })
    .sort((a, b) => a.panelPersonaLabel.localeCompare(b.panelPersonaLabel) || b.piMean - a.piMean);

  const deltas = metricRows
    .filter((row) => row.scopeType === "resonance_delta" && row.metricKey === "delta_pi_mean")
    .map((row) => {
      const metadata = row.metadataJson as DeltaMetricMetadata;
      const baselineStimulusId = typeof metadata.baselineStimulusId === "string" ? metadata.baselineStimulusId : "";
      const variant = variantById.get(row.scopeKey);
      const baseline = variantById.get(baselineStimulusId);
      return {
        stimulusId: row.scopeKey,
        label: variant?.label ?? row.scopeKey,
        baselineStimulusId,
        baselineLabel: baseline?.label ?? baselineStimulusId,
        n: row.n,
        deltaPiMean: row.value,
        directionalOnly: !(variant?.sufficientN && baseline?.sufficientN),
      };
    })
    .sort((a, b) => b.deltaPiMean - a.deltaPiMean || a.label.localeCompare(b.label));

  return {
    study: {
      id: study.id,
      name: study.name,
      genericUnconditioned: study.genericUnconditioned,
      anchorSetVersion: study.anchorSetVersion,
      anchorSetCalibrated: anchorSet.calibrated,
    },
    run,
    variants,
    personaRows,
    deltas,
  };
}

export async function createResonanceStudy(projectId: string, name: string) {
  const [study] = await db
    .insert(resonanceStudies)
    .values({
      projectId,
      name,
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
  return study;
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
  if (patch.panelPersonas !== undefined) values.panelPersonasJson = patch.panelPersonas;
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
async function assertStudyIsDraft(studyId: string) {
  const [study] = await db
    .select({ state: resonanceStudies.state })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, studyId));
  if (!study) throw new Error("Study not found");
  if (study.state !== "draft") {
    throw new Error("This study is approved and frozen (C-4); create a new study to change stimuli");
  }
}

export async function addResonanceStimulus(input: {
  studyId: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIds: string[];
}) {
  await assertStudyIsDraft(input.studyId);
  const [{ latest }] = await db
    .select({ latest: max(resonanceStimuli.position) })
    .from(resonanceStimuli)
    .where(eq(resonanceStimuli.studyId, input.studyId));
  const [row] = await db
    .insert(resonanceStimuli)
    .values({
      studyId: input.studyId,
      kind: input.kind,
      label: input.label,
      body: input.body,
      evidenceResponseIdsJson: input.evidenceResponseIds,
      position: (latest ?? 0) + 1,
    })
    .returning({ id: resonanceStimuli.id });
  return row;
}

export async function updateResonanceStimulus(input: {
  studyId: string;
  stimulusId: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIds: string[];
}) {
  await assertStudyIsDraft(input.studyId);
  const updated = await db
    .update(resonanceStimuli)
    .set({
      kind: input.kind,
      label: input.label,
      body: input.body,
      evidenceResponseIdsJson: input.evidenceResponseIds,
      updatedAt: new Date(),
    })
    .where(and(eq(resonanceStimuli.id, input.stimulusId), eq(resonanceStimuli.studyId, input.studyId)))
    .returning({ id: resonanceStimuli.id });
  return updated.length;
}

export async function deleteResonanceStimulus(studyId: string, stimulusId: string) {
  await assertStudyIsDraft(studyId);
  const deleted = await db
    .delete(resonanceStimuli)
    .where(and(eq(resonanceStimuli.id, stimulusId), eq(resonanceStimuli.studyId, studyId)))
    .returning({ id: resonanceStimuli.id });
  return deleted.length;
}

export async function getResonanceStudyAnchorSetVersion(studyId: string): Promise<string | null> {
  const [study] = await db
    .select({ anchorSetVersion: resonanceStudies.anchorSetVersion })
    .from(resonanceStudies)
    .where(eq(resonanceStudies.id, studyId));
  return study?.anchorSetVersion ?? null;
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
      ),
    );
  const found = new Set(rows.map((r) => r.id));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new Error("Measured-AI stimuli can only cite stored audit responses from the same project (C-13)");
  }
}

export async function approveAndCompileResonanceStudy(projectId: string, studyId: string) {
  const [study] = await db
    .select()
    .from(resonanceStudies)
    .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.projectId, projectId)));
  if (!study) throw new Error("Study not found");
  if (study.state !== "draft") throw new Error("Only draft Resonance studies can be approved");

  const personas = study.panelPersonasJson as PanelPersona[];
  if (personas.length === 0) throw new Error("Add at least one panel persona before approval");
  getSsrAnchorSet(study.anchorSetVersion);

  const stimuli = await db
    .select()
    .from(resonanceStimuli)
    .where(eq(resonanceStimuli.studyId, studyId))
    .orderBy(asc(resonanceStimuli.position));
  if (stimuli.length < 2) throw new Error("Add at least two stimulus variants before approval");
  const unresolved = stimuli.flatMap((stimulus) =>
    unresolvedStimulusPlaceholders({ label: stimulus.label, body: stimulus.body }),
  );
  if (unresolved.length > 0) {
    throw new Error(`Resolve template placeholders before approval: ${[...new Set(unresolved)].join(", ")}`);
  }
  validateResonanceCellCount(personas.length, stimuli.length);

  const measured = stimuli.filter((s) => s.kind === "measured_ai");
  if (!study.genericUnconditioned && measured.length === 0) {
    throw new Error("Evidence-conditioned studies need a measured_ai stimulus, or enable GENERIC unconditioned mode (C-13)");
  }
  for (const stimulus of measured) {
    const evidenceIds = (stimulus.evidenceResponseIdsJson as string[]) ?? [];
    if (!study.genericUnconditioned && evidenceIds.length === 0) {
      throw new Error("measured_ai stimuli must cite at least one stored audit response (C-13)");
    }
    await assertEvidenceIds(projectId, evidenceIds);
  }

  return db.transaction(async (tx) => {
    const [{ latest }] = await tx
      .select({ latest: max(matrixVersions.version) })
      .from(matrixVersions)
      .where(eq(matrixVersions.projectId, projectId));
    const cellCount = personas.length * stimuli.length;
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

    for (const persona of personas) {
      for (const stimulus of stimuli) {
        await tx.insert(promptCells).values({
          matrixVersionId: version.id,
          intent: "simulation",
          personaId: null,
          marketId: null,
          stimulusId: stimulus.id,
          panelPersonaKey: persona.key,
          variantKey: `${stimulus.position}-${stimulus.kind}`,
          resolvedText: renderResonancePrompt({
            persona,
            stimulus: {
              id: stimulus.id,
              kind: stimulus.kind as StimulusKind,
              label: stimulus.label,
              body: stimulus.body,
              position: stimulus.position,
            },
            genericUnconditioned: study.genericUnconditioned,
          }),
          competitorOrderJson: [],
        });
      }
    }

    await tx
      .update(resonanceStudies)
      .set({
        state: "approved",
        baselineStimulusId: baseline.id,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(resonanceStudies.id, studyId), eq(resonanceStudies.state, "draft")));

    return version;
  });
}
