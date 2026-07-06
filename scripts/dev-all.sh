#!/bin/sh
# Local full-stack dev: the Next app AND the polling worker together, so a run
# started in the UI actually executes without a second terminal. On Render
# these are two always-on services (render.yaml web + worker), so production
# already behaves this way — this only reproduces it locally.
#
# `pnpm dev` stays UI-only on purpose: the preview harness (scripts/dev-server.sh)
# spawns it and must not start a worker that could pick up and spend on a live
# run during automated front-end sessions. Use `pnpm dev:all` for full operation.
#
# Requires Postgres up (pnpm db:dev). Ctrl-C stops both processes.
set -eu

cleanup() {
  trap - EXIT INT TERM
  if [ -n "${WORKER_PID:-}" ]; then
    kill "$WORKER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[dev:all] starting worker (pnpm worker) + app (pnpm dev). Ctrl-C stops both."
pnpm worker &
WORKER_PID=$!

# App in the foreground; when it exits (Ctrl-C), cleanup kills the worker.
pnpm dev
