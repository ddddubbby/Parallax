// M8 acceptance (DEVELOPMENT_GUIDELINES.md F): pnpm audit:deepseek-mini.
// Live-money smoke test against the real DeepSeek API using whatever
// credential is currently active in Settings — 5 cells x k=2 under the
// $2 validation cap (MASTER_CONTEXT §3: k=2 is validation-only, never
// client-ready evidence), plus a separate tiny run that proves the
// circuit breaker actually pauses a run against real provider costs, not
// just mock fixtures. Requires a real DeepSeek credential saved via the
// Settings UI (C-11 — never pass one on the command line or in env); if
// none is active, this exits immediately without creating anything.
import "../src/env-bootstrap";
import { spawn, type ChildProcess } from "node:child_process";
import { eq } from "drizzle-orm";
import { allocateMatrix } from "../src/core/matrix";
import { db, pool } from "../src/db/client";
import { getActiveCredential } from "../src/db/repositories/credentials";
import { approveVersion, createDraftVersion, getMatrixInputs } from "../src/db/repositories/matrix";
import {
  createRun,
  getRun,
  getRunFailureCounts,
  getRunProgress,
  listRunEvents,
} from "../src/db/repositories/runner";
import { matrixVersions, projects } from "../src/db/schema";

const PROJECT_SLUG = "deepseek-mini-audit";
const VALIDATION_CAP_USD = Math.min(Number(process.env.DEFAULT_VALIDATION_RUN_CAP_USD ?? 2), 2);
const BREAKER_PROOF_CAP_USD = 0.0000001; // below the cost of any single real completion
const WAIT_TIMEOUT_MS = 120_000;

function log(msg: string) {
  console.log(`[deepseek-mini] ${msg}`);
}

async function ensureProject() {
  const [existing] = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (existing) return existing.id;

  const [demo] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!demo) throw new Error("ledgerfox-demo project not found — run `pnpm db:seed` first");

  const inputs = await getMatrixInputs(demo.id);
  if (!inputs || !inputs.client) throw new Error("demo project intake incomplete");

  const [project] = await db
    .insert(projects)
    .values({
      name: "DeepSeek Mini Audit",
      slug: PROJECT_SLUG,
      category: inputs.project.category,
      jobToBeDone: inputs.project.jobToBeDone,
      status: "active",
    })
    .returning({ id: projects.id });

  const { brands, personas, markets, attributes } = await import("../src/db/schema");
  await db.insert(brands).values({
    projectId: project.id,
    role: "client",
    name: inputs.client.name,
    domain: inputs.client.domain,
    aliasesJson: inputs.client.aliasesJson,
  });
  for (const [i, c] of inputs.competitors.entries()) {
    await db.insert(brands).values({ projectId: project.id, role: "competitor", name: c.name, aliasesJson: c.aliasesJson, priority: i });
  }
  for (const p of inputs.personas) await db.insert(personas).values({ projectId: project.id, title: p.title });
  for (const m of inputs.markets) await db.insert(markets).values({ projectId: project.id, name: m.name });
  for (const name of inputs.attributes) await db.insert(attributes).values({ projectId: project.id, name });
  return project.id;
}

/**
 * Always creates a fresh version rather than reusing an existing approved
 * one — each script invocation is meant to be its own mini-audit, not an
 * idempotent singleton, and matrix_versions has no label column to key
 * reuse on (only version/cellCount, which differ between this script's two
 * phases anyway).
 */
async function newApprovedVersion(projectId: string, target: number) {
  const inputs = await getMatrixInputs(projectId);
  if (!inputs || !inputs.client) throw new Error("intake incomplete");
  const ctx = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
    competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
    attributes: inputs.attributes,
  };
  const cells = allocateMatrix(inputs.templates as Parameters<typeof allocateMatrix>[0], inputs.personas, inputs.markets, ctx, { target });
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

function spawnWorker(): ChildProcess {
  const nodeBin = process.execPath;
  const tsxLoader = new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const workerEntry = new URL("../src/worker/index.ts", import.meta.url).pathname;
  const child = spawn(nodeBin, ["--import", tsxLoader, workerEntry], { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.on("data", (d) => process.stdout.write(`  [worker] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`  [worker:err] ${d}`));
  return child;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTerminal(runId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await getRun(runId);
    if (run && ["completed", "failed", "cancelled", "paused"].includes(run.state)) return run;
    await sleep(500);
  }
  throw new Error(`Run did not reach a terminal state within ${timeoutMs}ms`);
}

async function reportRun(label: string, runId: string) {
  const run = await getRun(runId);
  const progress = await getRunProgress(runId);
  const failureCounts = await getRunFailureCounts(runId);
  const events = await listRunEvents(runId, 200);
  const breakerEvents = events.filter((e) => e.eventType === "circuit_breaker_paused");
  log(`${label}: state=${run?.state} mode=${run?.runMode} actualCost=$${run?.actualCostUsd} cap=$${run?.costCapUsd}`);
  log(`${label}: progress=${JSON.stringify(progress)} succeeded=${failureCounts.succeeded} deadLettered=${failureCounts.deadLettered}`);
  for (const e of breakerEvents) log(`${label}: BREAKER EVENT — ${e.message}`);
  return { run, progress, failureCounts, breakerEvents };
}

async function main() {
  const credential = await getActiveCredential("deepseek");
  if (!credential) {
    log("No active DeepSeek credential found. Add one via the Settings UI (never paste a key into chat or a script) before running this.");
    await pool.end();
    process.exit(1);
  }
  log(`using active DeepSeek credential, last4=${credential.apiKeyLast4}, verified=${credential.lastVerifiedAt ?? "never"}`);

  const projectId = await ensureProject();

  // Phase A: circuit-breaker proof against a real cost. 1 cell x k=3 reps
  // under a cap smaller than any single real completion — the first
  // batch's cost trips the breaker, pausing the run before all 3 reps
  // necessarily complete.
  log("Phase A: circuit-breaker proof (tiny cap, real DeepSeek calls)...");
  const breakerVersion = await newApprovedVersion(projectId, 1);
  const breakerRun = await createRun(
    {
      projectId,
      matrixVersionId: breakerVersion.id,
      runMode: "live_validation",
      repetitions: 3,
      providers: ["deepseek"],
      modes: ["ungrounded"],
      costCapUsd: BREAKER_PROOF_CAP_USD,
      debugFailureInjection: null,
    },
    [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
    breakerVersion.cellCount * 3,
  );
  log(`created breaker-proof run ${breakerRun.id}, cap=$${BREAKER_PROOF_CAP_USD}`);

  let worker = spawnWorker();
  await waitForTerminal(breakerRun.id, WAIT_TIMEOUT_MS);
  worker.kill("SIGTERM");
  const breakerResult = await reportRun("Phase A", breakerRun.id);
  const breakerFired = breakerResult.run?.state === "paused" && breakerResult.breakerEvents.length > 0;
  log(`Phase A breaker fired: ${breakerFired}`);

  // Phase B: the actual 5-cell x k=2 validation mini-audit under the real
  // validation cap. run_mode: live_validation keeps the VALIDATION-ONLY
  // label visible everywhere this run is displayed (never client-ready
  // evidence, per MASTER_CONTEXT §3).
  log("Phase B: 5-cell x k=2 validation mini-audit...");
  const auditVersion = await newApprovedVersion(projectId, 5);
  const auditRun = await createRun(
    {
      projectId,
      matrixVersionId: auditVersion.id,
      runMode: "live_validation",
      repetitions: 2,
      providers: ["deepseek"],
      modes: ["ungrounded"],
      costCapUsd: VALIDATION_CAP_USD,
      debugFailureInjection: null,
    },
    [{ id: "deepseek", supportsGrounded: false, supportsUngrounded: true }],
    auditVersion.cellCount * 2,
  );
  log(`created mini-audit run ${auditRun.id}, ${auditVersion.cellCount} cells x k=2, cap=$${VALIDATION_CAP_USD}`);

  worker = spawnWorker();
  await waitForTerminal(auditRun.id, WAIT_TIMEOUT_MS);
  worker.kill("SIGTERM");
  const auditResult = await reportRun("Phase B", auditRun.id);

  const checks: Array<[string, boolean]> = [
    ["Phase A circuit breaker fired against real cost", breakerFired],
    ["Phase B run reached completed or paused", ["completed", "paused"].includes(auditResult.run?.state ?? "")],
    ["Phase B stayed under the validation cap", Number(auditResult.run?.actualCostUsd ?? 0) <= VALIDATION_CAP_USD],
    ["Phase B run is labeled live_validation (never client-ready evidence)", auditResult.run?.runMode === "live_validation"],
  ];

  let failed = false;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}`);
    if (!pass) failed = true;
  }

  const totalCostUsd = Number(breakerResult.run?.actualCostUsd ?? 0) + Number(auditResult.run?.actualCostUsd ?? 0);
  log(`total real spend this run: $${totalCostUsd.toFixed(6)}`);

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[deepseek-mini] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
