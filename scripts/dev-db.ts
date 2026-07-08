// Local dev Postgres via embedded binaries — this machine has no system
// Postgres or docker. Runs in the foreground; Ctrl+C stops it cleanly.
// Data persists in .pgdata (gitignored). Production uses Render Postgres.
import "../src/env-bootstrap";
import EmbeddedPostgres from "embedded-postgres";
import { ensureDylibSymlinks } from "./lib/pg-dylib-fix";

const pg = new EmbeddedPostgres({
  databaseDir: ".pgdata",
  user: "postgres",
  password: "postgres",
  port: 5432,
  persistent: true,
});

async function main() {
  ensureDylibSymlinks();
  const initialized = await pg
    .initialise()
    .then(() => true)
    .catch(() => false); // already initialized on prior runs
  await pg.start();
  if (initialized) {
    await pg.createDatabase("parallax");
  }
  console.log(
    "[dev-db] postgres running on :5432 (db: parallax). Ctrl+C to stop.",
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      console.log(`[dev-db] ${signal} received, stopping postgres`);
      await pg.stop();
      process.exit(0);
    });
  }
}

main().catch(async (err) => {
  console.error("[dev-db] failed:", err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
