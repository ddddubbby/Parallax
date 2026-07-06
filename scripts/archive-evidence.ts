// D-024 post-audit evidence archive: pnpm archive:evidence <runId> [outDir].
// Writes the EX-3 evidence bundle (same four datasets as the app's JSON
// export, read straight from the database) plus a redacted database snapshot
// into a timestamped directory OUTSIDE the repo, which the operator then
// moves off-Render (external drive, cloud storage). Managed-Postgres backup
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
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  EVIDENCE_ARCHIVE_EXCLUDED_TABLES,
  filterEvidenceArchiveTables,
  isEvidenceArchiveReadyRunState,
  orderTablesByForeignKeys,
  pgDumpEnvFromDatabaseUrl,
  shouldBlockEvidenceArchiveForUnreviewedClaims,
  shouldBlockEvidenceArchiveForMissingMetrics,
} from "../src/core/archive";
import { isUuid } from "../src/core/id";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import { getEligibleExtractionsForRun } from "../src/db/repositories/extraction";
import {
  getExportCitations,
  getExportExtractions,
  getExportMetrics,
  getExportResponses,
} from "../src/db/repositories/export";
import { getMisinformationRegister } from "../src/db/repositories/dashboard";
import { recomputeMetrics } from "../src/db/repositories/metrics";
import { getResonanceStudyExportLabel } from "../src/db/repositories/resonance";
import { getRun, getRunMatrixKind } from "../src/db/repositories/runner";
import { projects } from "../src/db/schema";
import { resonanceExportMetadata } from "../src/core/resonance";

function log(msg: string) {
  console.log(`[archive] ${msg}`);
}

function writePrivateFile(path: string, data: string) {
  writeFileSync(path, data, { mode: 0o600 });
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
  const dependenciesResult = await pool.query<{ child_table: string; parent_table: string }>(`
    select child.relname as child_table, parent.relname as parent_table
    from pg_constraint constraint_row
    join pg_class child on child.oid = constraint_row.conrelid
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_class parent on parent.oid = constraint_row.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where constraint_row.contype = 'f'
      and child_ns.nspname = 'public'
      and parent_ns.nspname = 'public'
    order by child.relname, parent.relname
  `);
  const tableNames = orderTablesByForeignKeys(
    filterEvidenceArchiveTables(tablesResult.rows.map((row) => row.table_name)),
    dependenciesResult.rows,
  );
  const lines = [
    "-- Parallax fallback data snapshot.",
    "-- pg_dump was unavailable on the machine that created this archive.",
    `-- Excluded server-only tables: ${EVIDENCE_ARCHIVE_EXCLUDED_TABLES.join(", ")}.`,
    "-- Schema lives in git migrations; this file captures non-sensitive public-table data via COPY text format.",
    "-- Tables are ordered parent-first by public foreign keys so the snapshot can restore into a freshly migrated empty database.",
    "BEGIN;",
  ];
  const manifestTables: Array<{ table: string; rows: number }> = [];

  for (const tableName of tableNames) {
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
  writePrivateFile(snapshotPath, lines.join("\n"));
  writePrivateFile(
    manifestPath,
    JSON.stringify(
      {
        kind: "sql_data_snapshot",
        createdAt: new Date().toISOString(),
        note: "pg_dump was unavailable; schema is supplied by git migrations and this snapshot captures non-sensitive public-table data.",
        excludedTables: EVIDENCE_ARCHIVE_EXCLUDED_TABLES,
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
  if (!isUuid(runId)) {
    console.error(`[archive] invalid run id: ${runId}`);
    process.exit(1);
  }

  const run = await getRun(runId);
  if (!run) {
    console.error(`[archive] run ${runId} not found`);
    await pool.end();
    process.exit(1);
  }
  if (!isEvidenceArchiveReadyRunState(run.state)) {
    const message = `run ${runId} is ${run.state}; evidence archives are delivery artifacts and normally require a completed or paused run`;
    if (process.env.ARCHIVE_ALLOW_PARTIAL !== "true") {
      console.error(`[archive] ${message}`);
      console.error("[archive] set ARCHIVE_ALLOW_PARTIAL=true only for an explicitly partial/debug archive.");
      await pool.end();
      process.exit(1);
    }
    log(`WARNING: ${message}; ARCHIVE_ALLOW_PARTIAL=true set, continuing with a partial/debug archive.`);
  }
  const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, run.projectId));
  const kind = await getRunMatrixKind(runId);
  const resonanceStudy =
    kind?.kind === "resonance" && kind.resonanceStudyId
      ? await getResonanceStudyExportLabel(run.projectId, kind.resonanceStudyId)
      : null;

  // Default outside the repo (D-024: stored off the deployment), grouped by
  // project slug and timestamped so repeated archives never overwrite.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = resolve(
    process.argv[3] ?? join(homedir(), "parallax-evidence", `${project?.slug ?? "unknown"}-${runId.slice(0, 8)}-${stamp}`),
  );
  mkdirSync(outDir, { recursive: true, mode: 0o700 });
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
  const misinformationRows = kind?.kind === "resonance" ? [] : await getMisinformationRegister(runId);
  const unreviewedMisinformationCount = misinformationRows.filter((row) => row.reviewState === "unreviewed").length;
  if (
    shouldBlockEvidenceArchiveForUnreviewedClaims({
      kind: kind?.kind ?? "audit",
      runMode: run.runMode,
      unreviewedClaimCount: unreviewedMisinformationCount,
      allowUnreviewedClaims: process.env.ARCHIVE_ALLOW_UNREVIEWED_CLAIMS === "true",
    })
  ) {
    console.error(
      `[archive] ${unreviewedMisinformationCount} misinformation claim(s) are still unreviewed; review the register before final archive.`,
    );
    console.error(
      "[archive] set ARCHIVE_ALLOW_UNREVIEWED_CLAIMS=true only for an explicitly debug/non-delivery archive.",
    );
    await pool.end();
    process.exit(1);
  }
  if (unreviewedMisinformationCount > 0) {
    log(
      `WARNING: ${unreviewedMisinformationCount} misinformation claim(s) are unreviewed; ARCHIVE_ALLOW_UNREVIEWED_CLAIMS=true set, continuing with a debug/non-delivery archive.`,
    );
  }
  // A run with eligible samples but no metric rows after a recompute is a
  // real defect, not an empty run. Delivery archives fail closed; the debug
  // override exists only for preserving broken evidence while investigating.
  if (
    shouldBlockEvidenceArchiveForMissingMetrics({
      eligibleSampleCount: eligible.length,
      metricRowCount: metricRows.length,
      allowIncompleteMetrics: process.env.ARCHIVE_ALLOW_INCOMPLETE_METRICS === "true",
    })
  ) {
    console.error(
      `[archive] ${eligible.length} eligible samples but 0 metric rows after recompute; evidence pack is INCOMPLETE.`,
    );
    console.error(
      "[archive] set ARCHIVE_ALLOW_INCOMPLETE_METRICS=true only for an explicitly debug/non-delivery archive.",
    );
    await pool.end();
    process.exit(1);
  }
  if (eligible.length > 0 && metricRows.length === 0) {
    log(
      `WARNING: ${eligible.length} eligible samples but 0 metric rows after recompute; ARCHIVE_ALLOW_INCOMPLETE_METRICS=true set, continuing with a debug/non-delivery archive.`,
    );
  }
  const bundle = {
    archivedAt: new Date().toISOString(),
    runId,
    kind: kind?.kind ?? "audit",
    resonance: resonanceExportMetadata(resonanceStudy),
    runMode: run.runMode,
    runState: run.state,
    projectSlug: project?.slug ?? null,
    responses: respRows,
    extractions: extRows,
    metrics: metricRows,
    citations: citationRows,
  };
  const bundlePath = join(outDir, `evidence-${runId}.json`);
  writePrivateFile(bundlePath, JSON.stringify(bundle, null, 2));
  log(
    `EX-3 bundle written: ${respRows.length} responses, ${extRows.length} extractions, ${metricRows.length} metrics, ${citationRows.length} citations`,
  );

  // Database snapshot — the evidence chain includes review timestamps,
  // fact sheets, and matrix versions that the per-run bundle doesn't carry.
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/parallax";
  const dumpPath = join(outDir, `parallax-${stamp}.dump`);
  const excludedTableArgs = EVIDENCE_ARCHIVE_EXCLUDED_TABLES.flatMap((table) => [
    "--exclude-table",
    `public.${table}`,
  ]);
  const dumpEnv = pgDumpEnvFromDatabaseUrl(databaseUrl, process.env);
  const dump = spawnSync("pg_dump", ["--format=custom", ...excludedTableArgs, `--file=${dumpPath}`], {
    env: dumpEnv,
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
    chmodSync(dumpPath, 0o600);
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
