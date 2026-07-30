import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface MigrationJournal {
  entries: Array<{ idx: number; tag: string }>;
}

describe("migration metadata", () => {
  it("keeps SQL files and checked-in snapshots aligned with the migration journal", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const journal = JSON.parse(
      readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8"),
    ) as MigrationJournal;

    expect(journal.entries.length).toBeGreaterThan(0);
    const journalIndices = new Set(journal.entries.map((entry) => entry.idx));
    for (const entry of journal.entries) {
      const prefix = entry.idx.toString().padStart(4, "0");
      expect(entry.idx).toBe(journal.entries.indexOf(entry));
      expect(entry.tag.startsWith(prefix)).toBe(true);
      expect(existsSync(join(migrationsDir, `${entry.tag}.sql`))).toBe(true);
    }

    const latest = journal.entries.at(-1);
    expect(latest).toBeDefined();
    expect(
      existsSync(
        join(migrationsDir, "meta", `${latest?.idx.toString().padStart(4, "0")}_snapshot.json`),
      ),
    ).toBe(true);

    const snapshotIndices = readdirSync(join(migrationsDir, "meta"))
      .map((name) => /^(\d{4})_snapshot\.json$/.exec(name)?.[1])
      .filter((idx): idx is string => Boolean(idx))
      .map((idx) => Number(idx));
    for (const idx of snapshotIndices) {
      expect(journalIndices.has(idx)).toBe(true);
    }
  });

  it("records the resonance structural wall migration", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const sql = readFileSync(
      join(migrationsDir, "0009_resonance_shape_checks.sql"),
      "utf8",
    );

    expect(sql).toContain("matrix_versions_kind_study_ck");
    expect(sql).toContain("prompt_cells_audit_resonance_shape_ck");
    expect(sql).toContain("\"kind\" = 'resonance'");
    expect(sql).toContain("\"intent\" = 'simulation'");
    expect(sql).toContain("\"stimulus_id\" is not null");
    expect(sql).toContain("\"panel_persona_key\" is not null");

    const snapshot = readFileSync(
      join(migrationsDir, "meta", "0009_snapshot.json"),
      "utf8",
    );
    expect(snapshot).toContain("matrix_versions_kind_study_ck");
    expect(snapshot).toContain("prompt_cells_audit_resonance_shape_ck");
  });

  it("splits M34A enum creation from every use of representation", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const enumSql = readFileSync(
      join(migrationsDir, "0013_add_representation_intent.sql"),
      "utf8",
    );
    const structureSql = readFileSync(
      join(migrationsDir, "0014_m34a_framing_evidence.sql"),
      "utf8",
    );

    expect(enumSql.trim()).toMatch(
      /^ALTER TYPE "public"\."intent" ADD VALUE 'representation' BEFORE 'simulation';$/,
    );
    expect(enumSql).not.toContain("CREATE TABLE");
    expect(enumSql).not.toContain("prompt_cells");

    for (const table of [
      "framing_studies",
      "framing_response_reviews",
      "framing_annotations",
      "framing_gap_classifications",
      "framing_evidence_snapshots",
    ]) {
      expect(structureSql).toContain(`CREATE TABLE "${table}"`);
    }
    expect(structureSql).toContain("framing_evidence_snapshot_id");
    expect(structureSql).toContain("prompt_cells_audit_resonance_shape_ck");
    expect(structureSql).toContain("'representation'");
    expect(structureSql).not.toContain("ALTER TYPE");
  });

  it("ships M34A assurance as a forward-only migration with database freeze walls", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const assuranceSql = readFileSync(
      join(migrationsDir, "0015_m34a_assurance.sql"),
      "utf8",
    );

    expect(assuranceSql).toContain('ADD COLUMN "discovery_manifest_json"');
    expect(assuranceSql).toContain('ADD COLUMN "gap_outcome"');
    expect(assuranceSql).toContain('ADD COLUMN "gap_classification_id"');
    expect(assuranceSql).toContain("framing_evidence_snapshots_handoff_uq");
    expect(assuranceSql).toContain("framing_evidence_snapshots_freeze_trigger");
    expect(assuranceSql).toContain("resonance_stimuli_freeze_trigger");
    expect(assuranceSql).toContain("app.bypass_framing_snapshot_freeze");
    expect(assuranceSql).toContain("app.bypass_resonance_stimulus_freeze");
    expect(assuranceSql).not.toContain("DROP TABLE");
  });

  it("ships M46 progress + brand-order migration without rewriting historical rows", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const sql = readFileSync(
      join(migrationsDir, "0021_m46_progress_and_brand_order.sql"),
      "utf8",
    );

    expect(sql).toContain('ADD COLUMN "brand_order_json" jsonb');
    expect(sql).not.toMatch(/brand_order_json" jsonb NOT NULL/i);
    expect(sql).toContain('CREATE TABLE "framing_observation_batches"');
    expect(sql).toContain("framing_observation_batches_project_active_uq");
    expect(sql).toContain("'queued', 'running', 'paused'");
    expect(sql).toContain('ADD COLUMN "batch_id" uuid');
    expect(sql).toContain('ADD COLUMN "locked_at"');
    expect(sql).toContain('ADD COLUMN "locked_by"');
    expect(sql).toContain("'queued', 'running', 'valid', 'failed'");
    expect(sql).not.toContain("UPDATE \"prompt_cells\"");
    expect(sql).not.toContain("DROP TABLE");

    const snapshot = readFileSync(
      join(migrationsDir, "meta", "0021_snapshot.json"),
      "utf8",
    );
    expect(snapshot).toContain("brand_order_json");
    expect(snapshot).toContain("framing_observation_batches");
  });

  it("ships M46 comparison-template grammar refresh as a migrate-path data upgrade", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const sql = readFileSync(
      join(migrationsDir, "0022_m46_comparison_template_grammar.sql"),
      "utf8",
    );
    expect(sql).toContain('UPDATE "prompt_templates"');
    expect(sql).toContain("{brand_list}");
    expect(sql).toContain("{competitor_list}");
    expect(sql).toContain("intent\" = 'comparison'");
    expect(sql).not.toContain("UPDATE \"prompt_cells\"");
    expect(sql).not.toContain("DROP TABLE");
  });

  it("ships M49 Message Lift fields as a forward-only compatibility migration", () => {
    const migrationsDir = join(process.cwd(), "src", "db", "migrations");
    const sql = readFileSync(
      join(migrationsDir, "0023_m49_message_lift_tests.sql"),
      "utf8",
    );
    expect(sql).toContain('ADD COLUMN "test_type"');
    expect(sql).toContain("DEFAULT 'buyer_response' NOT NULL");
    expect(sql).toContain('ADD COLUMN "recommendation_scenarios_json"');
    expect(sql).toContain('ADD COLUMN "prompt_protocol_version"');
    expect(sql).toContain("resonance_studies_test_type_ck");
    expect(sql).not.toContain("UPDATE \"prompt_cells\"");
    expect(sql).not.toContain("DROP TABLE");

    const snapshot = readFileSync(
      join(migrationsDir, "meta", "0023_snapshot.json"),
      "utf8",
    );
    expect(snapshot).toContain("recommendation_scenarios_json");
    expect(snapshot).toContain("resonance_studies_test_type_ck");
  });
});
