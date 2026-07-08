// M22 Part A: vitest globalSetup — runs once in Vitest's main process,
// BEFORE any test-file worker is spawned (Vitest constructs the worker
// pool lazily; workers aren't created until `pool.runTests()`, which runs
// after this file's `setup()` resolves). That ordering is what makes this
// safe: `process.env.DATABASE_URL` is overridden here, in the parent
// process, before any worker inherits the environment, so every test
// file's `import { pool } from "@/db/client"` picks up the ephemeral test
// DB the first time it evaluates that module — never the dev DB on :5432.
//
// D-073's hazard (destructive DB-backed tests corrupting a live dev DB) is
// closed by construction: DATABASE_URL is ALWAYS overridden, even on
// failure (to a guaranteed-unreachable string), so there is no code path
// where a test worker's default fallback (src/db/client.ts's hardcoded
// `localhost:5432/parallax`) is ever reached.
import type { TestDbHandle } from "./test-db";
import { startEphemeralTestDb } from "./test-db";

let handle: TestDbHandle | undefined;

export async function setup() {
  handle = await startEphemeralTestDb();
  process.env.DATABASE_URL = handle.connectionString;
}

export async function teardown() {
  await handle?.stop();
}
