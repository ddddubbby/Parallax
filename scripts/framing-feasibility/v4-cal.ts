/**
 * framing-protocol.v4 CAL-1 (span budget) + CAL-2 (prompt-wording steering) on
 * Insta360 DEVELOPMENT data (D-098 §12). Runs the ratified bare admission prompts
 * plus the two diagnostic probes, extracts v4 spans, and reports:
 *   CAL-1: dedup'd span count per scope vs the proposed N_max=60.
 *   CAL-2: per-admission-prompt dimension spread vs the (known-steered) probes —
 *          an admission prompt as concentrated as a probe is accidentally steering.
 * No scoring, no eligibility. Writes docs/audits/m34/v4-cal.json + a short report.
 * Insta360 is dev data; this calibration is permitted before freeze and never after.
 *
 * Usage: pnpm exec tsx scripts/framing-feasibility/v4-cal.ts
 */
import "../../src/env-bootstrap";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db/client";
import { brands, projects } from "../../src/db/schema";
import { FEASIBILITY_PROJECTS } from "./protocol";
import {
  OUT_DIR,
  FIXTURES_DIR,
  ensureDirs,
  generateUngrounded,
  loadExistingOrNull,
  log,
  preflightCredentials,
  reportFatal,
  resolveLiveCredentials,
  resolvePrompt,
  writeJson,
} from "./shared";
import { callV4SpanExtraction, dedupSpanTexts, type VerifiedSpan } from "./v4-extract";

const SCOPE = "v4-cal";
const GEN_PATH = join(OUT_DIR, "v4-cal-generations.json");
const OUT_PATH = join(OUT_DIR, "v4-cal.json");
const REPORT_PATH = join(OUT_DIR, "v4-cal-report.md");
const PROVIDERS = ["deepseek", "openai"] as const;
const REPS = 5;
const DEV_CAP_USD = 3.0;

interface PromptSet {
  admission: { variantKey: string; text: string }[];
  diagnosticProbes: { variantKey: string; text: string }[];
}
interface GenRecord {
  id: string;
  kind: "admission" | "probe";
  variantKey: string;
  providerId: string;
  repIndex: number;
  rawText: string;
  temperature: number | null;
  costUsd: number;
}
interface ExtractRecord {
  genId: string;
  kind: "admission" | "probe";
  variantKey: string;
  providerId: string;
  state: string;
  spans: VerifiedSpan[];
  droppedSpans: number;
  costUsd: number;
}

async function loadInsta360(): Promise<{ brandName: string }> {
  const project = (await db.select().from(projects).where(eq(projects.slug, FEASIBILITY_PROJECTS.insta360.slug)))[0];
  if (!project) throw new Error("Insta360 project not found");
  const client = (await db.select().from(brands).where(eq(brands.projectId, project.id))).find((b) => b.role === "client");
  if (!client) throw new Error("Insta360 client brand missing");
  return { brandName: client.name };
}

async function main() {
  ensureDirs();
  await preflightCredentials([...PROVIDERS]);
  const prompts = loadExistingOrNull<PromptSet>(join(FIXTURES_DIR, "representation-prompts.v4.json"));
  if (!prompts?.admission?.length) throw new Error("representation-prompts.v4.json missing/invalid");
  const { brandName } = await loadInsta360();
  log(SCOPE, `brand=${brandName}; admission=${prompts.admission.length}; probes=${prompts.diagnosticProbes.length}`);

  const existing = loadExistingOrNull<{ generations: GenRecord[] }>(GEN_PATH);
  const generations: GenRecord[] = existing?.generations ?? [];
  const seen = new Set(generations.map((g) => g.id));
  let cost = generations.reduce((s, g) => s + g.costUsd, 0);

  const items = [
    ...prompts.admission.map((p) => ({ kind: "admission" as const, ...p })),
    ...prompts.diagnosticProbes.map((p) => ({ kind: "probe" as const, ...p })),
  ];

  for (const provider of PROVIDERS) {
    for (const item of items) {
      const promptText = resolvePrompt(item.text, brandName);
      for (let rep = 1; rep <= REPS; rep++) {
        const id = `${provider}-${item.variantKey}-r${rep}`;
        if (seen.has(id)) continue;
        if (cost >= DEV_CAP_USD) throw new Error(`Dev cap $${DEV_CAP_USD} reached at ${id}`);
        log(SCOPE, `generate ${id}`);
        const r = await generateUngrounded(provider, promptText);
        cost += r.costUsd;
        generations.push({ id, kind: item.kind, variantKey: item.variantKey, providerId: provider, repIndex: rep, rawText: r.text, temperature: r.temperature ?? null, costUsd: r.costUsd });
        writeJson(GEN_PATH, { generations });
      }
    }
  }
  log(SCOPE, `generations=${generations.length}, $${cost.toFixed(4)}`);

  // Extract v4 spans (DeepSeek extractor, temp 0, offset-verified).
  const dsCreds = await resolveLiveCredentials("deepseek");
  const existingEx = loadExistingOrNull<{ records: ExtractRecord[] }>(OUT_PATH);
  const records: ExtractRecord[] = existingEx?.records ?? [];
  const doneEx = new Set(records.map((r) => r.genId));
  let exCost = records.reduce((s, r) => s + r.costUsd, 0);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let permanentlyFailed = 0;
  for (const g of generations) {
    if (doneEx.has(g.id)) continue;
    if (cost + exCost >= DEV_CAP_USD) throw new Error(`Dev cap $${DEV_CAP_USD} reached during extraction at ${g.id}`);
    log(SCOPE, `extract ${g.id}`);
    // Dead-letter tolerance (production parity, D-095): a single response that
    // fails extraction even after backoff-retries must not crash the whole run.
    // Record it as `extraction_failed` — it counts in the denominator (D-096
    // honesty) but contributes no spans — and continue.
    let state: string;
    let spans: VerifiedSpan[] = [];
    let droppedSpans = 0;
    let callCost = 0;
    try {
      const r = await callV4SpanExtraction(dsCreds, { observedBrandName: brandName, rawText: g.rawText });
      state = r.state;
      spans = r.spans;
      droppedSpans = r.droppedSpans;
      callCost = r.costUsd;
    } catch (err) {
      state = "extraction_failed";
      permanentlyFailed += 1;
      log(SCOPE, `extraction permanently failed for ${g.id} (${err instanceof Error ? err.message : String(err)}) — recorded, continuing`);
    }
    exCost += callCost;
    records.push({ genId: g.id, kind: g.kind, variantKey: g.variantKey, providerId: g.providerId, state, spans, droppedSpans, costUsd: callCost });
    writeJson(OUT_PATH, { records });
    await sleep(400); // ease burst pressure on the provider (rate-limit-shaped failures)
  }
  log(SCOPE, `extractions=${records.length} (${permanentlyFailed} permanently failed), extract $${exCost.toFixed(4)}`);

  // --- CAL-1: dedup'd span count per scope (project×provider), admission spans only ---
  const cal1: Record<string, { dedupSpans: number; totalSpans: number; droppedSpans: number; withinBudget: boolean }> = {};
  for (const provider of PROVIDERS) {
    const admin = records.filter((r) => r.providerId === provider && r.kind === "admission");
    const allSpans = admin.flatMap((r) => r.spans);
    const dedup = dedupSpanTexts(allSpans).length;
    cal1[`insta360|${provider}|ungrounded`] = {
      dedupSpans: dedup,
      totalSpans: allSpans.length,
      droppedSpans: admin.reduce((s, r) => s + r.droppedSpans, 0),
      withinBudget: dedup <= 60,
    };
  }

  // --- CAL-2: per-prompt dimension spread. Steered => concentrated (low entropy). ---
  const dimEntropy = (recs: ExtractRecord[]) => {
    const counts = new Map<string, number>();
    for (const r of recs) for (const s of r.spans) counts.set(s.dimension, (counts.get(s.dimension) ?? 0) + 1);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (total === 0) return { entropy: 0, top: null as string | null, topShare: 0, n: 0 };
    let h = 0;
    let top: string | null = null;
    let topN = 0;
    for (const [dim, n] of counts) {
      const p = n / total;
      h -= p * Math.log2(p);
      if (n > topN) { topN = n; top = dim; }
    }
    return { entropy: Number(h.toFixed(3)), top, topShare: Number((topN / total).toFixed(3)), n: total };
  };
  const byVariant: Record<string, ReturnType<typeof dimEntropy>> = {};
  const allVariants = [...new Set(records.map((r) => r.variantKey))];
  for (const v of allVariants) byVariant[v] = dimEntropy(records.filter((r) => r.variantKey === v));
  const admissionVariants = prompts.admission.map((p) => p.variantKey);
  const probeVariants = prompts.diagnosticProbes.map((p) => p.variantKey);
  const meanTopShare = (vs: string[]) => Number((vs.reduce((s, v) => s + byVariant[v]!.topShare, 0) / vs.length).toFixed(3));
  const admissionMeanTopShare = meanTopShare(admissionVariants);
  const probeMeanTopShare = meanTopShare(probeVariants);
  // Flag an admission prompt whose top-dimension concentration approaches the probes'.
  const steerFlags = admissionVariants.filter((v) => byVariant[v]!.topShare >= probeMeanTopShare);

  const analysis = {
    calibratedAt: new Date().toISOString(),
    brand: brandName,
    generations: generations.length,
    extractions: records.length,
    stateDistribution: records.reduce<Record<string, number>>((acc, r) => { acc[r.state] = (acc[r.state] ?? 0) + 1; return acc; }, {}),
    cal1_spanBudget: { proposedNmax: 60, perScope: cal1, recommendation: Object.values(cal1).every((c) => c.withinBudget) ? "N_max=60 holds for all Insta360 scopes" : "AT LEAST ONE SCOPE EXCEEDS 60 — tighten extractor or raise budget with rationale (never to admit an overflow scope)" },
    cal2_steering: { admissionMeanTopDimensionShare: admissionMeanTopShare, probeMeanTopDimensionShare: probeMeanTopShare, perVariant: byVariant, admissionPromptsFlaggedAsSteering: steerFlags, recommendation: steerFlags.length === 0 ? "no bare admission prompt steers as hard as the probes — wording holds" : `reword/inspect admission prompts: ${steerFlags.join(", ")}` },
    costs: { generationUsd: Number(cost.toFixed(4)), extractionUsd: Number(exCost.toFixed(4)), totalUsd: Number((cost + exCost).toFixed(4)), capUsd: DEV_CAP_USD },
  };
  writeJson(join(OUT_DIR, "v4-cal-analysis.json"), analysis);

  const report = `# framing-protocol.v4 — CAL-1 / CAL-2 (Insta360 dev data)

> ${analysis.calibratedAt} · brand ${brandName} · ${records.length} extractions · $${analysis.costs.totalUsd} (cap $${DEV_CAP_USD})
> Calibration only — no scoring, no eligibility. Insta360 is development data.

## Extraction states
${Object.entries(analysis.stateDistribution).map(([s, n]) => `- ${s}: ${n}`).join("\n")}

## CAL-1 — span budget (admission spans, per scope)
proposed N_max = 60
${Object.entries(cal1).map(([k, c]) => `- \`${k}\`: dedup'd spans **${c.dedupSpans}** (total ${c.totalSpans}, dropped/offset-unsupported ${c.droppedSpans}) — ${c.withinBudget ? "within budget" : "**OVER BUDGET**"}`).join("\n")}

**Recommendation:** ${analysis.cal1_spanBudget.recommendation}

## CAL-2 — prompt-wording steering (top-dimension concentration)
Admission mean top-dimension share: **${admissionMeanTopShare}** · Probe mean (known-steered): **${probeMeanTopShare}**
${allVariants.map((v) => `- \`${v}\` (${admissionVariants.includes(v) ? "admission" : "probe"}): top=${byVariant[v]!.top} share=${byVariant[v]!.topShare} entropy=${byVariant[v]!.entropy} n=${byVariant[v]!.n}`).join("\n")}

**Recommendation:** ${analysis.cal2_steering.recommendation}

## Next
Freeze requires lead confirmation of the calibrated N_max and any CAL-2 rewording, then
\`framing-protocol.v4.json\` flips \`status:"frozen"\` + \`frozenAt\`. Only then may controls,
the clause ablation, gold, and held-outs be scored (§12).
`;
  writeJson(join(OUT_DIR, "v4-cal-analysis.json"), analysis);
  writeFileSync(REPORT_PATH, report, "utf8");
  log(SCOPE, `CAL-1 budget ok=${Object.values(cal1).every((c) => c.withinBudget)}; CAL-2 steer-flags=${steerFlags.length}; wrote ${REPORT_PATH}`);
  await pool.end();
}

main().catch(async (err) => {
  const code = reportFatal(err);
  await pool.end().catch(() => undefined);
  process.exit(code);
});
