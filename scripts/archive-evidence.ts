// D-024 post-audit evidence archive: pnpm archive:evidence <runId> [outDir].
// Writes the EX-3 evidence bundle (same four datasets as the app's JSON
// export, read straight from the database) plus a database snapshot into a
// timestamped directory OUTSIDE the repo, which the operator then moves
// off-Render (external drive, cloud storage). Managed-Postgres backup
// retention is NOT the evidence archive.
//
// Production note: parallax-db sets ipAllowList: [] (RENDER_DEPLOYMENT.md),
// so a laptop cannot reach it directly. Run this wherever DATABASE_URL is
// reachable, or temporarily allow your IP for the dump and remove it after.
// pg_dump is preferred because it produces a full custom-format dump. If it
// isn't installed locally, the script writes a SQL data snapshot through the
// existing DB connection and exits 0. Set ARCHIVE_REQUIRE_PG_DUMP=true when a
// native pg_dump artifact is mandatory.
import "../src/env-bootstrap";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { getEligibleExtractionsForRun } from "../src/db/repositories/extraction";
import {
  getExportCitations,
  getExportExtractions,
  getExportMetrics,
  getExportResponses,
} from "../src/db/repositories/export";
import { recomputeMetrics } from "../src/db/repositories/metrics";
import { getRun } from "../src/db/repositories/runner";
import { projects } from "../src/db/schema";

function log(msg: string) {
  console.log(`[archive] ${msg}`);
}

function quoteIdent(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function copyValue(value: unknown) {
  if (value === null || value === undefined) {
    return "\\N";
  }
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
}

async function writeSqlDataSnapshot(outDir: string, stamp: string) {
  const snapshotPath = join(outDir, `parallax-${stamp}.data.sql`);
  const manifestPath = join(outDir, `dump-manifest-${stamp}.json`);
  const tablesResult = await pool.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `);
  const lines = [
    "-- Parallax fallback data snapshot.",
    "-- pg_dump was unavailable on the machine that created this archive.",
    "-- Schema lives in git migrations; this file captures public-table data via COPY text format.",
    "BEGIN;",
  ];
  const manifestTables: Array<{ table: string; rows: number }> = [];

  for (const { table_name: tableName } of tablesResult.rows) {
    const columnsResult = await pool.query<{ column_name: string }>(
      `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = $1
        order by ordinal_position
      `,
      [tableName],
    );
    const columns = columnsResult.rows.map((row) => row.column_name);
    if (columns.length === 0) {
      manifestTables.push({ table: tableName, rows: 0 });
      continue;
    }

    const selectList = columns.map((column) => `${quoteIdent(column)}::text as ${quoteIdent(column)}`).join(", ");
    const orderList = columns.map((column) => `${quoteIdent(column)}::text`).join(", ");
    const rows = await pool.query<Record<string, unknown>>(
      `select ${selectList} from ${quoteIdent("public")}.${quoteIdent(tableName)} order by ${orderList}`,
    );
    manifestTables.push({ table: tableName, rows: rows.rowCount ?? rows.rows.length });

    lines.push("");
    lines.push(`-- public.${tableName}: ${rows.rowCount ?? rows.rows.length} rows`);
    lines.push(
      `COPY ${quoteIdent("public")}.${quoteIdent(tableName)} (${columns.map(quoteIdent).join(", ")}) FROM stdin;`,
    );
    for (const row of rows.rows) {
      lines.push(columns.map((column) => copyValue(row[column])).join("\t"));
    }
    lines.push("\\.");
  }

  lines.push("COMMIT;");
  lines.push("");
  writeFileSync(snapshotPath, lines.join("\n"));
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        kind: "sql_data_snapshot",
        createdAt: new Date().toISOString(),
        note: "pg_dump was unavailable; schema is supplied by git migrations and this snapshot captures public-table data.",
        tables: manifestTables,
      },
      null,
      2,
    ),
  );
  return { manifestPath, snapshotPath };
}

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Usage: pnpm archive:evidence <runId> [outDir]");
    process.exit(1);
  }

  const run = await getRun(runId);
  if (!run) {
    console.error(`[archive] run ${runId} not found`);
    await pool.end();
    process.exit(1);
  }
  const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, run.projectId));

  // Default outside the repo (D-024: stored off the deployment), grouped by
  // project slug and timestamped so repeated archives never overwrite.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(
    process.argv[3] ?? join(homedir(), "parallax-evidence", `${project?.slug ?? "unknown"}-${runId.slice(0, 8)}-${stamp}`),
  );
  mkdirSync(outDir, { recursive: true });
  log(`archiving run ${runId} (${run.runMode}, ${run.state}) -> ${outDir}`);

  // Metrics are disposable (C-5) and only get computed on demand (the
  // dashboard/report recompute action) — a run that was never opened has
  // zero metric rows, which would silently produce an evidence pack with
  // no aggregate numbers. Recompute here (idempotent) so the archive is
  // authoritative regardless of whether anyone viewed the run.
  const metricCount = await recomputeMetrics(runId);
  log(`recomputed metrics: ${metricCount} rows`);

  const [respRows, extRows, metricRows, citationRows, eligible] = await Promise.all([
    getExportResponses(runId),
    getExportExtractions(runId),
    getExportMetrics(runId),
    getExportCitations(runId),
    getEligibleExtractionsForRun(runId),
  ]);
  // A run with eligible samples but no metric rows after a recompute is a
  // real defect, not an empty run — surface it loudly rather than shipping
  // a hollow evidence pack.
  if (eligible.length > 0 && metricRows.length === 0) {
    log(`WARNING: ${eligible.length} eligible samples but 0 metric rows after recompute — evidence pack is INCOMPLETE, investigate before delivery.`);
  }
  const bundle = {
    archivedAt: new Date().toISOString(),
    runId,
    runMode: run.runMode,
    runState: run.state,
    projectSlug: project?.slug ?? null,
    responses: respRows,
    extractions: extRows,
    metrics: metricRows,
    citations: citationRows,
  };
  const bundlePath = join(outDir, `evidence-${runId}.json`);
  writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
  log(
    `EX-3 bundle written: ${respRows.length} responses, ${extRows.length} extractions, ${metricRows.length} metrics, ${citationRows.length} citations`,
  );

  // Database snapshot — the evidence chain includes review timestamps,
  // fact sheets, and matrix versions that the per-run bundle doesn't carry.
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/parallax";
  const dumpPath = join(outDir, `parallax-${stamp}.dump`);
  const dump = spawnSync("pg_dump", ["--format=custom", `--file=${dumpPath}`, databaseUrl], {
    stdio: ["ignore", "inherit", "pipe"],
  });
  if (dump.error || dump.status !== 0) {
    const detail = dump.error ? dump.error.message : dump.stderr?.toString().trim() || `exit ${dump.status}`;
    if (process.env.ARCHIVE_REQUIRE_PG_DUMP === "true") {
      log(`DATABASE DUMP FAILED — ${detail}`);
      log("ARCHIVE_REQUIRE_PG_DUMP=true is set, so the archive is INCOMPLETE until pg_dump succeeds.");
      await pool.end();
      process.exit(2); // distinct exit code: bundle ok, strict dump missing
    }
    log(`pg_dump unavailable — ${detail}`);
    const fallback = await writeSqlDataSnapshot(outDir, stamp);
    log(`fallback SQL data snapshot written: ${fallback.snapshotPath}`);
    log(`dump manifest written: ${fallback.manifestPath}`);
    log("Set ARCHIVE_REQUIRE_PG_DUMP=true to require a native custom-format pg_dump artifact.");
  } else {
    log(`database dump written: ${dumpPath}`);
  }

  log("done — move this directory off-Render storage and record it in RELEASE_CHECKLIST.md");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[archive] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
