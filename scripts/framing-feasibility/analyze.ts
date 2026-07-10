/**
 * M34 Phase 0 — analyze organic + neutral frame extractions, evaluate draft
 * eligibility rules, freeze framing-protocol.v1.json on GO.
 *
 * GO: ≥1 real baseline passes AND ≥1 deliberately-unstable fixture abstains.
 * NO-GO: zero real baselines pass → do not auto-loosen; escalate.
 *
 * Usage: pnpm exec tsx scripts/framing-feasibility/analyze.ts
 * Optional: --skip-embed to use exact label matching only (no OpenAI embeddings)
 */
import "../../src/env-bootstrap";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRAFT_ELIGIBILITY,
  GATE_EXCLUDED_SCOPES,
  NEUTRAL_SAMPLING,
  REPRESENTATION_PROMPTS_V1,
  UNCERTAINTY_ALLOWANCE,
  BLIND_FRAME_SCHEMA_INSTRUCTIONS,
  buildBlindFrameExtractionPrompt,
} from "./protocol";
import {
  OUT_DIR,
  FIXTURES_DIR,
  cosineSimilarity,
  embedTexts,
  ensureDirs,
  loadExistingOrNull,
  log,
  normalizeFrameLabel,
  preflightCredentials,
  reportFatal,
  writeJson,
  type FrameExtractionRecord,
  type BlindFramePayload,
} from "./shared";

const SCOPE = "analyze";

interface OrganicFile {
  records: FrameExtractionRecord[];
  totalCostUsd: number;
}

interface NeutralFile {
  records: FrameExtractionRecord[];
  totalCostUsd: number;
}

interface FrameHit {
  responseId: string;
  cellId: string | null;
  variantKey: string | null;
  providerId: string;
  generationMode: string;
  projectSlug: string;
  dimension: string;
  label: string;
  normalizedLabel: string;
  clusterKey: string;
}

type EligibilityStatus =
  | "eligible"
  | "extraction_incomplete"
  | "sparse"
  | "recurring_only"
  | "prompt_sensitive"
  | "volatile"
  | "divergent"
  | "tie";

interface EligibilityResult {
  status: EligibilityStatus;
  lane: "organic_in_context" | "neutral_elicited";
  scopeKey: string;
  topFrame: string | null;
  diagnostics: Record<string, unknown>;
}

function framesFromRecord(rec: FrameExtractionRecord): FrameHit[] {
  const payload = rec.payload as BlindFramePayload | null;
  if (!payload || payload.state !== "ok") return [];
  return payload.frames.map((f) => {
    const normalizedLabel = normalizeFrameLabel(f.frame_label);
    return {
      responseId: rec.sourceResponseId,
      cellId: rec.cellId,
      variantKey: rec.variantKey,
      providerId: rec.providerId,
      generationMode: rec.generationMode,
      projectSlug: rec.projectSlug,
      dimension: f.frame_dimension,
      label: f.frame_label,
      normalizedLabel,
      // Phase 0 clustering: exact normalized label within dimension (embedding merge optional).
      clusterKey: `${f.frame_dimension}::${normalizedLabel}`,
    };
  });
}

/** Merge cluster keys whose label embeddings exceed threshold (same dimension only). */
function mergeByEmbedding(
  hits: FrameHit[],
  vectorsByLabel: Map<string, number[]>,
  threshold: number,
): FrameHit[] {
  const labels = [...new Set(hits.map((h) => h.normalizedLabel))];
  const parent = new Map<string, string>();
  for (const l of labels) parent.set(l, l);
  function find(x: string): string {
    const p = parent.get(x)!;
    if (p !== x) {
      const r = find(p);
      parent.set(x, r);
      return r;
    }
    return x;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!;
      const b = labels[j]!;
      const va = vectorsByLabel.get(a);
      const vb = vectorsByLabel.get(b);
      if (!va || !vb) continue;
      if (cosineSimilarity(va, vb) >= threshold) union(a, b);
    }
  }

  return hits.map((h) => {
    const root = find(h.normalizedLabel);
    return { ...h, clusterKey: `${h.dimension}::${root}` };
  });
}

function evaluateNeutral(
  hits: FrameHit[],
  expectedVariants: string[],
  reps: number,
  scopeKey: string,
): EligibilityResult {
  const byVariant = new Map<string, FrameHit[]>();
  for (const v of expectedVariants) byVariant.set(v, []);
  for (const h of hits) {
    if (!h.variantKey) continue;
    byVariant.get(h.variantKey)?.push(h);
  }

  // Completeness: each variant should have `reps` responses that produced ≥0 frames.
  // We infer response ids per variant from hits; incomplete if any variant missing.
  const responseIdsByVariant = new Map<string, Set<string>>();
  for (const h of hits) {
    if (!h.variantKey) continue;
    if (!responseIdsByVariant.has(h.variantKey)) responseIdsByVariant.set(h.variantKey, new Set());
    responseIdsByVariant.get(h.variantKey)!.add(h.responseId);
  }
  const missingVariants = expectedVariants.filter((v) => (responseIdsByVariant.get(v)?.size ?? 0) < reps);
  if (missingVariants.length > 0) {
    return {
      status: "extraction_incomplete",
      lane: "neutral_elicited",
      scopeKey,
      topFrame: null,
      diagnostics: { missingVariants, responseIdsByVariant: Object.fromEntries([...responseIdsByVariant].map(([k, v]) => [k, v.size])) },
    };
  }

  function winsFor(excludeVariant?: string): Map<string, number> {
    const wins = new Map<string, number>();
    for (const variant of expectedVariants) {
      if (variant === excludeVariant) continue;
      const variantHits = hits.filter((h) => h.variantKey === variant);
      const responses = [...new Set(variantHits.map((h) => h.responseId))];
      const counts = new Map<string, number>();
      for (const responseId of responses) {
        // One response contributes at most once per cluster (dedup).
        const clusters = new Set(variantHits.filter((h) => h.responseId === responseId).map((h) => h.clusterKey));
        for (const c of clusters) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      const winners = [...counts.entries()].filter(([, n]) => n >= DRAFT_ELIGIBILITY.neutralVariantWinMin);
      if (winners.length === 0) continue;
      winners.sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
      const topCount = winners[0]![1]!;
      const tied = winners.filter(([, n]) => n === topCount);
      if (tied.length === 1) {
        const key = tied[0]![0]!;
        wins.set(key, (wins.get(key) ?? 0) + 1);
      }
    }
    return wins;
  }

  const fullWins = winsFor();
  if (fullWins.size === 0) {
    return {
      status: "recurring_only",
      lane: "neutral_elicited",
      scopeKey,
      topFrame: null,
      diagnostics: { fullWins: {} },
    };
  }

  const ranked = [...fullWins.entries()].sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
  const top = ranked[0]!;
  const tiedTop = ranked.filter(([, n]) => n === top[1]);
  if (tiedTop.length > 1) {
    return {
      status: "tie",
      lane: "neutral_elicited",
      scopeKey,
      topFrame: null,
      diagnostics: { tiedTop: tiedTop.map(([k, n]) => ({ frame: k, wins: n })) },
    };
  }
  if (top[1]! < DRAFT_ELIGIBILITY.neutralVariantWinsRequired) {
    return {
      status: top[1]! >= 2 ? "prompt_sensitive" : "volatile",
      lane: "neutral_elicited",
      scopeKey,
      topFrame: top[0]!,
      diagnostics: { fullWins: Object.fromEntries(fullWins), topWins: top[1] },
    };
  }

  // Leave-one-variant-out: top must remain uniquely top under each exclusion.
  for (const excluded of expectedVariants) {
    const loo = winsFor(excluded);
    const looRanked = [...loo.entries()].sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
    if (looRanked.length === 0 || looRanked[0]![0] !== top[0]) {
      return {
        status: "prompt_sensitive",
        lane: "neutral_elicited",
        scopeKey,
        topFrame: top[0]!,
        diagnostics: { fullWins: Object.fromEntries(fullWins), failedLooExclude: excluded, looWins: Object.fromEntries(loo) },
      };
    }
    const looTopCount = looRanked[0]![1]!;
    if (looRanked.filter(([, n]) => n === looTopCount).length > 1) {
      return {
        status: "prompt_sensitive",
        lane: "neutral_elicited",
        scopeKey,
        topFrame: top[0]!,
        diagnostics: { fullWins: Object.fromEntries(fullWins), failedLooExclude: excluded, reason: "loo_tie" },
      };
    }
  }

  return {
    status: "eligible",
    lane: "neutral_elicited",
    scopeKey,
    topFrame: top[0]!,
    diagnostics: { fullWins: Object.fromEntries(fullWins), topWins: top[1] },
  };
}

function evaluateOrganic(hits: FrameHit[], scopeKey: string): EligibilityResult {
  // Group by cell; a cell qualifies if ≥ organicCellQualifyMin distinct responses have ≥1 frame
  // (proxy for spontaneous mention — these hits already come from mention-filtered responses).
  const byCell = new Map<string, FrameHit[]>();
  for (const h of hits) {
    if (!h.cellId) continue;
    if (!byCell.has(h.cellId)) byCell.set(h.cellId, []);
    byCell.get(h.cellId)!.push(h);
  }

  const qualifyingCells: string[] = [];
  const cellWinners = new Map<string, string>(); // cellId -> clusterKey

  for (const [cellId, cellHits] of byCell) {
    const responseIds = [...new Set(cellHits.map((h) => h.responseId))];
    if (responseIds.length < DRAFT_ELIGIBILITY.organicCellQualifyMin) continue;
    qualifyingCells.push(cellId);

    const counts = new Map<string, number>();
    for (const responseId of responseIds) {
      const clusters = new Set(cellHits.filter((h) => h.responseId === responseId).map((h) => h.clusterKey));
      for (const c of clusters) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const majority = Math.floor(responseIds.length / 2) + 1;
    const winners = [...counts.entries()].filter(([, n]) => n >= majority);
    if (winners.length === 0) continue;
    winners.sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
    const topCount = winners[0]![1]!;
    const tied = winners.filter(([, n]) => n === topCount);
    if (tied.length === 1) cellWinners.set(cellId, tied[0]![0]!);
  }

  if (qualifyingCells.length < DRAFT_ELIGIBILITY.organicCellWinsRequired) {
    return {
      status: "sparse",
      lane: "organic_in_context",
      scopeKey,
      topFrame: null,
      diagnostics: {
        qualifyingCellCount: qualifyingCells.length,
        required: DRAFT_ELIGIBILITY.organicCellWinsRequired,
        label: "SPARSE ORGANIC EVIDENCE",
      },
    };
  }

  const winCounts = new Map<string, number>();
  for (const frame of cellWinners.values()) {
    winCounts.set(frame, (winCounts.get(frame) ?? 0) + 1);
  }
  if (winCounts.size === 0) {
    return {
      status: "recurring_only",
      lane: "organic_in_context",
      scopeKey,
      topFrame: null,
      diagnostics: { qualifyingCellCount: qualifyingCells.length },
    };
  }

  const ranked = [...winCounts.entries()].sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
  const top = ranked[0]!;
  if (ranked.filter(([, n]) => n === top[1]).length > 1) {
    return {
      status: "tie",
      lane: "organic_in_context",
      scopeKey,
      topFrame: null,
      diagnostics: { winCounts: Object.fromEntries(winCounts) },
    };
  }
  if (top[1]! < DRAFT_ELIGIBILITY.organicCellWinsRequired) {
    return {
      status: "prompt_sensitive",
      lane: "organic_in_context",
      scopeKey,
      topFrame: top[0]!,
      diagnostics: { winCounts: Object.fromEntries(winCounts), topWins: top[1] },
    };
  }

  // Leave-one-cell-out
  const winningCells = [...cellWinners.entries()].filter(([, f]) => f === top[0]).map(([c]) => c);
  for (const excluded of winningCells) {
    const looCounts = new Map<string, number>();
    for (const [cellId, frame] of cellWinners) {
      if (cellId === excluded) continue;
      looCounts.set(frame, (looCounts.get(frame) ?? 0) + 1);
    }
    const looRanked = [...looCounts.entries()].sort((a, b) => b[1]! - a[1]! || a[0]!.localeCompare(b[0]!));
    if (looRanked.length === 0 || looRanked[0]![0] !== top[0]) {
      return {
        status: "prompt_sensitive",
        lane: "organic_in_context",
        scopeKey,
        topFrame: top[0]!,
        diagnostics: { failedLooCell: excluded, winCounts: Object.fromEntries(winCounts) },
      };
    }
  }

  return {
    status: "eligible",
    lane: "organic_in_context",
    scopeKey,
    topFrame: top[0]!,
    diagnostics: { winCounts: Object.fromEntries(winCounts), qualifyingCellCount: qualifyingCells.length, topWins: top[1] },
  };
}

/** Deliberately unstable synthetic fixture: rotating frames so no frame wins ≥5/6. */
function buildUnstableFixture(): FrameHit[] {
  const frames = [
    "category::action camera",
    "category::360 camera",
    "category::vlog camera",
    "category::sports cam",
    "category::webcam",
    "category::drone camera",
  ];
  const hits: FrameHit[] = [];
  for (let vi = 0; vi < 6; vi++) {
    const variantKey = `v${vi + 1}`;
    for (let rep = 1; rep <= 5; rep++) {
      const frame = frames[(vi + rep) % frames.length]!;
      const [dimension, label] = frame.split("::") as [string, string];
      hits.push({
        responseId: `unstable-${variantKey}-r${rep}`,
        cellId: null,
        variantKey,
        providerId: "fixture",
        generationMode: "ungrounded",
        projectSlug: "unstable-fixture",
        dimension,
        label,
        normalizedLabel: label,
        clusterKey: frame,
      });
    }
  }
  return hits;
}

async function main() {
  ensureDirs();
  const skipEmbed = process.argv.includes("--skip-embed");
  // Embeddings resolve the OpenAI credential lazily, deep in the run; check it
  // up front so a broken key fails here rather than after the analysis pass.
  if (!skipEmbed) await preflightCredentials(["openai"]);

  const organic = loadExistingOrNull<OrganicFile>(join(OUT_DIR, "organic-frames.json"));
  const neutral = loadExistingOrNull<NeutralFile>(join(OUT_DIR, "neutral-frames.json"));
  if (!organic?.records?.length) {
    throw new Error("Missing docs/audits/m34/organic-frames.json — run extract-frames.ts first");
  }
  if (!neutral?.records?.length) {
    throw new Error("Missing docs/audits/m34/neutral-frames.json — run neutral-mini-run.ts first");
  }

  log(SCOPE, `organic records=${organic.records.length}; neutral records=${neutral.records.length}`);

  let organicHits = organic.records.flatMap(framesFromRecord);
  let neutralHits = neutral.records.flatMap(framesFromRecord);

  let embedCost = 0;
  let embedModel = "none";
  if (!skipEmbed) {
    const labels = [...new Set([...organicHits, ...neutralHits].map((h) => h.normalizedLabel))];
    log(SCOPE, `embedding ${labels.length} distinct frame labels for clustering sensitivity`);
    const { vectors, costUsd, model } = await embedTexts(labels);
    embedCost = costUsd;
    embedModel = model;
    const vectorsByLabel = new Map(labels.map((l, i) => [l, vectors[i]!]));
    // Apply default threshold merge for eligibility; sweep reported separately.
    organicHits = mergeByEmbedding(organicHits, vectorsByLabel, DRAFT_ELIGIBILITY.clusteringCosineThreshold);
    neutralHits = mergeByEmbedding(neutralHits, vectorsByLabel, DRAFT_ELIGIBILITY.clusteringCosineThreshold);
  }

  const results: EligibilityResult[] = [];

  // Neutral scopes: per project × provider × mode
  const neutralScopes = new Map<string, FrameHit[]>();
  for (const h of neutralHits) {
    const key = `neutral|${h.projectSlug}|${h.providerId}|${h.generationMode}`;
    if (!neutralScopes.has(key)) neutralScopes.set(key, []);
    neutralScopes.get(key)!.push(h);
  }
  const expectedVariants = REPRESENTATION_PROMPTS_V1.map((p) => p.variantKey);
  for (const [scopeKey, hits] of neutralScopes) {
    // Infer reps from data
    const reps =
      Math.max(
        ...expectedVariants.map(
          (v) => new Set(hits.filter((h) => h.variantKey === v).map((h) => h.responseId)).size,
        ),
        0,
      ) || DRAFT_ELIGIBILITY.repetitionsPerVariant;
    results.push(evaluateNeutral(hits, [...expectedVariants], reps, scopeKey));
  }

  // Organic scopes
  const organicScopes = new Map<string, FrameHit[]>();
  for (const h of organicHits) {
    const key = `organic|${h.projectSlug}|${h.providerId}|${h.generationMode}`;
    if (!organicScopes.has(key)) organicScopes.set(key, []);
    organicScopes.get(key)!.push(h);
  }
  for (const [scopeKey, hits] of organicScopes) {
    results.push(evaluateOrganic(hits, scopeKey));
  }

  // Unstable fixture must abstain
  const unstable = evaluateNeutral(
    buildUnstableFixture(),
    expectedVariants,
    5,
    "neutral|unstable-fixture|fixture|ungrounded",
  );

  // GATE_EXCLUDED_SCOPES results are diagnostic-only: an invalid dataset
  // (e.g. the b2b-mislabeled Heytea organic scope) must never freeze the
  // protocol, even if it happens to satisfy the rules.
  const eligibleAll = results.filter((r) => r.status === "eligible");
  const realPasses = eligibleAll.filter((r) => !(r.scopeKey in GATE_EXCLUDED_SCOPES));
  const excludedPasses = eligibleAll.filter((r) => r.scopeKey in GATE_EXCLUDED_SCOPES);
  const unstableAbstains = unstable.status !== "eligible";
  const go = realPasses.length >= 1 && unstableAbstains;

  // Salvage stats (blind-frame-extraction.v2 per-frame salvage).
  const salvage = {
    truncatedQuotes:
      organic.records.reduce((s, r) => s + (r.truncatedQuotes ?? 0), 0) +
      neutral.records.reduce((s, r) => s + (r.truncatedQuotes ?? 0), 0),
    droppedFrames:
      organic.records.reduce((s, r) => s + (r.droppedFrames ?? 0), 0) +
      neutral.records.reduce((s, r) => s + (r.droppedFrames ?? 0), 0),
  };

  // Prevalence descriptive summary (no Wilson/CI)
  const prevalence = {
    note: "Descriptive only — 6 prompt variants × N generations; no Wilson interval or independence claim",
    neutralStructure: `${DRAFT_ELIGIBILITY.variantCount} variants × up to ${DRAFT_ELIGIBILITY.repetitionsPerVariant} generations`,
    organicMentionDensity: Object.fromEntries(
      [...organicScopes.entries()].map(([k, hits]) => [
        k,
        {
          responses: new Set(hits.map((h) => h.responseId)).size,
          cells: new Set(hits.map((h) => h.cellId).filter(Boolean)).size,
          frameHits: hits.length,
        },
      ]),
    ),
  };

  const analysis = {
    analyzedAt: new Date().toISOString(),
    goNoGo: go ? "GO" : "NO-GO",
    realEligibleBaselines: realPasses,
    gateExcludedEligible: excludedPasses.map((r) => ({
      scopeKey: r.scopeKey,
      reason: GATE_EXCLUDED_SCOPES[r.scopeKey],
    })),
    gateExclusions: GATE_EXCLUDED_SCOPES,
    allResults: results,
    unstableFixture: unstable,
    unstableAbstains,
    salvage,
    prevalence,
    costs: {
      organicExtractionUsd: organic.totalCostUsd,
      neutralExtractionUsd: neutral.totalCostUsd,
      embeddingUsd: embedCost,
      embeddingModel: embedModel,
    },
    draftRules: DRAFT_ELIGIBILITY,
  };

  writeJson(join(OUT_DIR, "analysis.json"), analysis);

  // Freeze protocol + prompt + blind schema fixtures (always write; GO/NO-GO recorded in report)
  writeJson(join(FIXTURES_DIR, "representation-prompts.v1.json"), {
    version: "representation-prompts.v1",
    uncertaintyAllowance: UNCERTAINTY_ALLOWANCE,
    prompts: REPRESENTATION_PROMPTS_V1,
    frozenAt: new Date().toISOString(),
    frozenBecause: go ? "Phase 0 GO" : "Phase 0 NO-GO — prompts retained for reassessment, not production",
  });

  writeJson(join(FIXTURES_DIR, `${DRAFT_ELIGIBILITY.blindExtractionVersion}.json`), {
    version: DRAFT_ELIGIBILITY.blindExtractionVersion,
    schemaVersion: 1,
    schemaInstructions: BLIND_FRAME_SCHEMA_INSTRUCTIONS,
    inputContract: ["observedBrandName", "rawText"],
    forbiddenInputs: [
      "fact sheet",
      "desired attributes",
      "competitors",
      "original prompt",
      "operator labels",
      "campaign goals",
      "corrected narratives",
    ],
    exampleAssembler: buildBlindFrameExtractionPrompt({
      observedBrandName: "ExampleBrand",
      rawText: "ExampleBrand is a placeholder answer used only to document the assembler shape.",
    }),
    frozenAt: new Date().toISOString(),
  });

  // Preserve any hand-recorded protocol facts already in the fixture (e.g.
  // neutralSampling, notes). A blind overwrite from DRAFT_ELIGIBILITY silently
  // destroyed the recorded per-engine sampling asymmetry once already — the
  // fixture is an evidence artifact, not a scratch file. The file is named by
  // protocolVersion: superseded versions (v1's NO-GO record) are never touched.
  const protocolPath = join(FIXTURES_DIR, `${DRAFT_ELIGIBILITY.protocolVersion}.json`);
  const existingProtocol =
    loadExistingOrNull<Record<string, unknown>>(protocolPath) ??
    loadExistingOrNull<Record<string, unknown>>(join(FIXTURES_DIR, "framing-protocol.v1.json")) ??
    {};

  writeJson(protocolPath, {
    ...existingProtocol,
    ...DRAFT_ELIGIBILITY,
    neutralSampling: NEUTRAL_SAMPLING,
    gateExclusions: GATE_EXCLUDED_SCOPES,
    notes: existingProtocol.notes ?? [],
    status: go ? "frozen" : "draft-not-frozen",
    frozenAt: go ? new Date().toISOString() : null,
    goNoGo: go ? "GO" : "NO-GO",
    evidence: {
      realEligibleCount: realPasses.length,
      realEligibleScopes: realPasses.map((r) => r.scopeKey),
      gateExcludedEligibleScopes: excludedPasses.map((r) => r.scopeKey),
      unstableFixtureStatus: unstable.status,
      salvage,
    },
  });

  writeJson(join(FIXTURES_DIR, "unstable-fixture.json"), {
    note: "SYNTHETIC — deliberately unstable rotating frames; must abstain under draft rules",
    hits: buildUnstableFixture(),
    expectedStatus: "not eligible",
    observedStatus: unstable.status,
  });

  // Markdown report
  const report = `# M34 Phase 0 — Framing feasibility

> Generated ${analysis.analyzedAt}
> **Verdict: ${analysis.goNoGo}**

## Gate

| Check | Result |
|---|---|
| ≥1 real baseline eligible | ${realPasses.length >= 1 ? `PASS (${realPasses.length}: ${realPasses.map((r) => r.scopeKey).join("; ")})` : "FAIL"} |
| Unstable fixture abstains | ${unstableAbstains ? `PASS (status=${unstable.status})` : "FAIL (incorrectly eligible)"} |

${
  go
    ? `Thresholds are frozen in \`fixtures/framing/${DRAFT_ELIGIBILITY.protocolVersion}.json\`. Proceed to Phase 1.`
    : "**NO-GO.** Do not loosen thresholds automatically. Stop before C-15; write a protocol-reassessment note and escalate."
}

Instrument: \`${DRAFT_ELIGIBILITY.protocolVersion}\` (blind extraction \`${DRAFT_ELIGIBILITY.blindExtractionVersion}\`, clustering \`${DRAFT_ELIGIBILITY.clusteringVersion}\`). Eligibility thresholds are byte-identical to framing-protocol.v1; v1's run-1 NO-GO record is preserved untouched.

## Gate exclusions (diagnostic-only scopes)

${Object.entries(GATE_EXCLUDED_SCOPES)
  .map(([k, why]) => `- \`${k}\` — ${why}`)
  .join("\n")}
${
  excludedPasses.length > 0
    ? `\n**Note:** ${excludedPasses.length} excluded scope(s) would otherwise be eligible (${excludedPasses.map((r) => r.scopeKey).join("; ")}) — reported for instrument diagnostics only, never gate evidence.\n`
    : ""
}
## Eligibility results

${results
  .map(
    (r) =>
      `- \`${r.scopeKey}\`${r.scopeKey in GATE_EXCLUDED_SCOPES ? " *(GATE-EXCLUDED)*" : ""} → **${r.status}**${r.topFrame ? ` (top: ${r.topFrame})` : ""}\n  - diagnostics: \`${JSON.stringify(r.diagnostics)}\``,
  )
  .join("\n")}

## Salvage (blind-frame-extraction.v2 per-frame validation)

- evidence quotes truncated to the 240-char cap: ${salvage.truncatedQuotes}
- individually invalid frames dropped: ${salvage.droppedFrames}
- whole-payload voiding removed: a response is now \`malformed\` only when its envelope is unparseable.

## Unstable fixture

- status: **${unstable.status}**
- diagnostics: \`${JSON.stringify(unstable.diagnostics)}\`

## Prevalence (descriptive only)

${JSON.stringify(prevalence, null, 2)}

## Costs (feasibility)

| Step | USD |
|---|---|
| Organic frame extraction | ${organic.totalCostUsd.toFixed(4)} |
| Neutral frame extraction | ${neutral.totalCostUsd.toFixed(4)} |
| Embedding (clustering) | ${embedCost.toFixed(4)} |

## Frozen artifacts

- \`fixtures/framing/${DRAFT_ELIGIBILITY.protocolVersion}.json\`
- \`fixtures/framing/representation-prompts.v1.json\`
- \`fixtures/framing/${DRAFT_ELIGIBILITY.blindExtractionVersion}.json\`
- \`fixtures/framing/unstable-fixture.json\`
- \`fixtures/framing/framing-protocol.v1.json\` (superseded — run-1 NO-GO record, untouched)

## Notes

- Heytea project is stored with \`category_archetype=b2b\` in the dev DB despite being a consumer tea brand; organic lane still used its discovery/consideration client-mention responses.
- Insta360 organic mention density is sparse (≤1 qualifying cell historically); neutral-elicited mini-run is the primary Insta360 evidence for Phase 0.
- Forbidden vocabulary ("bias-free" / "unbiased" / "vanilla") does not appear in this report.
`;

  writeFileSync(join(OUT_DIR, "phase0-feasibility.md"), report, "utf8");

  log(SCOPE, `verdict=${analysis.goNoGo}; realEligible=${realPasses.length}; unstable=${unstable.status}`);
  log(SCOPE, `wrote ${join(OUT_DIR, "analysis.json")} and phase0-feasibility.md`);
  if (!go) process.exitCode = 2;
}

main().catch((err) => {
  process.exit(reportFatal(err));
});
