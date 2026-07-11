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
});
