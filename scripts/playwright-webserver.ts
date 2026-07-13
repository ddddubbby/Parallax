// M33 / D-092: boot a seeded Postgres + Next for the Playwright smoke run.
// Keeps CI independent of the operator's local Insta 360 project.
//
// Two DB sources (D-092 e2e hotfix):
//   - CI: `E2E_DATABASE_URL` points at a Postgres SERVICE CONTAINER. We only
//     migrate + seed it — no embedded-Postgres. This sidesteps embedded
//     initdb's fragility on the CI runner (the `pnpm test:e2e` boot failed
//     there where `pnpm test`'s earlier embedded boot had succeeded, because
//     the intervening `playwright install --with-deps` mutated the runner).
//   - Local: no env var → boot a throwaway embedded-Postgres, same as vitest.
import { spawn, type ChildProcess } from "node:child_process";
import { migrateAndSeed, startEphemeralTestDb } from "./test-db";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";

async function resolveDb(): Promise<{ connectionString: string; stop: () => Promise<void> }> {
  const external = process.env.E2E_DATABASE_URL;
  if (external) {
    await migrateAndSeed(external);
    return { connectionString: external, stop: async () => {} };
  }
  const handle = await startEphemeralTestDb();
  if (handle.connectionString.includes("parallax_test_unavailable")) {
    throw new Error("ephemeral DB failed to start (and no E2E_DATABASE_URL provided)");
  }
  return { connectionString: handle.connectionString, stop: handle.stop };
}

async function main() {
  // M43 visual/E2E review opts into a rich MOCK dashboard/report fixture.
  // The seed writes only to this disposable database and never starts a worker.
  process.env.M43_UI_FIXTURES = "true";
  const db = await resolveDb();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: db.connectionString,
    DISABLE_AUTH: "true",
    APP_ENV: "development",
    NODE_ENV: "development",
    PORT,
  };

  const child: ChildProcess = spawn("pnpm", ["exec", "next", "dev", "-p", PORT], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const shutdown = async () => {
    child.kill("SIGTERM");
    await db.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  child.on("exit", (code) => {
    void db.stop().then(() => process.exit(code ?? 1));
  });
}

main().catch((err) => {
  console.error("[playwright-webserver] failed:", err);
  process.exit(1);
});
