// M38 OpenAI-only live validation harness (AGENT_BUILD_PLAN §6.4 slice).
// Runs the real GEO agent pipeline against LIVE OpenAI (grounded) over a real
// token, at a small k, under a hard cost cap — then builds the mechanical report
// and checks the C-10 grounding gate (every grounded answer must carry
// citations). This is a VALIDATION slice, NOT the full 900-sample three-engine
// spike: Gemini/Grok stay unwired until their keys exist.
//
// SPEND + CREDENTIALS: this makes real, billable OpenAI calls. The operator must
// (1) enter an OpenAI key in the Settings UI (never in code — C-11); this harness
// only reads the encrypted store, and (2) pass --confirm-spend. The harness
// refuses to run without both.
//
// Usage:
//   pnpm agent:live-validate --chain base --address 0x... --category ai_agent \
//     --name "Virtual Protocol" --symbol VIRTUAL --k 2 --cap 3.00 --confirm-spend
//   (omit --name/--symbol to resolve identity from BASE_RPC_URL/ETHEREUM_RPC_URL)
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { AssetChain } from "../src/core/crypto-resolver";
import type { DiscoveryCategory } from "../src/core/crypto-prompts";
import { authoredProseViolations } from "../src/core/agent-report";
import { db, pool } from "../src/db/client";
import { getActiveCredential } from "../src/db/repositories/credentials";
import { getRun } from "../src/db/repositories/runner";
import { responses } from "../src/db/schema";
import {
  buildAgentRun,
  createFixtureMetadataReader,
  type BuildAgentRunSuccess,
} from "../src/modules/agent/build-run";
import { createRpcMetadataReader, type TokenMetadataReader } from "../src/modules/agent/resolver";
import { buildAgentReportForRun } from "../src/modules/agent/report";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function fail(msg: string): never {
  console.error(`[live-validate] ${msg}`);
  process.exit(1);
}

async function main() {
  const chain = (arg("chain") ?? "base") as AssetChain;
  const address = arg("address");
  const category = (arg("category") ?? "general_crypto") as DiscoveryCategory;
  const k = Number(arg("k") ?? "2");
  const cap = Number(arg("cap") ?? "3.00");
  if (!address) fail("missing --address");
  if (!flag("confirm-spend")) {
    fail(
      "this harness makes billable OpenAI calls. Re-run with --confirm-spend once you accept " +
        `the up-to-$${cap.toFixed(2)} cost cap.`,
    );
  }

  // Gate: an OpenAI credential must be present (operator-entered in Settings).
  const credential = await getActiveCredential("openai");
  if (!credential) {
    fail(
      "no active OpenAI credential found. Enter your OpenAI API key in the Settings UI first " +
        "(keys are never passed on the command line or stored in code — C-11), then re-run.",
    );
  }

  // Identity: RPC reader if managed RPC URLs are set, else a fixture from --name/--symbol.
  let reader: TokenMetadataReader;
  const rpcUrls = { base: process.env.BASE_RPC_URL, ethereum: process.env.ETHEREUM_RPC_URL };
  if (rpcUrls[chain]) {
    reader = createRpcMetadataReader({ rpcUrls });
    console.log(`[live-validate] resolving ${chain}:${address} via managed RPC`);
  } else {
    const name = arg("name");
    const symbol = arg("symbol");
    if (!name || !symbol) fail(`no ${chain} RPC URL set — provide --name and --symbol for a fixture identity`);
    reader = createFixtureMetadataReader([
      { chain, address, metadata: { chainId: chain === "base" ? 8453 : 1, hasBytecode: true, name: name!, symbol: symbol!, decimals: 18 } },
    ]);
    console.log(`[live-validate] using fixture identity ${name} (${symbol}) — no RPC configured`);
  }

  const built = await buildAgentRun({
    chain,
    contractAddress: address,
    discoveryCategory: category,
    reader,
    runMode: "live_validation",
    engines: ["openai"],
    repetitions: k,
    costCapUsd: cap,
  });
  if (!built.ok) fail(`pre-budget rejection: ${built.reason} — ${built.detail ?? ""}`);
  const run = built as BuildAgentRunSuccess;
  console.log(`[live-validate] run ${run.runId}: ${run.plannedCalls} planned OpenAI grounded calls (k=${k}), cap $${cap.toFixed(2)}`);

  // Drive the real worker (calls live OpenAI via the encrypted credential).
  const tsxLoader = new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const workerEntry = new URL("../src/worker/index.ts", import.meta.url).pathname;
  const worker: ChildProcess = spawn(process.execPath, ["--import", tsxLoader, workerEntry], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  worker.stdout?.on("data", (d) => process.stdout.write(`  [worker] ${d}`));
  worker.stderr?.on("data", (d) => process.stderr.write(`  [worker:err] ${d}`));

  const deadline = Date.now() + 15 * 60_000; // 15 min SLA-adjacent ceiling for a small validation run
  let finalState = "unknown";
  while (Date.now() < deadline) {
    const r = await getRun(run.runId);
    if (r && ["completed", "failed", "cancelled", "paused"].includes(r.state)) {
      finalState = r.state;
      break;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  worker.kill("SIGTERM");

  // Build the report + C-10 grounding check from the stored responses.
  const rows = await db
    .select({ providerId: responses.providerId, citations: responses.citationsJson })
    .from(responses)
    .where(eq(responses.runId, run.runId));
  const grounded = rows.length;
  const withCitations = rows.filter((r) => ((r.citations as unknown[]) ?? []).length > 0).length;

  const report = await buildAgentReportForRun({
    runId: run.runId,
    identity: { ...run.identity, decimals: run.identity.decimals },
    models: { openai: credential.defaultModel ?? "gpt-5.5" },
  });

  const outPath = `.agent-live-validate.${run.runId}.json`;
  writeFileSync(outPath, JSON.stringify(report.report, null, 2) + "\n");

  console.log(`\n[live-validate] === RESULT ===`);
  console.log(`  run state:              ${finalState}`);
  console.log(`  responses stored:       ${grounded} / ${run.plannedCalls} planned`);
  console.log(`  C-10 grounding:         ${withCitations}/${grounded} answers carried citations`);
  console.log(`  representation_state:   ${report.report.representation_state}`);
  console.log(`  authored prose C-16:    ${authoredProseViolations(report.report).length === 0 ? "clean" : "VIOLATION"}`);
  console.log(`  report digest:          ${report.sha256}`);
  console.log(`  report written to:      ${outPath}`);
  if (grounded > 0 && withCitations < grounded) {
    console.log(`  NOTE (C-10): ${grounded - withCitations} grounded answer(s) had NO citations — these are ungrounded and must not be mixed into grounded aggregates.`);
  }

  await pool.end();
  process.exit(finalState === "completed" ? 0 : 1);
}

main().catch(async (err) => {
  console.error("[live-validate] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
