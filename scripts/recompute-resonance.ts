import "../src/env-bootstrap";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { auditRuns, matrixVersions, metrics } from "../src/db/schema";
import { recomputeMetrics } from "../src/db/repositories/metrics";

// D-080 sanctioned dev-DB sweep: recompute-all over the dev DB's resonance
// runs so historical metrics rows adopt the new per-provider scope-key
// format (C-5 delete-then-rebuild is idempotent by construction). Touches
// ONLY the `metrics` table via recomputeMetrics; nothing else is written.
// Run twice to prove idempotency, and confirm audit-run metrics rows are
// untouched (dispatch is by matrix kind).

async function main() {
  const auditRunIds = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(eq(matrixVersions.kind, "audit"));
  const auditRunIdSet = new Set(auditRunIds.map((r) => r.id));

  async function auditMetricsSnapshot() {
    if (auditRunIdSet.size === 0) return { totalRows: 0, perRun: new Map<string, number>() };
    const rows = await db
      .select({ runId: metrics.runId, n: sql<number>`count(*)::int` })
      .from(metrics)
      .groupBy(metrics.runId);
    const perRun = new Map<string, number>();
    let totalRows = 0;
    for (const row of rows) {
      if (!auditRunIdSet.has(row.runId)) continue;
      perRun.set(row.runId, row.n);
      totalRows += row.n;
    }
    return { totalRows, perRun };
  }

  const resonanceRuns = await db
    .select({ id: auditRuns.id, state: auditRuns.state })
    .from(auditRuns)
    .innerJoin(matrixVersions, eq(matrixVersions.id, auditRuns.matrixVersionId))
    .where(eq(matrixVersions.kind, "resonance"));

  console.log(`[m24-sweep] resonance runs found: ${resonanceRuns.length}`);

  const auditBefore = await auditMetricsSnapshot();
  console.log(`[m24-sweep] audit-run metrics rows BEFORE (baseline): ${auditBefore.totalRows} across ${auditBefore.perRun.size} runs`);

  const before = new Map<string, number>();
  for (const run of resonanceRuns) {
    const rows = await db.select().from(metrics).where(eq(metrics.runId, run.id));
    before.set(run.id, rows.length);
  }

  const firstPassRows = new Map<string, Array<Record<string, unknown>>>();
  for (const run of resonanceRuns) {
    await recomputeMetrics(run.id);
    const rows = await db.select().from(metrics).where(eq(metrics.runId, run.id));
    firstPassRows.set(run.id, rows.map(stableShape));
    console.log(
      `[m24-sweep] run ${run.id.slice(0, 8)} (${run.state}): before=${before.get(run.id)} after(pass1)=${rows.length} scopeTypes=${[...new Set(rows.map((r) => r.scopeType))].join(",")}`,
    );
  }

  const secondPassRows = new Map<string, Array<Record<string, unknown>>>();
  for (const run of resonanceRuns) {
    await recomputeMetrics(run.id);
    const rows = await db.select().from(metrics).where(eq(metrics.runId, run.id));
    secondPassRows.set(run.id, rows.map(stableShape));
  }

  let allIdempotent = true;
  for (const run of resonanceRuns) {
    const a = JSON.stringify(sortRows(firstPassRows.get(run.id) ?? []));
    const b = JSON.stringify(sortRows(secondPassRows.get(run.id) ?? []));
    const identical = a === b;
    if (!identical) allIdempotent = false;
    console.log(
      `[m24-sweep] run ${run.id.slice(0, 8)} idempotent second pass: ${identical} (pass1=${firstPassRows.get(run.id)?.length} pass2=${secondPassRows.get(run.id)?.length})`,
    );
  }
  console.log(`[m24-sweep] ALL RUNS IDEMPOTENT ON SECOND PASS: ${allIdempotent}`);

  const auditAfter = await auditMetricsSnapshot();
  console.log(`[m24-sweep] audit-run metrics rows AFTER: ${auditAfter.totalRows} across ${auditAfter.perRun.size} runs`);
  const auditUntouched =
    auditBefore.totalRows === auditAfter.totalRows &&
    JSON.stringify([...auditBefore.perRun.entries()].sort()) === JSON.stringify([...auditAfter.perRun.entries()].sort());
  console.log(`[m24-sweep] AUDIT RUNS UNTOUCHED: ${auditUntouched}`);

  await pool.end();
}

function stableShape(r: typeof metrics.$inferSelect) {
  return {
    scopeType: r.scopeType,
    scopeKey: r.scopeKey,
    metricKey: r.metricKey,
    n: r.n,
    value: r.value,
    ciLow: r.ciLow,
    ciHigh: r.ciHigh,
    metadataJson: r.metadataJson,
  };
}

function sortRows(rows: Array<Record<string, unknown>>) {
  return [...rows].sort((a, b) =>
    `${a.scopeType}|${a.scopeKey}|${a.metricKey}`.localeCompare(`${b.scopeType}|${b.scopeKey}|${b.metricKey}`),
  );
}

main().catch((err) => {
  console.error("[m24-sweep] failed:", err);
  process.exit(1);
});
