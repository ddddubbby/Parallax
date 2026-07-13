import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { AssetChain } from "@/core/crypto-resolver";
import { db, pool } from "@/db/client";
import { auditRuns, jobs, matrixVersions, projects, promptCells } from "@/db/schema";
import {
  buildAgentRun,
  createFixtureMetadataReader,
  type BuildAgentRunSuccess,
} from "./build-run";
import type { RawTokenMetadata, TokenMetadataReader } from "./resolver";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let dbUp = false;
try {
  await pool.query("select 1");
  dbUp = true;
} catch {
  dbUp = false;
}

interface TokenFixtures {
  valid: Array<{ chain: AssetChain; address: string; metadata: RawTokenMetadata }>;
  adversarial: Array<{ chain: AssetChain; address: string; metadata: RawTokenMetadata; expectedReason: string }>;
}
const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "fixtures", "mock-responses", "crypto", "tokens.json"), "utf8"),
) as TokenFixtures;
const reader = createFixtureMetadataReader([
  ...fixtures.valid,
  ...fixtures.adversarial.map((a) => ({ chain: a.chain, address: a.address, metadata: a.metadata })),
]);

async function projectCount(): Promise<number> {
  return (await db.select({ id: projects.id }).from(projects)).length;
}

describe.skipIf(!dbUp)("buildAgentRun (M36 programmatic path)", () => {
  it("creates a crypto_token project, approved 20-cell matrix, and a 300-sample mock run", async () => {
    const token = fixtures.valid[0];
    const result = await buildAgentRun({
      chain: token.chain,
      contractAddress: token.address,
      discoveryCategory: "ai_agent",
      reader,
    });
    expect(result.ok).toBe(true);
    const built = result as BuildAgentRunSuccess;
    expect(built.plannedCalls).toBe(300);

    const [project] = await db
      .select({ archetype: projects.categoryArchetype, status: projects.status })
      .from(projects)
      .where(eq(projects.id, built.projectId));
    expect(project.archetype).toBe("crypto_token");

    const [version] = await db
      .select({ state: matrixVersions.state, cellCount: matrixVersions.cellCount, kind: matrixVersions.kind })
      .from(matrixVersions)
      .where(eq(matrixVersions.id, built.matrixVersionId));
    expect(version.state).toBe("approved");
    expect(version.cellCount).toBe(20);
    expect(version.kind).toBe("audit");

    const cells = await db
      .select({ intent: promptCells.intent })
      .from(promptCells)
      .where(eq(promptCells.matrixVersionId, built.matrixVersionId));
    expect(cells).toHaveLength(20);
    expect(cells.filter((c) => c.intent === "discovery")).toHaveLength(6);
    expect(cells.filter((c) => c.intent === "representation")).toHaveLength(14);
  });

  it("builds an OpenAI-only live_validation run (M38 slice — no Gemini/Grok, no spend)", async () => {
    const token = fixtures.valid[0];
    const result = await buildAgentRun({
      chain: token.chain,
      contractAddress: token.address,
      discoveryCategory: "ai_agent",
      reader,
      runMode: "live_validation",
      engines: ["openai"],
      repetitions: 2,
    });
    expect(result.ok).toBe(true);
    const built = result as BuildAgentRunSuccess;
    // 20 cells × 1 engine × k=2 = 40 planned (a validation slice, not the 900-sample spike).
    expect(built.plannedCalls).toBe(40);

    const [run] = await db
      .select({ runMode: auditRuns.runMode, providers: auditRuns.selectedProvidersJson, reps: auditRuns.repetitions })
      .from(auditRuns)
      .where(eq(auditRuns.id, built.runId));
    expect(run.runMode).toBe("live_validation");
    expect(run.providers).toEqual(["openai"]);
    expect(run.reps).toBe(2);

    // Jobs are created but NOT executed here — no live call, no spend.
    const jobRows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.runId, built.runId));
    expect(jobRows).toHaveLength(40);

    // Cancel the run so this suite leaves NO queued non-mock run behind: the
    // settings suite's disable/delete guard (findActiveLiveRunUsingProvider)
    // matches any queued/running audit-kind live run via its deepseek
    // extraction secondary — a leftover here intermittently fails that suite.
    await db.update(auditRuns).set({ state: "cancelled" }).where(eq(auditRuns.id, built.runId));
  });

  it("rejects a hostile-metadata token before budget, writing no rows", async () => {
    const bidi = fixtures.adversarial.find((a) => a.expectedReason === "bidi_override");
    if (!bidi) throw new Error("expected a bidi_override fixture");
    const before = await projectCount();
    const result = await buildAgentRun({
      chain: bidi.chain,
      contractAddress: bidi.address,
      discoveryCategory: "general_crypto",
      reader,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bidi_override");
    expect(await projectCount()).toBe(before);
  });

  it("rejects a Lane-A identity leak (name collides with the frame) before budget", async () => {
    // "Base" passes sanitization but leaks into every Lane A prompt ("on Base").
    const leakReader: TokenMetadataReader = {
      async read() {
        return { chainId: 8453, hasBytecode: true, name: "Base", symbol: "BASE", decimals: 18 };
      },
    };
    const before = await projectCount();
    const result = await buildAgentRun({
      chain: "base",
      contractAddress: "0x" + "a".repeat(40),
      discoveryCategory: "general_crypto",
      reader: leakReader,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("lane_a_identity_leak");
    expect(await projectCount()).toBe(before);
  });
});
