// Local dev Postgres via embedded binaries — this machine has no system
// Postgres or docker. Runs in the foreground; Ctrl+C stops it cleanly.
// Data persists in .pgdata (gitignored). Production uses Render Postgres.
import "../src/env-bootstrap";
import { existsSync, readdirSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

// The beta platform packages publish dylibs only under fully-versioned names
// (libzstd.1.5.7.dylib) while the binaries reference shortened ones
// (libzstd.1.dylib) — npm tarballs drop symlinks. Recreate every shortened
// alias so the binaries load. Safe to re-run; skips existing files.
function ensureDylibSymlinks() {
  if (process.platform !== "darwin") return;
  // pnpm strict layout: the platform package is resolvable only from
  // embedded-postgres itself, not from this project.
  const projectRequire = createRequire(import.meta.url);
  let libDir: string;
  try {
    const epRequire = createRequire(
      projectRequire.resolve("embedded-postgres"),
    );
    // Both packages block ./package.json via exports; resolve the main entry
    // and walk up to the directory that contains native/.
    let dir = dirname(
      epRequire.resolve(`@embedded-postgres/darwin-${process.arch}`),
    );
    while (!existsSync(join(dir, "native")) && dir !== dirname(dir)) {
      dir = dirname(dir);
    }
    libDir = join(dir, "native", "lib");
  } catch (err) {
    console.warn("[dev-db] could not locate platform binaries for dylib fix:", err);
    return;
  }
  if (!existsSync(libDir)) return;
  for (const file of readdirSync(libDir)) {
    const match = /^(lib[^.]+)\.((?:\d+\.)*\d+)\.dylib$/.exec(file);
    if (!match) continue;
    const [, base, version] = match;
    const parts = version.split(".");
    for (let keep = parts.length - 1; keep >= 0; keep--) {
      const shortName =
        keep === 0
          ? `${base}.dylib`
          : `${base}.${parts.slice(0, keep).join(".")}.dylib`;
      const target = join(libDir, shortName);
      if (!existsSync(target)) symlinkSync(file, target);
    }
  }
}

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
