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
});
