// M50 / D-120: boot a seeded Postgres + Next for the forecast Playwright
// harness. Same pattern as playwright-webserver.ts, but opts into the M50
// forecast fixtures (future-dated heartbeat + ready/recalibrating runs) on
// port 3101 so the main harness can keep asserting WORKER OFFLINE.
import { spawn, type ChildProcess } from "node:child_process";
import { migrateAndSeed, startEphemeralTestDb } from "./test-db";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3101";

async function resolveDb(): Promise<{ connectionString: string; stop: () => Promise<void> }> {
  const external = process.env.E2E_FORECAST_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
  if (external) {
    await migrateAndSeed(external);
    return { connectionString: external, stop: async () => {} };
  }
  const handle = await startEphemeralTestDb();
  if (handle.connectionString.includes("parallax_test_unavailable")) {
    throw new Error("ephemeral DB failed to start (and no E2E_FORECAST_DATABASE_URL provided)");
  }
  return { connectionString: handle.connectionString, stop: handle.stop };
}

async function main() {
  process.env.M43_UI_FIXTURES = "true";
  process.env.M50_FORECAST_FIXTURES = "true";
  const db = await resolveDb();

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: db.connectionString,
    CREDENTIALS_ENCRYPTION_KEY: "6d34332d646973706f7361626c652d62726f777365722d64656d6f2d6b657921",
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
  console.error("[playwright-forecast-webserver] failed:", err);
  process.exit(1);
});
