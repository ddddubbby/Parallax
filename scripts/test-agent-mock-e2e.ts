// M36 acceptance (AGENT_BUILD_PLAN §6.2): pnpm test:agent-mock-e2e.
// Drives the programmatic contract → project → matrix → run path headlessly:
// resolves a fixture token, builds the 20-cell crypto_geo_prompts_v1 matrix,
// creates a mock run across the three engines, spawns the real worker, and
// asserts 300/300 samples land with no duplicate job rows and per-engine
// fixture variation. Also asserts every adversarial fixture rejects pre-budget
// with no rows written.
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { AssetChain } from "../src/core/crypto-resolver";
import { db, pool } from "../src/db/client";
import { getRun } from "../src/db/repositories/runner";
import { extractions, projects, responses } from "../src/db/schema";
import {
  buildAgentRun,
  createFixtureMetadataReader,
  type BuildAgentRunSuccess,
} from "../src/modules/agent/build-run";
import type { RawTokenMetadata } from "../src/modules/agent/resolver";
import { buildAgentReportForRun } from "../src/modules/agent/report";
import { authoredProseViolations } from "../src/core/agent-report";

interface TokenFixtures {
  valid: Array<{ chain: AssetChain; address: string; metadata: RawTokenMetadata }>;
  adversarial: Array<{ label: string; chain: AssetChain; address: string; metadata: RawTokenMetadata; expectedReason: string }>;
}

const TARGET_ELAPSED_MS = 120_000; // mirrors the MK-6 mock-run budget.

function log(msg: string) {
  console.log(`[agent-e2e] ${msg}`);
}

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "mock-responses", "crypto", "tokens.json"), "utf8"),
) as TokenFixtures;
const reader = createFixtureMetadataReader([
  ...fixtures.valid,
  ...fixtures.adversarial.map((a) => ({ chain: a.chain, address: a.address, metadata: a.metadata })),
]);

function spawnWorker(): ChildProcess {
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

async function main() {
  const start = Date.now();
  const checks: Array<[string, boolean]> = [];

  // --- Adversarial: every hostile fixture rejects pre-budget, no rows written.
  const projectsBefore = (await db.select({ id: projects.id }).from(projects)).length;
  let allRejected = true;
  for (const a of fixtures.adversarial) {
    const result = await buildAgentRun({
      chain: a.chain,
      contractAddress: a.address,
      discoveryCategory: "general_crypto",
      reader,
    });
    if (result.ok || result.reason !== a.expectedReason) {
      allRejected = false;
      log(`adversarial NOT rejected as expected: ${a.label} → ${result.ok ? "ok" : result.reason}`);
    }
  }
  const projectsAfter = (await db.select({ id: projects.id }).from(projects)).length;
  checks.push(["every adversarial fixture rejected with its expected reason", allRejected]);
  checks.push(["no project rows written by rejected builds", projectsAfter === projectsBefore]);

  // --- Valid: build the run, process it, assert 300/300.
  const token = fixtures.valid[0];
  const built = await buildAgentRun({
    chain: token.chain,
    contractAddress: token.address,
    discoveryCategory: "ai_agent",
    reader,
  });
  if (!built.ok) throw new Error(`valid token build failed: ${built.reason} — ${built.detail}`);
  const run = built as BuildAgentRunSuccess;
  log(`built run ${run.runId}: ${run.plannedCalls} planned samples across ${run.identity.name}`);
  checks.push(["planned exactly 300 samples (20 cells x 3 engines x k=5)", run.plannedCalls === 300]);

  const worker = spawnWorker();
  const finalRun = await waitForTerminal(run.runId, TARGET_ELAPSED_MS);
  worker.kill("SIGTERM");

  const rows = await db
    .select({
      jobId: responses.jobId,
      cellId: responses.cellId,
      providerId: responses.providerId,
      rawText: responses.rawText,
    })
    .from(responses)
    .where(eq(responses.runId, run.runId));
  const distinctJobs = new Set(rows.map((r) => r.jobId));
  const byProvider = new Map<string, string[]>();
  // Per-cell, per-provider text signature: D-016 keys fixtures by
  // (resolved_text, provider_id, rep), so within a single cell each engine
  // selects its own set of fixtures. The aggregate multiset over all cells can
  // coincide (same fixtures, permuted), so the honest check is per-cell.
  const byCellProvider = new Map<string, Map<string, string[]>>();
  for (const r of rows) {
    const list = byProvider.get(r.providerId) ?? [];
    list.push(r.rawText);
    byProvider.set(r.providerId, list);
    const cell = byCellProvider.get(r.cellId) ?? new Map<string, string[]>();
    const cellList = cell.get(r.providerId) ?? [];
    cellList.push(r.rawText);
    cell.set(r.providerId, cellList);
    byCellProvider.set(r.cellId, cell);
  }
  const perProvider = [...byProvider.entries()].map(([p, texts]) => `${p}=${texts.length}`).join(" ");
  // At least one cell where the three engines did NOT all select the same fixtures.
  const enginesDifferPerCell = [...byCellProvider.values()].some((cell) => {
    const sigs = new Set([...cell.values()].map((t) => [...t].sort().join("|")));
    return sigs.size > 1;
  });

  log(`final run state: ${finalRun.state}`);
  log(`responses stored: ${rows.length}, distinct job_id: ${distinctJobs.size}`);
  log(`per provider: ${perProvider}`);
  log(`elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);

  checks.push(["run reached completed", finalRun.state === "completed"]);
  checks.push(["exactly 300 responses stored", rows.length === 300]);
  checks.push(["no duplicate job_id", rows.length === distinctJobs.size]);
  checks.push(["all three engines present", byProvider.size === 3]);
  checks.push(["each engine produced 100 samples", [...byProvider.values()].every((t) => t.length === 100)]);
  checks.push(["engines differ per cell (D-016 per-engine fixture keying)", enginesDifferPerCell]);

  // AGENT_PRD §11: no LLM reads the agent's answers — the worker must skip the
  // LLM extraction pipeline entirely for crypto_token runs.
  const extractionRows = await db
    .select({ id: extractions.id })
    .from(extractions)
    .innerJoin(responses, eq(extractions.responseId, responses.id))
    .where(eq(responses.runId, run.runId));
  checks.push(["§11: zero LLM-extraction rows for the agent run", extractionRows.length === 0]);

  // M37: build the mechanical report from the 300 stored responses (full path).
  const models = { openai: "mock", google: "mock", xai: "mock" };
  const report = await buildAgentReportForRun({
    runId: run.runId,
    identity: { ...run.identity, decimals: run.identity.decimals },
    models,
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
  const report2 = await buildAgentReportForRun({
    runId: run.runId,
    identity: { ...run.identity, decimals: run.identity.decimals },
    models,
    generatedAt: "2026-07-13T00:00:00.000Z",
  });
  const engines = (report.report.engines as { engine: string; sample_accounting: { collected: number } }[]) ?? [];
  const state = report.report.representation_state;
  log(`report digest ${report.sha256.slice(0, 16)}…, engines=${engines.length}, representation_state=${state}`);
  checks.push(["M37 report covers all 3 engines", engines.length === 3]);
  checks.push(["M37 report digest is deterministic", report.sha256 === report2.sha256 && /^[0-9a-f]{64}$/.test(report.sha256)]);
  checks.push(["M37 authored prose passes C-16 (no advice terms)", authoredProseViolations(report.report).length === 0]);
  checks.push(["M37 each engine accounting collected=100", engines.every((e) => e.sample_accounting.collected === 100)]);
  checks.push([
    "M37 representation_state is a valid label",
    ["estimable", "sparse", "not_estimable"].includes(String(state)),
  ]);

  let failed = false;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}`);
    if (!pass) failed = true;
  }

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[agent-e2e] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
