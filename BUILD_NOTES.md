# BUILD_NOTES.md - Session Working Memory

> Disposable mid-milestone state for agent handoff. This file answers "what was the last session doing?" — nothing else. Durable facts do not live here: decisions go to the `MASTER_CONTEXT.md` Decision Log, status goes to the `PRD.md` tracker, schema/contract facts go to the spec docs.

## Rules

1. **Append one entry per session**, as step one of the handoff ritual — or immediately whenever stopping mid-task or blocked.
2. **Disposable:** when a milestone merges, delete its entries. Anything still worth keeping must graduate to a canonical doc first; if it can't, it wasn't worth keeping.
3. **No restating:** never duplicate what a commit message, the PRD tracker, or the Decision Log already says. The unique value here is dead ends, unverified work, and the exact next action.

## Template

```
## S-<NNN> / <YYYY-MM-DD> / M<N>
GOAL: <one line: what this session set out to do>
DONE: <verified work, each with the command or check that proved it>
UNVERIFIED: <built but not yet proven; say what proof is missing>
REJECTED: <approach tried and abandoned + why, one line each>
NEXT: <the exact first action for the next session — command or file-level>
GOTCHAS: <environment quirks, surprising behavior, anything that cost >10 minutes>
```

Session numbers increment forever and never reset; omit empty fields except NEXT, which is mandatory.

---

## Entries

## S-001 / 2026-07-02 / M0
GOAL: Finalize the documentation layer before production build starts.
DONE: Three review passes complete; D-011 through D-025 resolved and logged; credential model, design language, Render contract, and this file wired into the doc system. Verified by cross-doc grep and commits `b36bd6e`, `c3dfff0`.
NEXT: Start the M0 scaffold — `package.json` (with `packageManager` pin), `.node-version`, Next/Vitest/Drizzle configs, `/health` route, CI workflow, per `RENDER_DEPLOYMENT.md` prerequisites. Boot ritual applies: plan and confirm before editing.
GOTCHAS: No dependencies installed yet; nothing runs. Drizzle config must pin `out` to `src/db/migrations` (see ENGINEERING_SPEC section 2).

## S-002 / 2026-07-02 / M0
GOAL: Build the M0 runnable scaffold on branch `m0-foundation`.
DONE: `pnpm lint`, `pnpm typecheck`, `pnpm test` (1 test), `pnpm build` all exit 0. `/health` smoke-tested via the standalone server (`PORT=3199 node .next/standalone/server.js` -> HTTP 200). Worker entrypoint starts and shuts down cleanly on SIGTERM.
UNVERIFIED: CI workflow (`.github/workflows/ci.yml`) — no GitHub remote exists, so it has never executed. `pnpm db:migrate` against a live Postgres — fails locally with connection error because no local Postgres is installed; the empty-migrations-folder path is therefore also untested.
REJECTED: `next lint` (deprecated in Next 15.x — used flat-config `eslint .` instead). Wrapping `db:migrate` in a journal-existence guard — deferred until M1 proves it's needed.
NEXT: M1 — create GitHub remote and push (verifies CI), then first migration implementing the ENGINEERING_SPEC section 2 tables including `provider_credentials`; local Postgres (or Render dev DB) needed for `db:migrate`/`db:seed` acceptance.
GOTCHAS: This machine had no Node — installed Node 22.23.1 user-locally at `~/.local/share/node-v22/bin` (not on default PATH; export it or add to shell profile). pnpm 10 blocks postinstall scripts; approved esbuild/sharp/unrs-resolver declaratively via `pnpm.onlyBuiltDependencies` in package.json. `pnpm build` copies static assets into `.next/standalone/` — required for the Render start command to serve them.
