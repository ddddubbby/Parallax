// M33 / D-092: boot ephemeral Postgres + Next for Playwright smoke.
// Keeps CI independent of the operator's local Insta 360 project.
import { spawn, type ChildProcess } from "node:child_process";
import { startEphemeralTestDb } from "./test-db";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";

async function main() {
  const handle = await startEphemeralTestDb();
  if (handle.connectionString.includes("parallax_test_unavailable")) {
    console.error("[playwright-webserver] ephemeral DB failed to start");
    process.exit(1);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: handle.connectionString,
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
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  child.on("exit", (code) => {
    void handle.stop().then(() => process.exit(code ?? 1));
  });
}

main().catch((err) => {
  console.error("[playwright-webserver] failed:", err);
  process.exit(1);
});
