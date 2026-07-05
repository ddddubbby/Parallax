import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import {
  type PanelPersona,
  renderResonancePrompt,
  type StimulusKind,
  validateResonanceCellCount,
} from "@/core/resonance";
import { getSsrAnchorSet } from "@/core/ssr-anchors";
import { db } from "../client";
import {
  auditRuns,
  matrixVersions,
  promptCells,
  resonanceStimuli,
  resonanceStudies,
  responses,
} from "../schema";

export interface ResonanceStudyPatch {
  name?: string;
  panelPersonas?: PanelPersona[];
  genericUnconditioned?: boolean;
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

export async function addResonanceStimulus(input: {
  studyId: string;
  kind: StimulusKind;
  label: string;
  body: string;
  evidenceResponseIds: string[];
}) {
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
  const deleted = await db
    .delete(resonanceStimuli)
    .where(and(eq(resonanceStimuli.id, stimulusId), eq(resonanceStimuli.studyId, studyId)))
    .returning({ id: resonanceStimuli.id });
  return deleted.length;
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
