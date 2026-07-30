import "../src/env-bootstrap";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../src/db/migrations/", import.meta.url),
);
const JOURNAL_PATH = fileURLToPath(
  new URL("../src/db/migrations/meta/_journal.json", import.meta.url),
);
const M46_TAG = "0021_m46_progress_and_brand_order";
const PRIOR_TAG = "0020_framing_observations";
const COMPARISON_TAG = "0022_m46_comparison_template_grammar";
const ALREADY_SATISFIED_STATEMENT =
  'ALTER TABLE "prompt_cells" ADD COLUMN "brand_order_json" jsonb;';

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  entries: JournalEntry[];
}

interface RepairResult {
  applied: boolean;
  preservedBrandOrderRows: number;
  migrationTimestamp: number;
}

interface ComparisonRepairResult {
  applied: boolean;
  updatedTemplateRows: number;
  migrationTimestamp: number;
}

function journalEntry(journal: Journal, tag: string): JournalEntry {
  const entry = journal.entries.find((candidate) => candidate.tag === tag);
  if (!entry) throw new Error(`Migration journal is missing ${tag}.`);
  return entry;
}

function canonicalMigration() {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
  const current = journalEntry(journal, M46_TAG);
  const prior = journalEntry(journal, PRIOR_TAG);
  const path = `${MIGRATIONS_FOLDER}${M46_TAG}.sql`;
  const sql = readFileSync(path, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  const duplicateStatements = statements.filter((statement) =>
    statement.includes(ALREADY_SATISFIED_STATEMENT),
  );
  if (duplicateStatements.length !== 1) {
    throw new Error(
      `Expected exactly one canonical brand_order_json statement in ${M46_TAG}; found ${duplicateStatements.length}.`,
    );
  }
  return {
    current,
    prior,
    hash: createHash("sha256").update(sql).digest("hex"),
    statements: statements.filter(
      (statement) => !statement.includes(ALREADY_SATISFIED_STATEMENT),
    ),
  };
}

function canonicalComparisonMigration() {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
  const current = journalEntry(journal, COMPARISON_TAG);
  const prior = journalEntry(journal, M46_TAG);
  const path = `${MIGRATIONS_FOLDER}${COMPARISON_TAG}.sql`;
  const sql = readFileSync(path, "utf8");
  const tupleCase = 'CASE ("archetype"::text, "variant_key")';
  const tupleWhen = /WHEN \('([^']+)', '([^']+)'\) THEN/g;
  const mappings = [...sql.matchAll(tupleWhen)];
  if (!sql.includes(tupleCase) || mappings.length !== 15) {
    throw new Error(
      `Expected the canonical tuple CASE and 15 mappings in ${COMPARISON_TAG}; found ${mappings.length}.`,
    );
  }
  const executableSql = sql
    .replace(tupleCase, "CASE")
    .replace(
      tupleWhen,
      `WHEN "archetype"::text = '$1' AND "variant_key" = '$2' THEN`,
    );
  if (
    executableSql.includes(tupleCase) ||
    /WHEN \('[^']+', '[^']+'\) THEN/.test(executableSql)
  ) {
    throw new Error(`Failed to type the canonical ${COMPARISON_TAG} mappings.`);
  }
  return {
    current,
    prior,
    hash: createHash("sha256").update(sql).digest("hex"),
    executableSql,
  };
}

async function latestMigrationTimestamp(client: PoolClient) {
  const result = await client.query<{ created_at: string }>(
    `select created_at
       from drizzle.__drizzle_migrations
      order by created_at desc
      limit 1`,
  );
  return Number(result.rows[0]?.created_at);
}

async function assertExactDrift(client: PoolClient, priorTimestamp: number) {
  const lastMigration = await client.query<{
    hash: string;
    created_at: string;
  }>(
    `select hash, created_at
       from drizzle.__drizzle_migrations
      order by created_at desc
      limit 1`,
  );
  const lastTimestamp = Number(lastMigration.rows[0]?.created_at);
  if (lastTimestamp !== priorTimestamp) {
    throw new Error(
      `Repair requires the journal to end at ${PRIOR_TAG} (${priorTimestamp}); found ${lastTimestamp || "no migration"}.`,
    );
  }

  const brandOrderColumn = await client.query<{
    data_type: string;
    is_nullable: string;
  }>(
    `select data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prompt_cells'
        and column_name = 'brand_order_json'`,
  );
  if (
    brandOrderColumn.rows.length !== 1 ||
    brandOrderColumn.rows[0]?.data_type !== "jsonb" ||
    brandOrderColumn.rows[0]?.is_nullable !== "YES"
  ) {
    throw new Error(
      "Repair requires one nullable jsonb prompt_cells.brand_order_json column.",
    );
  }

  const unexpectedM46Columns = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'framing_observations'
        and column_name in ('batch_id', 'locked_at', 'locked_by')
      order by column_name`,
  );
  const batchTable = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = 'framing_observation_batches'`,
  );
  if (unexpectedM46Columns.rowCount !== 0 || batchTable.rowCount !== 0) {
    throw new Error(
      "Repair only supports the exact drift shape: orphan brand_order_json with the remaining M46 schema absent.",
    );
  }
}

async function brandOrderSnapshot(client: PoolClient) {
  const rows = await client.query<{ id: string; brand_order_json: unknown }>(
    `select id, brand_order_json
       from prompt_cells
      where brand_order_json is not null
      order by id`,
  );
  return rows.rows;
}

async function assertM46EndState(client: PoolClient) {
  const columns = await client.query<{ column_name: string }>(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'framing_observations'
        and column_name in ('batch_id', 'locked_at', 'locked_by')
      order by column_name`,
  );
  const table = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = 'framing_observation_batches'`,
  );
  const constraints = await client.query<{ conname: string }>(
    `select conname
       from pg_constraint
      where conname in (
        'framing_observation_batches_state_ck',
        'framing_observation_batches_project_id_projects_id_fk',
        'framing_observations_batch_id_framing_observation_batches_id_fk',
        'framing_observations_state_ck'
      )
      order by conname`,
  );
  const indexes = await client.query<{ indexname: string }>(
    `select indexname
       from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'framing_observation_batches_project_idx',
          'framing_observation_batches_project_active_uq',
          'framing_observations_batch_state_idx'
        )
      order by indexname`,
  );

  const expectedColumns = ["batch_id", "locked_at", "locked_by"];
  const expectedConstraints = [
    "framing_observation_batches_project_id_projects_id_fk",
    "framing_observation_batches_state_ck",
    "framing_observations_batch_id_framing_observation_batches_id_fk",
    "framing_observations_state_ck",
  ];
  const expectedIndexes = [
    "framing_observation_batches_project_active_uq",
    "framing_observation_batches_project_idx",
    "framing_observations_batch_state_idx",
  ];

  if (
    table.rowCount !== 1 ||
    JSON.stringify(columns.rows.map((row) => row.column_name)) !==
      JSON.stringify(expectedColumns) ||
    JSON.stringify(constraints.rows.map((row) => row.conname)) !==
      JSON.stringify(expectedConstraints) ||
    JSON.stringify(indexes.rows.map((row) => row.indexname)) !==
      JSON.stringify(expectedIndexes)
  ) {
    throw new Error("Canonical M46 schema verification failed after repair.");
  }
}

export async function repairM46MigrationDrift(
  pool: Pool,
  options: { apply: boolean },
): Promise<RepairResult> {
  const migration = canonicalMigration();
  const client = await pool.connect();
  try {
    await assertExactDrift(client, migration.prior.when);
    const before = await brandOrderSnapshot(client);
    if (!options.apply) {
      return {
        applied: false,
        preservedBrandOrderRows: before.length,
        migrationTimestamp: migration.current.when,
      };
    }

    await client.query("begin");
    try {
      await client.query(
        "lock table drizzle.__drizzle_migrations in exclusive mode",
      );
      await assertExactDrift(client, migration.prior.when);
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await assertM46EndState(client);
      const after = await brandOrderSnapshot(client);
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        throw new Error(
          "brand_order_json values changed while applying the M46 repair.",
        );
      }
      await client.query(
        `insert into drizzle.__drizzle_migrations (hash, created_at)
         values ($1, $2)`,
        [migration.hash, migration.current.when],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    return {
      applied: true,
      preservedBrandOrderRows: before.length,
      migrationTimestamp: migration.current.when,
    };
  } finally {
    client.release();
  }
}

export async function repairM46ComparisonTemplateMigration(
  pool: Pool,
  options: { apply: boolean },
): Promise<ComparisonRepairResult> {
  const migration = canonicalComparisonMigration();
  const client = await pool.connect();
  try {
    const lastTimestamp = await latestMigrationTimestamp(client);
    if (lastTimestamp !== migration.prior.when) {
      throw new Error(
        `Comparison repair requires the journal to end at ${M46_TAG} (${migration.prior.when}); found ${lastTimestamp || "no migration"}.`,
      );
    }
    const candidates = await client.query(
      `select 1
         from prompt_templates
        where intent = 'comparison'
          and template_text like '%{competitor_list}%'`,
    );
    if (!options.apply) {
      return {
        applied: false,
        updatedTemplateRows: candidates.rowCount ?? 0,
        migrationTimestamp: migration.current.when,
      };
    }

    await client.query("begin");
    try {
      await client.query(
        "lock table drizzle.__drizzle_migrations in exclusive mode",
      );
      const lockedTimestamp = await latestMigrationTimestamp(client);
      if (lockedTimestamp !== migration.prior.when) {
        throw new Error(
          `Comparison repair journal changed while waiting for its lock; found ${lockedTimestamp || "no migration"}.`,
        );
      }
      const updated = await client.query(migration.executableSql);
      await client.query(
        `insert into drizzle.__drizzle_migrations (hash, created_at)
         values ($1, $2)`,
        [migration.hash, migration.current.when],
      );
      await client.query("commit");
      return {
        applied: true,
        updatedTemplateRows: updated.rowCount ?? 0,
        migrationTimestamp: migration.current.when,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    client.release();
  }
}

function assertLocalDatabase(connectionString: string) {
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(
      "This repair is local-only and refuses a non-local DATABASE_URL.",
    );
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  assertLocalDatabase(connectionString);
  const apply = process.argv.includes("--apply");
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const client = await pool.connect();
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as Journal;
    const prior = journalEntry(journal, PRIOR_TAG);
    const m46 = journalEntry(journal, M46_TAG);
    const comparison = journalEntry(journal, COMPARISON_TAG);
    const latest = await latestMigrationTimestamp(client);
    const latestEntry = journal.entries.find((entry) => entry.when === latest);
    client.release();

    if (latest === prior.when) {
      const result = await repairM46MigrationDrift(pool, { apply });
      console.log(
        apply
          ? `[m46-repair] applied canonical ${M46_TAG}; preserved ${result.preservedBrandOrderRows} brand-order row(s).`
          : `[m46-repair] dry run passed; ${result.preservedBrandOrderRows} brand-order row(s) will be preserved. Re-run with --apply.`,
      );
      if (!apply) return;
    } else if (
      latest !== m46.when &&
      (!latestEntry || latestEntry.idx < comparison.idx)
    ) {
      throw new Error(
        `Repair requires a recognized journal entry at ${PRIOR_TAG} or later; found ${latest || "no migration"}.`,
      );
    }

    if (!latestEntry || latestEntry.idx < comparison.idx) {
      const result = await repairM46ComparisonTemplateMigration(pool, {
        apply,
      });
      console.log(
        apply
          ? `[m46-repair] applied canonical ${COMPARISON_TAG} mappings with explicit text predicates; updated ${result.updatedTemplateRows} template row(s).`
          : `[m46-repair] comparison dry run passed; ${result.updatedTemplateRows} template row(s) will be updated. Re-run with --apply.`,
      );
    } else {
      console.log(`[m46-repair] ${COMPARISON_TAG} is already applied.`);
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(
      "[m46-repair] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
