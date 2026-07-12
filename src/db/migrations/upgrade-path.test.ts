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
      await target.query(
        "insert into projects (name, slug, category, job_to_be_done, status) values ($1, $2, $3, $4, $5)",
        ["Upgrade sentinel", "upgrade-sentinel", "cameras", "preserve me", "active"],
      );

      await migrate(drizzle(target), { migrationsFolder: sourceFolder });

      const preserved = await target.query<{ name: string; job_to_be_done: string }>(
        "select name, job_to_be_done from projects where slug = $1",
        ["upgrade-sentinel"],
      );
      expect(preserved.rows).toEqual([
        { name: "Upgrade sentinel", job_to_be_done: "preserve me" },
      ]);
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
});
