// M0 worker skeleton: proves the entrypoint and deploy wiring. The polling
// loop over the jobs table arrives with M4; heartbeat run_events with RN-9.
const HEARTBEAT_MS = 30_000;

console.log(`[worker] parallax-worker started (pid ${process.pid})`);

const timer = setInterval(() => {
  console.log(
    `[worker] heartbeat ${new Date().toISOString()} — no jobs table until M1`,
  );
}, HEARTBEAT_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    console.log(`[worker] ${signal} received, shutting down`);
    process.exit(0);
  });
}
