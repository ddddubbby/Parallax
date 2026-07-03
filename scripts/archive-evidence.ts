// D-024 post-audit evidence archive: pnpm archive:evidence <runId> [outDir].
// Writes the EX-3 evidence bundle (same four datasets as the app's JSON
// export, read straight from the database) plus a pg_dump of the whole
// database into a timestamped directory OUTSIDE the repo, which the
// operator then moves off-Render (external drive, cloud storage). Managed-
// Postgres backup retention is NOT the evidence archive.
//
// Production note: parallax-db sets ipAllowList: [] (RENDER_DEPLOYMENT.md),
// so a laptop cannot reach it directly. Run this wherever DATABASE_URL is
// reachable, or temporarily allow your IP for the dump and remove it after.
// If pg_dump isn't installed or the DB is unreachable for it, the JSON
// bundle still writes and the dump is reported as SKIPPED — loudly, so the
// checklist can't be silently half-done.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/client";
import {
  getExportCitations,
  getExportExtractions,
  getExportMetrics,
  getExportResponses,
} from "../src/db/repositories/export";
import { getRun } from "../src/db/repositories/runner";
import { projects } from "../src/db/schema";

function log(msg: string) {
  console.log(`[archive] ${msg}`);
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

  const [respRows, extRows, metricRows, citationRows] = await Promise.all([
    getExportResponses(runId),
    getExportExtractions(runId),
    getExportMetrics(runId),
    getExportCitations(runId),
  ]);
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

  // Full-database dump — the evidence chain includes review timestamps,
  // fact sheets, and matrix versions that the per-run bundle doesn't carry.
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/parallax";
  const dumpPath = join(outDir, `parallax-${stamp}.dump`);
  const dump = spawnSync("pg_dump", ["--format=custom", `--file=${dumpPath}`, databaseUrl], {
    stdio: ["ignore", "inherit", "pipe"],
  });
  if (dump.error || dump.status !== 0) {
    const detail = dump.error ? dump.error.message : dump.stderr?.toString().trim() || `exit ${dump.status}`;
    log(`DATABASE DUMP SKIPPED — ${detail}`);
    log("The archive is INCOMPLETE until a dump is stored: install postgresql client tools or run this where DATABASE_URL is reachable.");
    await pool.end();
    process.exit(2); // distinct exit code: bundle ok, dump missing
  }
  log(`database dump written: ${dumpPath}`);

  log("done — move this directory off-Render storage and record it in RELEASE_CHECKLIST.md");
  await pool.end();
}

main().catch(async (err) => {
  console.error("[archive] fatal:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
