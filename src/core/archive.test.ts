import { describe, expect, it } from "vitest";
import {
  filterEvidenceArchiveTables,
  isEvidenceArchiveReadyRunState,
  orderTablesByForeignKeys,
  pgDumpEnvFromDatabaseUrl,
  shouldBlockEvidenceArchiveForMissingMetrics,
  shouldBlockEvidenceArchiveForUnreviewedClaims,
} from "./archive";

describe("evidence archive table policy", () => {
  it("excludes provider credentials from evidence archives", () => {
    expect(filterEvidenceArchiveTables(["projects", "provider_credentials", "responses"])).toEqual([
      "projects",
      "responses",
    ]);
  });

  it("keeps parent tables before dependent tables", () => {
    expect(
      orderTablesByForeignKeys(["responses", "projects", "audit_runs"], [
        { child_table: "audit_runs", parent_table: "projects" },
        { child_table: "responses", parent_table: "audit_runs" },
      ]),
    ).toEqual(["projects", "audit_runs", "responses"]);
  });

  it("only treats stable run states as delivery-archive ready", () => {
    expect(isEvidenceArchiveReadyRunState("completed")).toBe(true);
    expect(isEvidenceArchiveReadyRunState("paused")).toBe(true);
    expect(isEvidenceArchiveReadyRunState("queued")).toBe(false);
    expect(isEvidenceArchiveReadyRunState("running")).toBe(false);
    expect(isEvidenceArchiveReadyRunState("failed")).toBe(false);
    expect(isEvidenceArchiveReadyRunState("cancelled")).toBe(false);
  });

  it("fails final live-audit archives closed when misinformation claims remain unreviewed", () => {
    expect(
      shouldBlockEvidenceArchiveForUnreviewedClaims({
        kind: "audit",
        runMode: "live_audit",
        unreviewedClaimCount: 1,
        allowUnreviewedClaims: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockEvidenceArchiveForUnreviewedClaims({
        kind: "audit",
        runMode: "live_audit",
        unreviewedClaimCount: 1,
        allowUnreviewedClaims: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockEvidenceArchiveForUnreviewedClaims({
        kind: "audit",
        runMode: "mock",
        unreviewedClaimCount: 1,
        allowUnreviewedClaims: false,
      }),
    ).toBe(false);
    expect(
      shouldBlockEvidenceArchiveForUnreviewedClaims({
        kind: "resonance",
        runMode: "live_audit",
        unreviewedClaimCount: 1,
        allowUnreviewedClaims: false,
      }),
    ).toBe(false);
  });

  it("fails delivery archives closed when eligible samples produce no metrics", () => {
    expect(
      shouldBlockEvidenceArchiveForMissingMetrics({
        eligibleSampleCount: 12,
        metricRowCount: 0,
        allowIncompleteMetrics: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockEvidenceArchiveForMissingMetrics({
        eligibleSampleCount: 12,
        metricRowCount: 0,
        allowIncompleteMetrics: true,
      }),
    ).toBe(false);
    expect(
      shouldBlockEvidenceArchiveForMissingMetrics({
        eligibleSampleCount: 0,
        metricRowCount: 0,
        allowIncompleteMetrics: false,
      }),
    ).toBe(false);
    expect(
      shouldBlockEvidenceArchiveForMissingMetrics({
        eligibleSampleCount: 12,
        metricRowCount: 4,
        allowIncompleteMetrics: false,
      }),
    ).toBe(false);
  });

  it("converts DATABASE_URL into pg_dump environment without requiring argv secrets", () => {
    const env = pgDumpEnvFromDatabaseUrl(
      "postgresql://user%40example:p%40ss%2Fword@db.internal:6543/parallax?sslmode=require",
      {
        NODE_ENV: "test",
        PATH: "/bin",
        DATABASE_URL: "postgresql://secret:secret@elsewhere/db",
        SESSION_SECRET: "session-secret",
        APP_PASSWORD: "app-password",
        CREDENTIALS_ENCRYPTION_KEY: "credential-key",
      },
    );

    expect(env).toMatchObject({
      PATH: "/bin",
      PGHOST: "db.internal",
      PGPORT: "6543",
      PGDATABASE: "parallax",
      PGUSER: "user@example",
      PGPASSWORD: "p@ss/word",
      PGSSLMODE: "require",
    });
    expect(env).not.toHaveProperty("NODE_ENV");
    expect(env).not.toHaveProperty("DATABASE_URL");
    expect(env).not.toHaveProperty("SESSION_SECRET");
    expect(env).not.toHaveProperty("APP_PASSWORD");
    expect(env).not.toHaveProperty("CREDENTIALS_ENCRYPTION_KEY");
  });
});
