// M19: $0 Resonance walkthrough for the seeded demo project. Idempotent:
// reuses existing completed mock audit/resonance runs and only creates the
// missing study/run artifacts. Run: pnpm demo:resonance
import "../src/env-bootstrap";
import { spawn } from "node:child_process";
import { and, desc, eq } from "drizzle-orm";
import { allocateMatrix } from "../src/core/matrix";
import type { PanelPersona, StimulusKind } from "../src/core/resonance";
import { db, pool } from "../src/db/client";
import { recomputeMetrics } from "../src/db/repositories/metrics";
import { approveVersion, createDraftVersion, getMatrixInputs } from "../src/db/repositories/matrix";
import {
  addResonanceStimulus,
  approveAndCompileResonanceStudy,
  createResonanceStudy,
  listResonanceStudies,
  updateResonanceStudy,
} from "../src/db/repositories/resonance";
import { createRun, getRun } from "../src/db/repositories/runner";
import { auditRuns, matrixVersions, projects, responses } from "../src/db/schema";
import { computeFindings } from "../src/modules/analysis/findings";
import { generateReport, generateResonanceReport } from "../src/modules/report/service";

const SLUG = "ledgerfox-demo";
const STUDY_NAME = "Demo Resonance lower-funnel study";

const PERSONAS: PanelPersona[] = [
  {
    key: "p1",
    label: "Finance lead",
    ageBand: "35-44",
    incomeBand: "$100k-$150k",
    locationContext: "United States",
    behavioralProfile: "compares proof carefully before taking a vendor call",
  },
  {
    key: "p2",
    label: "Operations owner",
    ageBand: "45-54",
    incomeBand: "$150k-$200k",
    locationContext: "United States",
    behavioralProfile: "prefers low-risk tools with clear implementation detail",
  },
  {
    key: "p3",
    label: "Founder buyer",
    ageBand: "30-39",
    incomeBand: "$200k+",
    locationContext: "United States",
    behavioralProfile: "moves quickly when the business case is concrete",
  },
  {
    key: "p4",
    label: "Procurement evaluator",
    ageBand: "35-44",
    incomeBand: "$75k-$100k",
    locationContext: "United States",
    behavioralProfile: "looks for credible claims and clean vendor comparisons",
  },
  {
    key: "p5",
    label: "IT stakeholder",
    ageBand: "40-49",
    incomeBand: "$100k-$150k",
    locationContext: "United States",
    behavioralProfile: "cares about security proof and integration burden",
  },
  {
    key: "p6",
    label: "Controller",
    ageBand: "50-59",
    incomeBand: "$150k-$200k",
    locationContext: "United States",
    behavioralProfile: "needs accuracy and auditability before approving change",
  },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnWorker() {
  const tsxLoader = new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const workerEntry = new URL("../src/worker/index.ts", import.meta.url).pathname;
  const child = spawn(process.execPath, ["--import", tsxLoader, workerEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`  [worker] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`  [worker:err] ${d}`));
  return child;
}

async function waitForTerminal(runId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run && ["completed", "failed", "cancelled", "paused"].includes(run.state)) return run;
    await sleep(500);
  }
  throw new Error(`Run did not finish within ${timeoutMs}ms`);
}

async function ensureAuditMatrix(projectId: string): Promise<string> {
  const [approved] = await db
    .select({ id: matrixVersions.id })
    .from(matrixVersions)
    .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.kind, "audit"), eq(matrixVersions.state, "approved")));
  if (approved) return approved.id;

  const inputs = await getMatrixInputs(projectId);
  if (!inputs || !inputs.client) throw new Error("demo intake incomplete — run pnpm db:seed");
  const ctx = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
    competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
    attributes: inputs.attributes,
  };
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target: 40 });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  return draft.id;
}

async function ensureCompletedRun(input: { projectId: string; matrixVersionId: string; kind: "audit" | "resonance" }) {
  const [existing] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, input.projectId),
        eq(auditRuns.runMode, "mock"),
        eq(auditRuns.state, "completed"),
        eq(matrixVersions.kind, input.kind),
        eq(matrixVersions.id, input.matrixVersionId),
      ),
    )
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);
  if (existing) return existing.id;

  const [version] = await db
    .select({ cellCount: matrixVersions.cellCount })
    .from(matrixVersions)
    .where(eq(matrixVersions.id, input.matrixVersionId));
  if (!version) throw new Error(`matrix version ${input.matrixVersionId} not found`);
  const repetitions = 5;
  const providers = ["mock"];
  const modes: ("ungrounded")[] = ["ungrounded"];
  const plannedCalls = version.cellCount * providers.length * modes.length * repetitions;

  const created = await createRun(
    {
      projectId: input.projectId,
      matrixVersionId: input.matrixVersionId,
      runMode: "mock",
      repetitions,
      providers,
      modes,
      costCapUsd: 25,
      debugFailureInjection: null,
    },
    [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }],
    plannedCalls,
  );
  const worker = spawnWorker();
  try {
    const run = await waitForTerminal(created.id, 180_000);
    if (run.state !== "completed") throw new Error(`${input.kind} run ended as ${run.state}`);
  } finally {
    worker.kill("SIGTERM");
  }
  return created.id;
}

async function ensureResonanceStudy(projectId: string, evidenceResponseIds: string[]) {
  const studies = await listResonanceStudies(projectId);
  const existing = studies.find((entry) => entry.study.name === STUDY_NAME);
  if (existing?.matrixVersion) return existing.matrixVersion.id;

  const studyId = existing?.study.id ?? (await createResonanceStudy(projectId, STUDY_NAME)).id;
  await updateResonanceStudy(projectId, studyId, {
    panelPersonas: PERSONAS,
    genericUnconditioned: false,
  });

  const refreshed = (await listResonanceStudies(projectId)).find((entry) => entry.study.id === studyId);
  const existingLabels = new Set((refreshed?.stimuli ?? []).map((stimulus) => stimulus.label));
  const stimuli: Array<{ kind: StimulusKind; label: string; body: string; evidenceResponseIds: string[] }> = [
    {
      kind: "measured_ai",
      label: "Measured AI framing",
      body: "AI assistants describe LedgerFox as useful for finance teams, but the sampled answers understate implementation proof and security specifics.",
      evidenceResponseIds,
    },
    {
      kind: "corrected",
      label: "Proof-led correction",
      body: "LedgerFox is framed as finance automation with clear implementation evidence, audit trails, and security proof for teams comparing vendor risk.",
      evidenceResponseIds: [],
    },
    {
      kind: "repositioned",
      label: "Outcome-led repositioning",
      body: "LedgerFox is framed around faster month-end close, fewer manual reconciliations, and a lower-risk path from evaluation to rollout.",
      evidenceResponseIds: [],
    },
  ];
  for (const stimulus of stimuli) {
    if (existingLabels.has(stimulus.label)) continue;
    await addResonanceStimulus({ projectId, studyId, ...stimulus });
  }

  const version = await approveAndCompileResonanceStudy(projectId, studyId);
  return version.id;
}

async function main() {
  const [demo] = await db.select().from(projects).where(eq(projects.slug, SLUG));
  if (!demo) throw new Error(`${SLUG} not found — run pnpm db:seed first`);

  const auditMatrixId = await ensureAuditMatrix(demo.id);
  const auditRunId = await ensureCompletedRun({ projectId: demo.id, matrixVersionId: auditMatrixId, kind: "audit" });
  await recomputeMetrics(auditRunId);
  await computeFindings(auditRunId);
  await generateReport(auditRunId);

  const evidence = await db
    .select({ id: responses.id })
    .from(responses)
    .where(eq(responses.runId, auditRunId))
    .limit(3);
  if (evidence.length === 0) throw new Error("Audit run has no responses to cite for measured_ai stimulus");

  const resonanceMatrixId = await ensureResonanceStudy(demo.id, evidence.map((row) => row.id));
  const resonanceRunId = await ensureCompletedRun({
    projectId: demo.id,
    matrixVersionId: resonanceMatrixId,
    kind: "resonance",
  });
  const metrics = await recomputeMetrics(resonanceRunId);
  const report = await generateResonanceReport(resonanceRunId);

  console.log(`[demo:resonance] audit run ${auditRunId.slice(0, 8)} · resonance run ${resonanceRunId.slice(0, 8)}`);
  console.log(`[demo:resonance] resonance metrics: ${metrics} rows · report: ${report.ok ? `${report.created} sections` : report.error}`);
  console.log("\n[demo:resonance] walk it:");
  console.log(`  /projects/${demo.id}/resonance`);
  console.log(`  /projects/${demo.id}/runs/${resonanceRunId}`);
  console.log(`  /projects/${demo.id}/report?runId=${resonanceRunId}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[demo:resonance] failed:", err);
  process.exit(1);
});
