// OX-5: make the seeded demo project (ledgerfox-demo) walkable end-to-end at
// $0 — approved matrix, a completed MOCK run, computed metrics, generated
// report — so a demo can click through matrix → run → dashboard → report with
// real-shaped data and never spend a cent. Idempotent: reuses an existing
// completed mock run if one is present. Run: pnpm demo:walkthrough
import "../src/env-bootstrap";
import { spawn } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { allocateMatrix } from "../src/core/matrix";
import { db, pool } from "../src/db/client";
import { recomputeMetrics } from "../src/db/repositories/metrics";
import { approveVersion, createDraftVersion, getMatrixInputs } from "../src/db/repositories/matrix";
import { createRun, getRun } from "../src/db/repositories/runner";
import { auditRuns, matrixVersions, projects } from "../src/db/schema";
import { computeFindings } from "../src/modules/analysis/findings";
import { generateReport } from "../src/modules/report/service";

const SLUG = "ledgerfox-demo";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureApprovedVersion(projectId: string): Promise<string> {
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

async function main() {
  const [demo] = await db.select().from(projects).where(eq(projects.slug, SLUG));
  if (!demo) throw new Error(`${SLUG} not found — run pnpm db:seed first`);

  const versionId = await ensureApprovedVersion(demo.id);
  console.log(`[demo] approved matrix version ready`);

  // Reuse an existing completed mock run so the script is cheap to re-run.
  const [existing] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(
      and(
        eq(auditRuns.projectId, demo.id),
        eq(auditRuns.runMode, "mock"),
        eq(auditRuns.state, "completed"),
        eq(matrixVersions.kind, "audit"),
        eq(matrixVersions.id, versionId),
      ),
    );

  let runId: string;
  if (existing) {
    runId = existing.id;
    console.log(`[demo] reusing completed mock run ${runId.slice(0, 8)}`);
  } else {
    const [version] = await db
      .select({ cellCount: matrixVersions.cellCount })
      .from(matrixVersions)
      .where(eq(matrixVersions.id, versionId));
    if (!version) throw new Error(`matrix version ${versionId} not found`);
    const repetitions = 5;
    const providers = ["mock"];
    const modes: ("ungrounded")[] = ["ungrounded"];
    const plannedCalls = version.cellCount * providers.length * modes.length * repetitions;
    const created = await createRun(
      {
        projectId: demo.id,
        matrixVersionId: versionId,
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
    runId = created.id;
    console.log(`[demo] created mock run ${runId.slice(0, 8)} — spawning worker ($0)`);
    const worker = spawnWorker();
    try {
      const run = await waitForTerminal(runId, 180_000);
      console.log(`[demo] run finished: ${run.state}`);
    } finally {
      worker.kill("SIGTERM");
    }
  }

  const metricRows = await recomputeMetrics(runId);
  const findings = await computeFindings(runId);
  const report = await generateReport(runId);
  console.log(`[demo] metrics: ${metricRows} rows · findings: ${findings} · report: ${report.ok ? `${report.created} sections` : report.error}`);
  console.log(`\n[demo] walk it:`);
  for (const view of ["matrix", `runs/${runId}`, "dashboard", "report"]) {
    console.log(`  /projects/${demo.id}/${view}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[demo] failed:", err);
  process.exit(1);
});
