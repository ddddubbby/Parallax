// Programmatic contract → project → matrix → run path for the GEO agent
// (AGENT_BUILD_PLAN §6.2). NO UI or server-action dependency: this is the
// headless core the ACP gateway (M40) will drive. Every pre-budget rejection
// (resolver failure, Lane-A identity leak) returns without creating any DB row.

import {
  CRYPTO_GEO_PROMPTS_VERSION,
  resolveCryptoMatrix,
  scanLaneAForIdentity,
  type DiscoveryCategory,
} from "@/core/crypto-prompts";
import type { AssetChain, ResolverRejection } from "@/core/crypto-resolver";
import { computePlannedCalls, type ProviderId } from "@/core/runner";
import { db } from "@/db/client";
import { createRun, type ProviderCapability } from "@/db/repositories/runner";
import { matrixVersions, projects, promptCells } from "@/db/schema";
import { resolveTokenIdentity, type ResolvedIdentity, type TokenMetadataReader } from "./resolver";

/** The three grounded engines every job runs (AGENT_PRD §5). */
export const AGENT_ENGINES = ["openai", "google", "xai"] as const;
/** k=5 repeats per cell per engine (AGENT_PRD §5 / D-003). */
export const AGENT_REPETITIONS = 5;

/**
 * A Lane-A identity leak is a pre-budget rejection just like a resolver
 * failure, but it originates from the prompt scan (P3), not §3. It carries a
 * reason outside ResolverRejectionReason so callers can tell them apart.
 */
export interface LaneAIdentityLeakRejection {
  ok: false;
  reason: "lane_a_identity_leak";
  detail: string;
}

export type AgentRunRejection = ResolverRejection | LaneAIdentityLeakRejection;

export interface BuildAgentRunInput {
  chain: AssetChain;
  contractAddress: string;
  /** Selects the Lane-A prompt pack ONLY (AGENT_PRD §2). Query context, not metadata. */
  discoveryCategory: DiscoveryCategory;
  reader: TokenMetadataReader;
  /** Defaults to mock. `live_validation` runs cheap (k=2) live calls (M38 OpenAI slice). */
  runMode?: "mock" | "live_validation" | "live_audit";
  /**
   * The engines to run. Defaults to the production three (AGENT_PRD §5). M38
   * live testing overrides this to `["openai"]` while Gemini/Grok stay unwired —
   * a validation slice, NOT the full 900-sample three-engine spike.
   */
  engines?: readonly ProviderId[];
  /** k per cell per engine. Defaults to k=5 (audit-grade); live_validation may use k=2. */
  repetitions?: number;
  costCapUsd?: number;
}

export interface BuildAgentRunSuccess {
  ok: true;
  projectId: string;
  matrixVersionId: string;
  runId: string;
  identity: ResolvedIdentity;
  promptMatrixVersion: string;
  plannedCalls: number;
}

export type BuildAgentRunResult = BuildAgentRunSuccess | AgentRunRejection;

function agentCapabilities(engines: readonly ProviderId[]): ProviderCapability[] {
  return engines.map((id) => ({ id, supportsGrounded: true, supportsUngrounded: true }));
}

function projectSlug(chain: AssetChain, address: string): string {
  return `geo-${chain}-${address.slice(2, 10).toLowerCase()}-${Date.now().toString(36)}`;
}

/**
 * Resolve a token, build its 20-cell matrix, and create a mock run of all three
 * engines at k=5 (300 planned samples). Returns the created ids, or a pre-budget
 * rejection with NO rows written.
 */
export async function buildAgentRun(input: BuildAgentRunInput): Promise<BuildAgentRunResult> {
  const runMode = input.runMode ?? "mock";

  // Steps 1–8: resolve + sanitize identity. Any failure rejects before budget.
  const resolved = await resolveTokenIdentity(
    { chain: input.chain, contractAddress: input.contractAddress },
    input.reader,
  );
  if (!resolved.ok) return resolved;

  // Resolve the 20 cells and run the job-time Lane-A scan (P3) BEFORE writing
  // anything: an attacker-controlled name that collides with the unbranded
  // frame is a pre-budget rejection, not a stored run.
  const cells = resolveCryptoMatrix(
    { chain: resolved.chain, address: resolved.address, name: resolved.name, symbol: resolved.symbol },
    input.discoveryCategory,
  );
  const leaks = scanLaneAForIdentity(cells, resolved.name, resolved.symbol);
  if (leaks.length > 0) {
    return {
      ok: false,
      reason: "lane_a_identity_leak",
      detail: `token identity leaked into ${leaks.length} Lane-A cell(s): ${leaks
        .map((l) => l.variantKey)
        .join(", ")}`,
    };
  }

  // Create the crypto_token project + approved matrix + cells in one transaction.
  // Agent matrices are born `approved` (D-064 resonance-compile precedent):
  // there is no operator draft/approval step in the serving path.
  const { projectId, matrixVersionId } = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        name: `${resolved.name} (${resolved.symbol}) — ${resolved.chain}`,
        slug: projectSlug(resolved.chain, resolved.address),
        categoryArchetype: "crypto_token",
        status: "active",
      })
      .returning({ id: projects.id });

    const [version] = await tx
      .insert(matrixVersions)
      .values({
        projectId: project.id,
        kind: "audit",
        version: 1,
        state: "approved",
        cellCount: cells.length,
        approvedAt: new Date(),
      })
      .returning({ id: matrixVersions.id });

    for (const cell of cells) {
      await tx.insert(promptCells).values({
        matrixVersionId: version.id,
        intent: cell.intent,
        personaId: null,
        marketId: null,
        variantKey: cell.variantKey,
        resolvedText: cell.resolvedText,
      });
    }
    return { projectId: project.id, matrixVersionId: version.id };
  });

  const engines = input.engines ?? AGENT_ENGINES;
  const repetitions = input.repetitions ?? AGENT_REPETITIONS;
  const plannedCalls = computePlannedCalls(cells.length, engines.length, 1, repetitions);
  const run = await createRun(
    {
      projectId,
      matrixVersionId,
      runMode,
      repetitions,
      providers: [...engines],
      modes: ["grounded"],
      costCapUsd: input.costCapUsd ?? 25,
    },
    agentCapabilities(engines),
    plannedCalls,
  );

  return {
    ok: true,
    projectId,
    matrixVersionId,
    runId: run.id,
    identity: resolved,
    promptMatrixVersion: CRYPTO_GEO_PROMPTS_VERSION,
    plannedCalls,
  };
}

/** Load the checked-in mock token fixtures as a reader for offline agent runs. */
export { createFixtureMetadataReader } from "./resolver";

/** Re-export so callers building a run need one import. */
export type { TokenMetadataReader, ResolvedIdentity } from "./resolver";
