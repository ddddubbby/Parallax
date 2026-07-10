/**
 * M34 Phase 0 — organic-in-context frame extraction harness.
 *
 * Read-only against stored Insta360 + Heytea audit responses that the
 * standard extractor already marked as spontaneous client mentions.
 * Writes docs/audits/m34/organic-frames.json. Never writes frame_extractions
 * (table does not exist yet).
 *
 * Usage: pnpm exec tsx scripts/framing-feasibility/extract-frames.ts
 * Optional: --limit=N to cap responses (smoke).
 */
import "../../src/env-bootstrap";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client";
import { DRAFT_ELIGIBILITY, FEASIBILITY_PROJECTS } from "./protocol";
import {
  OUT_DIR,
  callBlindFrameExtraction,
  ensureDirs,
  log,
  preflightCredentials,
  reportFatal,
  resolveLiveCredentials,
  writeJson,
  type FrameExtractionRecord,
} from "./shared";

const SCOPE = "extract-frames";
const OUT_PATH = join(OUT_DIR, "organic-frames.json");

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const n = Number(arg.slice("--limit=".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  ensureDirs();
  const limit = parseLimit();
  await preflightCredentials(["deepseek"]);
  const creds = await resolveLiveCredentials("deepseek");
  log(SCOPE, `using DeepSeek extraction credential (model override: ${creds.defaultModel ?? "env default"})`);

  const rows = await db.execute(sql`
    SELECT
      r.id AS response_id,
      r.raw_text,
      r.provider_id,
      r.generation_mode,
      r.model_version,
      pc.id AS cell_id,
      pc.intent,
      pc.variant_key,
      p.slug AS project_slug,
      b.name AS brand_name
    FROM projects p
    JOIN brands b ON b.project_id = p.id AND b.role = 'client'
    JOIN audit_runs ar ON ar.project_id = p.id
    JOIN matrix_versions mv ON mv.id = ar.matrix_version_id AND mv.kind = 'audit'
    JOIN responses r ON r.run_id = ar.id
    JOIN prompt_cells pc ON pc.id = r.cell_id
    JOIN extractions e ON e.response_id = r.id AND e.state = 'valid'
    JOIN brand_mentions bm ON bm.extraction_id = e.id AND bm.brand_id = b.id
    WHERE p.slug IN (${FEASIBILITY_PROJECTS.insta360.slug}, ${FEASIBILITY_PROJECTS.heytea.slug})
      AND pc.intent IN ('discovery', 'consideration')
      AND r.provider_id = 'deepseek'
      AND r.generation_mode = 'ungrounded'
    ORDER BY p.slug, pc.intent, pc.variant_key, r.id
  `);

  type Row = {
    response_id: string;
    raw_text: string;
    provider_id: string;
    generation_mode: string;
    model_version: string;
    cell_id: string;
    intent: string;
    variant_key: string;
    project_slug: string;
    brand_name: string;
  };

  let targets = rows.rows as Row[];
  if (limit) {
    targets = targets.slice(0, limit);
    log(SCOPE, `limit=${limit} — processing ${targets.length} of available responses`);
  } else {
    log(SCOPE, `processing ${targets.length} organic client-mention responses`);
  }

  const records: FrameExtractionRecord[] = [];
  let totalCost = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i]!;
    log(SCOPE, `[${i + 1}/${targets.length}] ${row.project_slug} ${row.intent}/${row.variant_key} ${row.response_id.slice(0, 8)}…`);
    const result = await callBlindFrameExtraction(creds, {
      observedBrandName: row.brand_name,
      rawText: row.raw_text,
      sourceResponseId: row.response_id,
    });
    totalCost += result.costUsd;
    records.push({
      sourceResponseId: row.response_id,
      lane: "organic_in_context",
      projectSlug: row.project_slug,
      brandName: row.brand_name,
      providerId: row.provider_id,
      generationMode: row.generation_mode,
      cellId: row.cell_id,
      intent: row.intent,
      variantKey: row.variant_key,
      model: result.model,
      costUsd: result.costUsd,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      promptSnapshot: DRAFT_ELIGIBILITY.blindExtractionVersion,
      extractorInput: result.extractorInput,
      payload: result.payload,
      parseError: result.parseError,
      rawTextLength: row.raw_text.length,
      truncatedQuotes: result.truncatedQuotes,
      droppedFrames: result.droppedFrames,
    });
  }

  const output = {
    note: "M34 Phase 0 organic-in-context frame extractions — feasibility only, not production rows",
    lane: "organic_in_context",
    extractedAt: new Date().toISOString(),
    responseCount: records.length,
    totalCostUsd: totalCost,
    records,
  };
  writeJson(OUT_PATH, output);
  log(SCOPE, `wrote ${OUT_PATH} (${records.length} records, $${totalCost.toFixed(4)})`);
  await pool.end();
}

main().catch(async (err) => {
  const code = reportFatal(err);
  await pool.end().catch(() => undefined);
  process.exit(code);
});
