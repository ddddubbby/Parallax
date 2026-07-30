import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  repairM46ComparisonTemplateMigration,
  repairM46MigrationDrift,
} from "../../../scripts/repair-m46-migration-drift";

const sourceFolder = join(process.cwd(), "src", "db", "migrations");
const connectionString = process.env.DATABASE_URL ?? "";
const dbAvailable = Boolean(connectionString) && !connectionString.includes("127.0.0.1:1");

function migrationSubsetThrough(maxIndex: number): string {
  const folder = mkdtempSync(join(tmpdir(), "parallax-migration-subset-"));
  mkdirSync(join(folder, "meta"));
  for (const name of readdirSync(sourceFolder)) {
    const match = /^(\d{4})_.+\.sql$/.exec(name);
    if (match && Number(match[1]) <= maxIndex) {
      copyFileSync(join(sourceFolder, name), join(folder, name));
    }
  }
  const journal = JSON.parse(
    readFileSync(join(sourceFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= maxIndex);
  writeFileSync(join(folder, "meta", "_journal.json"), `${JSON.stringify(journal, null, 2)}\n`);
  return folder;
}

describe.skipIf(!dbAvailable)("forward migration upgrade path", () => {
  it("preserves pre-M34 data when upgrading 0012 → 0015", async () => {
    const databaseName = `parallax_upgrade_${randomUUID().replaceAll("-", "")}`;
    const adminUrl = new URL(connectionString);
    adminUrl.pathname = "/postgres";
    const targetUrl = new URL(connectionString);
    targetUrl.pathname = `/${databaseName}`;
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    const subset = migrationSubsetThrough(12);
    let target: Pool | null = null;
    try {
      await admin.query(`create database "${databaseName}"`);
      target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
      await migrate(drizzle(target), { migrationsFolder: subset });
      const project = await target.query<{ id: string }>(
        "insert into projects (name, slug, category, job_to_be_done, status) values ($1, $2, $3, $4, $5) returning id",
        ["Upgrade sentinel", "upgrade-sentinel", "cameras", "preserve me", "active"],
      );
      const study = await target.query<{ id: string }>(
        "insert into resonance_studies (project_id, name) values ($1, $2) returning id",
        [project.rows[0]!.id, "Historical message study"],
      );
      const stimulus = await target.query<{ id: string }>(
        "insert into resonance_stimuli (study_id, kind, label, body, position) values ($1, $2, $3, $4, $5) returning id",
        [study.rows[0]!.id, "custom", "Historical variant", "Frozen historical prompt input", 0],
      );

      await migrate(drizzle(target), { migrationsFolder: sourceFolder });

      const preserved = await target.query<{ name: string; job_to_be_done: string }>(
        "select name, job_to_be_done from projects where slug = $1",
        ["upgrade-sentinel"],
      );
      expect(preserved.rows).toEqual([
        { name: "Upgrade sentinel", job_to_be_done: "preserve me" },
      ]);
      const historicalStudy = await target.query<{
        test_type: string;
        recommendation_scenarios_json: unknown;
        prompt_protocol_version: string | null;
      }>(
        "select test_type, recommendation_scenarios_json, prompt_protocol_version from resonance_studies where id = $1",
        [study.rows[0]!.id],
      );
      expect(historicalStudy.rows).toEqual([
        {
          test_type: "buyer_response",
          recommendation_scenarios_json: [],
          prompt_protocol_version: null,
        },
      ]);
      const historicalStimulus = await target.query<{ body: string }>(
        "select body from resonance_stimuli where id = $1",
        [stimulus.rows[0]!.id],
      );
      expect(historicalStimulus.rows).toEqual([{ body: "Frozen historical prompt input" }]);
      const columns = await target.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_name = 'framing_studies' and column_name in ('discovery_manifest_json', 'gap_outcome') order by column_name",
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "discovery_manifest_json",
        "gap_outcome",
      ]);
      const triggers = await target.query<{ tgname: string }>(
        "select tgname from pg_trigger where not tgisinternal and tgname in ('framing_evidence_snapshots_freeze_trigger', 'resonance_stimuli_freeze_trigger') order by tgname",
      );
      expect(triggers.rows.map((row) => row.tgname)).toEqual([
        "framing_evidence_snapshots_freeze_trigger",
        "resonance_stimuli_freeze_trigger",
      ]);
      // M36 (0016_agent_enums): the two agent enum additions must land on an
      // existing pre-M34 DB, not just a fresh one. Enum ADD VALUE followed by
      // in-batch usage is the D-066/D-102 trap; asserting the values exist here
      // proves the split-statement migration applied cleanly on an upgrade.
      const enumValues = await target.query<{ enumlabel: string }>(
        `select e.enumlabel
           from pg_enum e
           join pg_type t on t.oid = e.enumtypid
          where (t.typname = 'category_archetype' and e.enumlabel = 'crypto_token')
             or (t.typname = 'provider_id' and e.enumlabel = 'xai')
          order by e.enumlabel`,
      );
      expect(enumValues.rows.map((row) => row.enumlabel)).toEqual(["crypto_token", "xai"]);
      // M39 (0017_agent_commerce): the additive commerce tables land on an
      // existing DB too. Assert a representative set exists after upgrade.
      const agentTables = await target.query<{ table_name: string }>(
        `select table_name from information_schema.tables
          where table_name in ('agent_orders','agent_effects','agent_deliverables','agent_settlements','service_heartbeats')
          order by table_name`,
      );
      expect(agentTables.rows.map((r) => r.table_name)).toEqual([
        "agent_deliverables",
        "agent_effects",
        "agent_orders",
        "agent_settlements",
        "service_heartbeats",
      ]);
    } finally {
      await target?.end().catch(() => {});
      await admin.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [databaseName],
      ).catch(() => {});
      await admin.query(`drop database if exists "${databaseName}"`).catch(() => {});
      await admin.end().catch(() => {});
      rmSync(subset, { recursive: true, force: true });
    }
  }, 60_000);

  it("repairs an orphan M46 brand-order column without losing frozen values", async () => {
    const databaseName = `parallax_upgrade_${randomUUID().replaceAll("-", "")}`;
    const adminUrl = new URL(connectionString);
    adminUrl.pathname = "/postgres";
    const targetUrl = new URL(connectionString);
    targetUrl.pathname = `/${databaseName}`;
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    const subset = migrationSubsetThrough(20);
    let target: Pool | null = null;
    try {
      await admin.query(`create database "${databaseName}"`);
      target = new Pool({ connectionString: targetUrl.toString(), max: 2 });
      await migrate(drizzle(target), { migrationsFolder: subset });

      const project = await target.query<{ id: string }>(
        "insert into projects (name, slug, category, job_to_be_done, status) values ($1, $2, $3, $4, $5) returning id",
        ["M46 drift sentinel", "m46-drift-sentinel", "hotels", "preserve order", "active"],
      );
      const matrix = await target.query<{ id: string }>(
        "insert into matrix_versions (project_id, version, state, cell_count) values ($1, $2, $3, $4) returning id",
        [project.rows[0]!.id, 1, "draft", 1],
      );
      const cell = await target.query<{ id: string }>(
        "insert into prompt_cells (matrix_version_id, intent, variant_key, resolved_text) values ($1, $2, $3, $4) returning id",
        [matrix.rows[0]!.id, "discovery", "v1", "Frozen prompt"],
      );
      await target.query(
        'alter table prompt_cells add column brand_order_json jsonb',
      );
      await target.query(
        "update prompt_cells set brand_order_json = $1 where id = $2",
        [JSON.stringify(["Client", "Competitor A"]), cell.rows[0]!.id],
      );
      await target.query(
        "update matrix_versions set state = $1, approved_at = now() where id = $2",
        ["approved", matrix.rows[0]!.id],
      );
      const template = await target.query<{ id: string }>(
        `insert into prompt_templates
          (archetype, intent, template_text, variant_key)
         values ($1, $2, $3, $4)
         returning id`,
        [
          "consumer_venue",
          "comparison",
          "Compare {client_brand} with {competitor_list} for {persona} in {market}.",
          "v1",
        ],
      );

      const dryRun = await repairM46MigrationDrift(target, { apply: false });
      expect(dryRun).toMatchObject({
        applied: false,
        preservedBrandOrderRows: 1,
      });
      const repaired = await repairM46MigrationDrift(target, { apply: true });
      expect(repaired).toMatchObject({
        applied: true,
        preservedBrandOrderRows: 1,
      });
      const comparisonDryRun = await repairM46ComparisonTemplateMigration(
        target,
        { apply: false },
      );
      expect(comparisonDryRun).toMatchObject({
        applied: false,
        updatedTemplateRows: 1,
      });
      const comparisonRepair = await repairM46ComparisonTemplateMigration(
        target,
        { apply: true },
      );
      expect(comparisonRepair).toMatchObject({
        applied: true,
        updatedTemplateRows: 1,
      });

      await migrate(drizzle(target), { migrationsFolder: sourceFolder });

      const preserved = await target.query<{
        brand_order_json: string[];
      }>(
        "select brand_order_json from prompt_cells where id = $1",
        [cell.rows[0]!.id],
      );
      expect(preserved.rows).toEqual([
        { brand_order_json: ["Client", "Competitor A"] },
      ]);
      const migratedTemplate = await target.query<{ template_text: string }>(
        "select template_text from prompt_templates where id = $1",
        [template.rows[0]!.id],
      );
      expect(migratedTemplate.rows).toEqual([
        {
          template_text:
            "Compare {brand_list} for a {persona} in {market}.",
        },
      ]);
      const columns = await target.query<{ column_name: string }>(
        `select column_name
           from information_schema.columns
          where table_name = 'resonance_studies'
            and column_name in (
              'test_type',
              'recommendation_scenarios_json',
              'prompt_protocol_version'
            )
          order by column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "prompt_protocol_version",
        "recommendation_scenarios_json",
        "test_type",
      ]);
      const journal = await target.query<{ created_at: string }>(
        `select created_at
           from drizzle.__drizzle_migrations
          where created_at in ($1, $2, $3)
          order by created_at`,
        [1784469330376, 1784472800000, 1785279600000],
      );
      expect(journal.rows.map((row) => Number(row.created_at))).toEqual([
        1784469330376,
        1784472800000,
        1785279600000,
      ]);
    } finally {
      await target?.end().catch(() => {});
      await admin
        .query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
          [databaseName],
        )
        .catch(() => {});
      await admin.query(`drop database if exists "${databaseName}"`).catch(() => {});
      await admin.end().catch(() => {});
      rmSync(subset, { recursive: true, force: true });
    }
  }, 60_000);
});
