// M4 acceptance (DEVELOPMENT_GUIDELINES.md F): pnpm test:mock-e2e.
// Creates a large mock run with failure injection, spawns the real worker
// as a child process, kills it mid-flight, restarts it, and asserts the
// run completes with no duplicate responses and logged retries.
import { spawn, type ChildProcess } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { allocateMatrix } from "../src/core/matrix";
import { db, pool } from "../src/db/client";
import { approveVersion, createDraftVersion, getMatrixInputs } from "../src/db/repositories/matrix";
import {
  createRun,
  getRun,
  getRunFailureCounts,
  getRunProgress,
  listRunEvents,
} from "../src/db/repositories/runner";
import { matrixVersions, projects, responses } from "../src/db/schema";

const PROJECT_SLUG = "m4-e2e";
const TARGET_ELAPSED_MS = 120_000; // MK-6: default mock run completes in under 2 minutes.

function log(msg: string) {
  console.log(`[e2e] ${msg}`);
}

async function ensureProject() {
  const [existing] = await db.select().from(projects).where(eq(projects.slug, PROJECT_SLUG));
  if (existing) return existing.id;

  const [demo] = await db.select().from(projects).where(eq(projects.slug, "ledgerfox-demo"));
  if (!demo) throw new Error("ledgerfox-demo project not found — run `pnpm db:seed` first");

  // Clone the demo's intake data under a dedicated slug so this script never
  // collides with manually-tested projects or the M3 test's own runs.
  const inputs = await getMatrixInputs(demo.id);
  if (!inputs || !inputs.client) throw new Error("demo project intake incomplete");

  const [project] = await db
    .insert(projects)
    .values({
      name: "M4 E2E",
      slug: PROJECT_SLUG,
      category: inputs.project.category,
      jobToBeDone: inputs.project.jobToBeDone,
      status: "active",
    })
    .returning({ id: projects.id });

  const { brands, personas, markets, attributes } = await import("../src/db/schema");
  const [client] = await db
    .insert(brands)
    .values({
      projectId: project.id,
      role: "client",
      name: inputs.client.name,
      domain: inputs.client.domain,
      aliasesJson: inputs.client.aliasesJson,
    })
    .returning({ id: brands.id, name: brands.name, aliasesJson: brands.aliasesJson });
  const competitorRows = [];
  for (const [i, c] of inputs.competitors.entries()) {
    const [row] = await db
      .insert(brands)
      .values({ projectId: project.id, role: "competitor", name: c.name, aliasesJson: c.aliasesJson, priority: i })
      .returning({ id: brands.id, name: brands.name, aliasesJson: brands.aliasesJson });
    competitorRows.push(row);
  }
  const personaRows = [];
  for (const p of inputs.personas) {
    const [row] = await db
      .insert(personas)
      .values({ projectId: project.id, title: p.title })
      .returning({ id: personas.id, title: personas.title });
    personaRows.push(row);
  }
  const marketRows = [];
  for (const m of inputs.markets) {
    const [row] = await db
      .insert(markets)
      .values({ projectId: project.id, name: m.name })
      .returning({ id: markets.id, name: markets.name });
    marketRows.push(row);
  }
  for (const name of inputs.attributes) {
    await db.insert(attributes).values({ projectId: project.id, name });
  }

  void client;
  void competitorRows;
  void personaRows;
  void marketRows;
  return project.id;
}

async function ensureApprovedVersion(projectId: string) {
  const [approved] = await db
    .select()
    .from(matrixVersions)
    .where(and(eq(matrixVersions.projectId, projectId), eq(matrixVersions.state, "approved")));
  if (approved) return approved;

  const inputs = await getMatrixInputs(projectId);
  if (!inputs || !inputs.client) throw new Error("e2e project intake incomplete");
  const ctx = {
    category: inputs.project.category ?? "",
    jobToBeDone: inputs.project.jobToBeDone ?? "",
    clientBrand: { name: inputs.client.name, aliases: (inputs.client.aliasesJson as string[]) ?? [] },
    competitors: inputs.competitors.map((c) => ({ name: c.name, aliases: (c.aliasesJson as string[]) ?? [] })),
    attributes: inputs.attributes,
  };
  const cells = allocateMatrix(
    inputs.templates as Parameters<typeof allocateMatrix>[0],
    inputs.personas,
    inputs.markets,
    ctx,
    { target: 50 }, // max cap, so the run below hits close to 500 jobs
  );
  const draft = await createDraftVersion(projectId, cells);
  await approveVersion(projectId, draft.id);
  const [version] = await db.select().from(matrixVersions).where(eq(matrixVersions.id, draft.id));
  return version;
}

function spawnWorker(env: Record<string, string | undefined> = {}): ChildProcess {
  const nodeBin = process.execPath;
  const tsxBin = new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url).pathname;
  const workerEntry = new URL("../src/worker/index.ts", import.meta.url).pathname;
  const child = spawn(nodeBin, [tsxBin, workerEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
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
    if (run && ["completed", "failed", "cancelled", "paused"].includes(run.state)) {
      return run;
    }
    await sleep(500);
  }
  throw new Error(`Run did not reach a terminal state within ${timeoutMs}ms`);
}

async function main() {
  const start = Date.now();
  const projectId = await ensureProject();
  const version = await ensureApprovedVersion(projectId);
  log(`project ${projectId}, matrix version ${version.id} (${version.cellCount} cells)`);

  const capabilities = [{ id: "mock", supportsGrounded: true, supportsUngrounded: true }];
  const plannedCalls = version.cellCount * 1 * 2 * 5; // 1 provider x 2 modes x 5 reps
  const run = await createRun(
    {
      projectId,
      matrixVersionId: version.id,
      runMode: "mock",
      repetitions: 5,
      providers: ["mock"],
      modes: ["ungrounded", "grounded"],
      costCapUsd: 25,
      debugFailureInjection: { rate: 0.1, errorType: "rate_limit" },
    },
    capabilities,
    plannedCalls,
  );
  log(`created run ${run.id}, planned ${plannedCalls} jobs, failure injection at 10% rate_limit`);

  // Phase 1: kill the worker the instant jobs are actually in-flight. Mock
  // normally resolves in ~15ms — faster than a poll-then-kill round-trip
  // can reliably catch — so this phase widens mock latency for THIS run
  // only (worker child env), making the in-flight window observable
  // without changing default MK-6-budget behavior.
  let worker = spawnWorker({ MOCK_LATENCY_MS: "600" });
  const catchDeadline = Date.now() + 5000;
  let caughtRunning = 0;
  while (Date.now() < catchDeadline) {
    caughtRunning = (await getRunProgress(run.id)).running ?? 0;
    if (caughtRunning > 0) break;
    await sleep(15);
  }
  log(`caught ${caughtRunning} job(s) in 'running' state before kill`);
  worker.kill("SIGKILL");
  await sleep(300);

  const runningAfterKill = (await getRunProgress(run.id)).running ?? 0;
  log(`jobs left in 'running' state after SIGKILL (should be > 0 to prove the kill test is meaningful): ${runningAfterKill}`);

  // Phase 2: restart the worker with a short stale-lock window so any
  // jobs genuinely orphaned by the SIGKILL are provably reclaimed within
  // this test's runtime, rather than waiting out the 60s production default.
  worker = spawnWorker({ WORKER_STALE_LOCK_MS: "500", WORKER_STALE_RECLAIM_INTERVAL_MS: "500" });
  const finalRun = await waitForTerminal(run.id, TARGET_ELAPSED_MS);
  worker.kill("SIGTERM");

  const elapsedMs = Date.now() - start;
  const finalProgress = await getRunProgress(run.id);
  const failureCounts = await getRunFailureCounts(run.id);
  const events = await listRunEvents(run.id, 500);
  const retryEvents = events.filter((e) => e.eventType === "job_retry");
  const staleReclaimEvents = events.filter((e) => e.eventType === "stale_lock_reclaimed");

  const responseRows = await db
    .select({ jobId: responses.jobId })
    .from(responses)
    .where(eq(responses.runId, run.id));
  const responseCount = responseRows.length;
  const distinctJobIds = new Set(responseRows.map((r) => r.jobId));

  log(`final run state: ${finalRun.state}`);
  log(`final job progress: ${JSON.stringify(finalProgress)}`);
  log(`succeeded=${failureCounts.succeeded} deadLettered=${failureCounts.deadLettered} cancelled=${failureCounts.cancelled}`);
  log(`retry events logged: ${retryEvents.length}`);
  log(`stale-lock reclaim events logged: ${staleReclaimEvents.length}`);
  log(`responses stored: ${responseCount}, distinct job_id: ${distinctJobIds.size} (must be equal — no duplicates)`);
  log(`elapsed: ${(elapsedMs / 1000).toFixed(1)}s (target < ${TARGET_ELAPSED_MS / 1000}s)`);

  const checks: Array<[string, boolean]> = [
    ["run reached completed or paused (breaker) terminal state", ["completed", "paused"].includes(finalRun.state)],
    [
      "no jobs stuck in running/queued",
      ((finalProgress.queued ?? 0) === 0 && (finalProgress.running ?? 0) === 0) ||
        finalRun.state === "paused",
    ],
    ["responses have no duplicate job_id", responseCount === distinctJobIds.size],
    ["at least one retry was logged (failure injection worked)", retryEvents.length > 0],
    ["at least one stale-lock reclaim was logged (kill/resume worked)", staleReclaimEvents.length > 0],
    ["elapsed time under MK-6 budget", elapsedMs < TARGET_ELAPSED_MS],
  ];

  let failed = false;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}`);
    if (!pass) failed = true;
  }

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[e2e] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
