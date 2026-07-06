export const EVIDENCE_ARCHIVE_EXCLUDED_TABLES = ["provider_credentials"] as const;
export const EVIDENCE_ARCHIVE_READY_RUN_STATES = ["completed", "paused"] as const;

/**
 * C-11: evidence archives may be shared/stored outside the server boundary,
 * so server-only credential material must never be included in either the
 * native pg_dump artifact or the fallback SQL snapshot.
 */
export function isEvidenceArchiveTable(tableName: string): boolean {
  return !(EVIDENCE_ARCHIVE_EXCLUDED_TABLES as readonly string[]).includes(tableName);
}

export function filterEvidenceArchiveTables(tables: string[]): string[] {
  return tables.filter(isEvidenceArchiveTable);
}

/**
 * D-024 delivery archive policy: a normal evidence archive should represent
 * a run whose evidence chain is no longer actively changing. `paused` is
 * allowed because partial runs are deliverable when explicitly labeled
 * PARTIAL; queued/running are still mutable, and failed/cancelled are debug
 * records unless the operator opts into a partial archive.
 */
export function isEvidenceArchiveReadyRunState(state: string): boolean {
  return (EVIDENCE_ARCHIVE_READY_RUN_STATES as readonly string[]).includes(state);
}

export function shouldBlockEvidenceArchiveForUnreviewedClaims(input: {
  kind: string | null | undefined;
  runMode: string;
  unreviewedClaimCount: number;
  allowUnreviewedClaims: boolean;
}): boolean {
  return (
    input.kind !== "resonance" &&
    input.runMode === "live_audit" &&
    input.unreviewedClaimCount > 0 &&
    !input.allowUnreviewedClaims
  );
}

export function shouldBlockEvidenceArchiveForMissingMetrics(input: {
  eligibleSampleCount: number;
  metricRowCount: number;
  allowIncompleteMetrics: boolean;
}): boolean {
  return input.eligibleSampleCount > 0 && input.metricRowCount === 0 && !input.allowIncompleteMetrics;
}

export function orderTablesByForeignKeys(
  tables: string[],
  dependencies: Array<{ child_table: string; parent_table: string }>,
): string[] {
  const tableSet = new Set(tables);
  const remaining = new Set(tables);
  const ordered: string[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((table) =>
        dependencies.every(
          (dependency) =>
            dependency.child_table !== table ||
            dependency.parent_table === table ||
            !tableSet.has(dependency.parent_table) ||
            !remaining.has(dependency.parent_table),
        ),
      )
      .sort();

    if (ready.length === 0) {
      // There are no expected FK cycles in the app schema, but keep the
      // fallback archive deterministic if a future optional table adds one.
      ordered.push(...[...remaining].sort());
      break;
    }

    for (const table of ready) {
      ordered.push(table);
      remaining.delete(table);
    }
  }

  return ordered;
}

/**
 * Avoid passing DATABASE_URL to pg_dump as argv: connection URIs often carry
 * DB passwords, and process arguments are easy to observe. Also avoid
 * inheriting the whole app env into the child process: pg_dump does not need
 * APP_PASSWORD, SESSION_SECRET, CREDENTIALS_ENCRYPTION_KEY, or provider
 * configuration. libpq accepts these PG* env vars directly.
 */
export function pgDumpEnvFromDatabaseUrl(
  databaseUrl: string,
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }

  const env = {} as NodeJS.ProcessEnv;
  for (const key of PG_DUMP_INHERITED_ENV_KEYS) {
    if (baseEnv[key]) env[key] = baseEnv[key];
  }
  env.PGHOST = parsed.hostname;
  env.PGPORT = parsed.port || undefined;
  env.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  env.PGUSER = decodeURIComponent(parsed.username);
  env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

const PG_DUMP_INHERITED_ENV_KEYS = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;
