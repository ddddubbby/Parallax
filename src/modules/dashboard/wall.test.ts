import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import {
  getResponseDetail,
  getResponsesByIds,
  getResponsesForMetric,
  getResponsesForScope,
  getCitedSources,
  getMisinformationRegister,
  getRunForDashboard,
  listCompletedResonanceRuns,
  listCompletedRuns,
  reviewClaim,
} from "@/db/repositories/dashboard";
import { getExportCitations } from "@/db/repositories/export";
import {
  auditRuns,
  brands,
  claimsFound,
  extractions,
  jobs,
  matrixVersions,
  projects,
  promptCells,
  resonanceStimuli,
  resonanceStudies,
  responses,
} from "@/db/schema";

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const created = {
  projectIds: [] as string[],
  brandIds: [] as string[],
  studyIds: [] as string[],
  stimulusIds: [] as string[],
  versionIds: [] as string[],
  runIds: [] as string[],
  cellIds: [] as string[],
  jobIds: [] as string[],
  responseIds: [] as string[],
  claimIds: [] as string[],
};

afterAll(async () => {
  for (const claimId of created.claimIds) {
    await db.delete(claimsFound).where(eq(claimsFound.id, claimId)).catch(() => {});
  }
  for (const responseId of created.responseIds) {
    await db.delete(extractions).where(eq(extractions.responseId, responseId)).catch(() => {});
  }
  for (const responseId of created.responseIds) {
    await db.delete(responses).where(eq(responses.id, responseId)).catch(() => {});
  }
  for (const jobId of created.jobIds) {
    await db.delete(jobs).where(eq(jobs.id, jobId)).catch(() => {});
  }
  for (const runId of created.runIds) {
    await db.delete(auditRuns).where(eq(auditRuns.id, runId)).catch(() => {});
  }
  for (const cellId of created.cellIds) {
    await db.delete(promptCells).where(eq(promptCells.id, cellId)).catch(() => {});
  }
  for (const versionId of created.versionIds) {
    await db.delete(matrixVersions).where(eq(matrixVersions.id, versionId)).catch(() => {});
  }
  for (const stimulusId of created.stimulusIds) {
    await db.delete(resonanceStimuli).where(eq(resonanceStimuli.id, stimulusId)).catch(() => {});
  }
  for (const studyId of created.studyIds) {
    await db.delete(resonanceStudies).where(eq(resonanceStudies.id, studyId)).catch(() => {});
  }
  for (const brandId of created.brandIds) {
    await db.delete(brands).where(eq(brands.id, brandId)).catch(() => {});
  }
  for (const projectId of created.projectIds) {
    await db.delete(projects).where(eq(projects.id, projectId)).catch(() => {});
  }
  await pool.end().catch(() => {});
});

async function createCompletedResonanceResponse() {
  const suffix = randomUUID().slice(0, 8);
  const [project] = await db
    .insert(projects)
    .values({
      name: `Dashboard Resonance Wall ${suffix}`,
      slug: `dashboard-resonance-wall-${suffix}`,
      category: "synthetic research",
      jobToBeDone: "test audit dashboard read walls",
      status: "active",
    })
    .returning();
  created.projectIds.push(project.id);

  const [study] = await db
    .insert(resonanceStudies)
    .values({
      projectId: project.id,
      name: `Dashboard Resonance Wall ${suffix}`,
      state: "approved",
      panelPersonasJson: [
        {
          key: "budget_owner",
          label: "Budget owner",
          ageBand: "35-44",
          incomeBand: "$150k-$250k",
          location: "US",
          behavioralProfile: "Owns software budget",
        },
      ],
      anchorSetVersion: "purchase_intent.v1",
      genericUnconditioned: true,
      approvedAt: new Date(),
    })
    .returning();
  created.studyIds.push(study.id);

  const [stimulus] = await db
    .insert(resonanceStimuli)
    .values({
      studyId: study.id,
      kind: "custom",
      label: "Dashboard variant",
      body: "LedgerFox is framed for simulated buyers.",
      evidenceResponseIdsJson: [],
      position: 0,
    })
    .returning();
  created.stimulusIds.push(stimulus.id);

  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId: project.id,
      version: 1,
      state: "approved",
      kind: "resonance",
      resonanceStudyId: study.id,
      cellCount: 1,
      approvedAt: new Date(),
    })
    .returning();
  created.versionIds.push(version.id);

  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version.id,
      intent: "simulation",
      stimulusId: stimulus.id,
      panelPersonaKey: "budget_owner",
      variantKey: "dashboard-wall",
      resolvedText: "Simulated buyer reaction prompt",
    })
    .returning();
  created.cellIds.push(cell.id);

  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 1,
      costCapUsd: "0",
      completedAt: new Date(),
    })
    .returning();
  created.runIds.push(run.id);

  const [job] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      repIndex: 0,
      state: "succeeded",
    })
    .returning();
  created.jobIds.push(job.id);

  const [response] = await db
    .insert(responses)
    .values({
      jobId: job.id,
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      modelVersion: "mock",
      rawText: "simulated response text must never appear in audit dashboard drilldown",
    })
    .returning();
  created.responseIds.push(response.id);

  await db
    .insert(extractions)
    .values({
      responseId: response.id,
      extractionVersion: 1,
      state: "valid",
      extractedJson: {
        kind: "ssr",
        resonance_variant: "measured_ai",
        resonance_variant_persona: "budget_owner",
        resonance_delta: 0.2,
      },
    })
    .returning();

  return { run, response };
}

async function createCompletedAuditCitationResponse() {
  const suffix = randomUUID().slice(0, 8);
  const [project] = await db
    .insert(projects)
    .values({
      name: `Dashboard Citation Split ${suffix}`,
      slug: `dashboard-citation-split-${suffix}`,
      category: "AP automation",
      jobToBeDone: "test cited-source splits",
      status: "active",
    })
    .returning();
  created.projectIds.push(project.id);

  const [client, competitor] = await db
    .insert(brands)
    .values([
      { projectId: project.id, role: "client", name: "LedgerFox" },
      { projectId: project.id, role: "competitor", name: "SpendPilot" },
    ])
    .returning();
  created.brandIds.push(client.id, competitor.id);

  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId: project.id,
      version: 1,
      state: "approved",
      kind: "audit",
      cellCount: 1,
      approvedAt: new Date(),
    })
    .returning();
  created.versionIds.push(version.id);

  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version.id,
      intent: "discovery",
      variantKey: "citation-split",
      resolvedText: "Which AP automation tools are relevant?",
    })
    .returning();
  created.cellIds.push(cell.id);

  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["grounded"],
      plannedCalls: 1,
      costCapUsd: "0",
      completedAt: new Date(),
    })
    .returning();
  created.runIds.push(run.id);

  const [job] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "grounded",
      repIndex: 0,
      state: "succeeded",
    })
    .returning();
  created.jobIds.push(job.id);

  const [response] = await db
    .insert(responses)
    .values({
      jobId: job.id,
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "grounded",
      modelVersion: "mock",
      rawText: "grounded audit response",
    })
    .returning();
  created.responseIds.push(response.id);

  await db.insert(extractions).values({
    responseId: response.id,
    extractionVersion: 1,
    state: "valid",
    extractedJson: {
      refusal: false,
      citations: [
        {
          url: "https://stale.example/old",
          domain: "stale.example",
          title: "Stale citation",
          cited_for_brand_ids: [client.id],
        },
      ],
    },
  });

  await db.insert(extractions).values({
    responseId: response.id,
    extractionVersion: 2,
    state: "valid",
    extractedJson: {
      refusal: false,
      citations: [
        {
          url: "https://proof.example/client",
          domain: "proof.example",
          title: "Client proof",
          cited_for_brand_ids: [client.id],
        },
        {
          url: "https://proof.example/competitor",
          domain: "proof.example",
          title: "Competitor proof",
          cited_for_brand_ids: [competitor.id],
        },
        {
          url: "https://proof.example/both",
          domain: "proof.example",
          title: "Shared proof",
          cited_for_brand_ids: [client.id, competitor.id],
        },
      ],
    },
  });

  return { run };
}

async function createAuditResponseWithStaleMisinformationClaim() {
  const suffix = randomUUID().slice(0, 8);
  const [project] = await db
    .insert(projects)
    .values({
      name: `Dashboard Latest Claim ${suffix}`,
      slug: `dashboard-latest-claim-${suffix}`,
      category: "AP automation",
      jobToBeDone: "test latest extraction misinformation",
      status: "active",
    })
    .returning();
  created.projectIds.push(project.id);

  const [client] = await db
    .insert(brands)
    .values({ projectId: project.id, role: "client", name: "LedgerFox" })
    .returning();
  created.brandIds.push(client.id);

  const [version] = await db
    .insert(matrixVersions)
    .values({
      projectId: project.id,
      version: 1,
      state: "approved",
      kind: "audit",
      cellCount: 1,
      approvedAt: new Date(),
    })
    .returning();
  created.versionIds.push(version.id);

  const [cell] = await db
    .insert(promptCells)
    .values({
      matrixVersionId: version.id,
      intent: "discovery",
      variantKey: "latest-claim",
      resolvedText: "Which AP automation tools are relevant?",
    })
    .returning();
  created.cellIds.push(cell.id);

  const [run] = await db
    .insert(auditRuns)
    .values({
      projectId: project.id,
      matrixVersionId: version.id,
      runMode: "mock",
      state: "completed",
      repetitions: 1,
      selectedProvidersJson: ["mock"],
      selectedModesJson: ["ungrounded"],
      plannedCalls: 1,
      costCapUsd: "0",
      completedAt: new Date(),
    })
    .returning();
  created.runIds.push(run.id);

  const [job] = await db
    .insert(jobs)
    .values({
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      repIndex: 0,
      state: "succeeded",
    })
    .returning();
  created.jobIds.push(job.id);

  const [response] = await db
    .insert(responses)
    .values({
      jobId: job.id,
      runId: run.id,
      cellId: cell.id,
      providerId: "mock",
      generationMode: "ungrounded",
      modelVersion: "mock",
      rawText: "first extraction had a bad claim, latest re-extraction corrected it",
    })
    .returning();
  created.responseIds.push(response.id);

  const [staleExtraction] = await db
    .insert(extractions)
    .values({
      responseId: response.id,
      extractionVersion: 1,
      state: "valid",
      extractedJson: { refusal: false, brands: [], citations: [], claims: [] },
    })
    .returning();
  const [claim] = await db
    .insert(claimsFound)
    .values({
      extractionId: staleExtraction.id,
      brandId: client.id,
      claimText: "LedgerFox offers an unsupported guarantee.",
      claimType: "feature",
      extractedVerdict: "unsupported",
      extractedSeverity: "high",
      evidenceQuote: "unsupported guarantee",
    })
    .returning();
  created.claimIds.push(claim.id);

  await db.insert(extractions).values({
    responseId: response.id,
    extractionVersion: 2,
    state: "valid",
    extractedJson: { refusal: false, brands: [], citations: [], claims: [] },
  });

  return { run, claim };
}

async function createAuditResponseWithLatestDeadLetteredExtraction() {
  const { run } = await createCompletedAuditCitationResponse();
  const [response] = await db.select().from(responses).where(eq(responses.runId, run.id)).limit(1);
  await db.insert(extractions).values({
    responseId: response.id,
    extractionVersion: 3,
    state: "dead_lettered",
    validationError: "latest extraction failed after an older valid extraction",
    extractedJson: { refusal: false, brands: [], citations: [], claims: [] },
  });
  return { run, response };
}

describe.skipIf(!dbUp)("dashboard audit/resonance read wall (C-12)", () => {
  it("excludes resonance responses from audit dashboard drilldown and detail readers", async () => {
    const { run, response } = await createCompletedResonanceResponse();

    await expect(getResponsesForScope(run.id, {}, 25)).resolves.toEqual([]);
    await expect(getResponsesForMetric(run.id, { metricKey: "resonance_mean" }, 25)).resolves.toEqual([]);
    await expect(getResponsesByIds(run.id, [response.id])).resolves.toEqual([]);
    await expect(getResponseDetail(run.id, response.id)).resolves.toBeNull();
  });

  it("does not show dashboard detail for responses whose latest extraction is ineligible", async () => {
    const { run, response } = await createAuditResponseWithLatestDeadLetteredExtraction();

    await expect(getResponsesForScope(run.id, {}, 25)).resolves.toEqual([]);
    await expect(getResponsesByIds(run.id, [response.id])).resolves.toEqual([]);
    await expect(getResponseDetail(run.id, response.id)).resolves.toBeNull();
  });

  it("splits cited-source counts by resolved client and competitor brand ids", async () => {
    const { run } = await createCompletedAuditCitationResponse();

    const sources = await getCitedSources(run.id);
    const proof = sources.find((source) => source.domain === "proof.example");
    expect(proof).toMatchObject({
      total: 3,
      citesClient: 2,
      citesCompetitor: 2,
    });

    const exported = await getExportCitations(run.id);
    expect(exported.map((row) => row.domain)).toEqual(["proof.example", "proof.example", "proof.example"]);
  });

  it("ignores stale misinformation claims from superseded extraction versions (D-014/C-3)", async () => {
    const { run, claim } = await createAuditResponseWithStaleMisinformationClaim();

    await expect(getMisinformationRegister(run.id)).resolves.toEqual([]);
    await expect(reviewClaim(run.id, claim.id, { reviewState: "confirmed" })).resolves.toBe(0);
  });

  it("keeps paused runs inspectable on dashboards but out of report selectors", async () => {
    const { run: auditRun } = await createCompletedAuditCitationResponse();
    await db.update(auditRuns).set({ state: "paused" }).where(eq(auditRuns.id, auditRun.id));

    const dashboardAuditRuns = await listCompletedRuns(auditRun.projectId);
    const reportAuditRuns = await listCompletedRuns(auditRun.projectId, { includePaused: false });
    expect(dashboardAuditRuns.map((run) => run.id)).toContain(auditRun.id);
    expect(reportAuditRuns.map((run) => run.id)).not.toContain(auditRun.id);
    expect(await getRunForDashboard(auditRun.id)).toMatchObject({ id: auditRun.id, state: "paused" });

    const { run: resonanceRun } = await createCompletedResonanceResponse();
    await db.update(auditRuns).set({ state: "paused" }).where(eq(auditRuns.id, resonanceRun.id));

    const dashboardResonanceRuns = await listCompletedResonanceRuns(resonanceRun.projectId);
    const reportResonanceRuns = await listCompletedResonanceRuns(resonanceRun.projectId, { includePaused: false });
    expect(dashboardResonanceRuns.map((run) => run.id)).toContain(resonanceRun.id);
    expect(reportResonanceRuns.map((run) => run.id)).not.toContain(resonanceRun.id);
  });

  it("does not expose running audit runs through dashboard data loaders", async () => {
    const { run } = await createCompletedAuditCitationResponse();
    await db.update(auditRuns).set({ state: "running" }).where(eq(auditRuns.id, run.id));

    expect(await getRunForDashboard(run.id)).toBeNull();
    expect((await listCompletedRuns(run.projectId)).map((row) => row.id)).not.toContain(run.id);
    expect(await getResponsesForScope(run.id, {})).toEqual([]);
    expect(await getResponseDetail(run.id, created.responseIds.at(-1) ?? "")).toBeNull();
  });
});
