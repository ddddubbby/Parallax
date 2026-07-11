// M22 Part A: ephemeral embedded-Postgres test database. Boots a throwaway
// Postgres cluster on a distinct port (:5433, never the dev DB's :5432),
// migrates it, seeds it (idempotent D-016 fixtures), and hands back a
// connection string. Used two ways:
//
//   1. Programmatically by `scripts/vitest-global-setup.ts` — every
//      `pnpm test` run gets its own fresh instance, torn down after.
//   2. Standalone via `pnpm test:db` — boots the same instance in the
//      foreground (mirrors `pnpm db:dev`'s UX) for manual poking with
//      `DATABASE_URL=postgres://postgres:postgres@localhost:5433/parallax_test
//      pnpm db:studio` or similar. Ctrl+C tears it down (data is NOT
//      persisted between runs — `persistent: false` deletes the data dir
//      on stop, unlike the dev DB).
//
// Total isolation is the point (D-073's hazard): this DB is never the same
// process/port/data-dir as the dev DB scripts/dev-db.ts serves, so a test
// run can never claim/insert/delete against real operator data.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { ensureDylibSymlinks } from "./lib/pg-dylib-fix";

const TEST_DB_PORT = 5433;
const TEST_DB_NAME = "parallax_test";
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../src/db/migrations", import.meta.url));
const SEED_SCRIPT = fileURLToPath(new URL("./seed.ts", import.meta.url));
const TSX_BIN = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

export interface TestDbHandle {
  connectionString: string;
  stop: () => Promise<void>;
}

/**
 * Migrate + seed an already-running Postgres reachable at `connectionString`.
 * Extracted so both the embedded-Postgres path (below) and an external DB
 * (a CI Postgres service container, D-092 e2e hotfix) share one code path.
 * Migrate is idempotent (drizzle tracks applied migrations); seed is
 * idempotent (D-016 fixtures). Uses a throwaway pool and a child-process
 * seed so it never shares src/db/client's singleton pool.
 */
export async function migrateAndSeed(connectionString: string): Promise<void> {
  const migPool = new Pool({ connectionString });
  try {
    await migrate(drizzle(migPool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migPool.end();
  }
  execFileSync(TSX_BIN, [SEED_SCRIPT], {
    env: { ...process.env, DATABASE_URL: connectionString },
    stdio: "inherit",
  });
}

// A connection string that can never resolve — used when the ephemeral PG
// itself fails to start (bad platform binary, sandboxed environment, etc.)
// so that dbUp checks in test files fail closed instead of silently
// falling through to src/db/client.ts's dev-DB fallback on :5432.
const UNREACHABLE_CONNECTION_STRING = "postgres://postgres:postgres@127.0.0.1:1/parallax_test_unavailable";

/**
 * Boots a fresh, migrated, seeded, ephemeral Postgres instance.
 *
 * Local (no CI): never throws — on failure it logs a warning and returns a
 * handle whose connectionString is guaranteed unreachable, so DB-backed tests
 * degrade to `describe.skipIf(!dbUp)` (D-078).
 *
 * CI (`CI=true`, D-092 / M33): startup failure is fatal. A broken runner must
 * not silently skip 96+ DB-backed tests and report green.
 */
export async function startEphemeralTestDb(): Promise<TestDbHandle> {
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const parsed = new URL(external);
    if (!parsed.pathname.toLowerCase().includes("test")) {
      throw new Error("TEST_DATABASE_URL must name a dedicated database containing 'test'");
    }
    await migrateAndSeed(external);
    return { connectionString: external, stop: async () => {} };
  }
  const databaseDir = join(tmpdir(), `parallax-test-pg-${process.pid}-${Date.now()}`);
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: "postgres",
    password: "postgres",
    port: TEST_DB_PORT,
    persistent: false,
  });

  const cleanupDir = () => {
    if (existsSync(databaseDir)) rmSync(databaseDir, { recursive: true, force: true });
  };

  try {
    ensureDylibSymlinks();
    await pg.initialise();
    await pg.start();
    await pg.createDatabase(TEST_DB_NAME);

    const connectionString = `postgres://postgres:postgres@localhost:${TEST_DB_PORT}/${TEST_DB_NAME}`;

    await migrateAndSeed(connectionString);

    return {
      connectionString,
      stop: async () => {
        await pg.stop().catch(() => {});
        cleanupDir();
      },
    };
  } catch (err) {
    await pg.stop().catch(() => {});
    cleanupDir();
    if (process.env.CI === "true") {
      console.error("[test-db] ephemeral Postgres failed to start under CI=true — failing hard (D-092):", err);
      throw err instanceof Error ? err : new Error(String(err));
    }
    console.warn(
      "[test-db] ephemeral Postgres failed to start — DB-backed tests will self-skip (describe.skipIf(!dbUp)):",
      err,
    );
    return {
      connectionString: UNREACHABLE_CONNECTION_STRING,
      stop: async () => {},
    };
  }
}

// Standalone foreground mode: `pnpm test:db`.
async function main() {
  const handle = await startEphemeralTestDb();
  if (handle.connectionString === UNREACHABLE_CONNECTION_STRING) {
    console.error("[test-db] failed to start — see warning above");
    process.exit(1);
  }
  console.log(`[test-db] postgres running on :${TEST_DB_PORT} (db: ${TEST_DB_NAME}), migrated + seeded.`);
  console.log(`[test-db] DATABASE_URL=${handle.connectionString}`);
  console.log("[test-db] Ctrl+C to stop (ephemeral — data is discarded, unlike pnpm db:dev).");

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      console.log(`[test-db] ${signal} received, stopping postgres`);
      await handle.stop();
      process.exit(0);
    });
  }
}

// Only run standalone when invoked directly (`tsx scripts/test-db.ts`), not
// when imported by the vitest global setup.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[test-db] failed:", err);
    process.exit(1);
  });
}
