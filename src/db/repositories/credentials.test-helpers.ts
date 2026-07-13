// TEST-ONLY cross-file mutual exclusion for suites that mutate ACTIVE
// provider-credential rows. saveCredential is disable-then-insert per provider
// (D-020) — a GLOBAL per-provider mutation — so two test files exercising it on
// the same provider under vitest file parallelism intermittently deactivate
// each other's active row mid-test (the S-092/S-093 "settings flake").
// A session-scoped Postgres advisory lock serializes exactly these suites and
// nothing else. Never import outside test files.

import type { Pool, PoolClient } from "pg";

const CREDENTIALS_SUITE_LOCK = 490_301;

export async function acquireCredentialsSuiteLock(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query("select pg_advisory_lock($1)", [CREDENTIALS_SUITE_LOCK]);
  return client;
}

export async function releaseCredentialsSuiteLock(client: PoolClient | null): Promise<void> {
  if (!client) return;
  await client.query("select pg_advisory_unlock($1)", [CREDENTIALS_SUITE_LOCK]).catch(() => {});
  client.release();
}
