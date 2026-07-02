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

## S-003 / 2026-07-02 / M1
GOAL: Full schema + idempotent seed + constants on branch `m1-schema`.
DONE: Migration `0000_init_full_schema.sql` (20 tables, 2 check constraints, 3 partial unique indexes) applied clean via `pnpm db:migrate`. `pnpm db:seed` twice: run 1 inserts 15 templates + demo project (4 brands, 5 claims, 6 attributes, 2 personas, 2 markets); run 2 inserts nothing, counts identical. Constraint spot-checks: second client brand rejected (23505), 51-cell matrix rejected (23514). Lint/typecheck/test green.
UNVERIFIED: CI (still no GitHub remote). `pnpm db:studio` never opened. Embedded dev DB is PG 17; Render runs whatever `parallax-db` provisions — minor version skew possible.
REJECTED: embedded-postgres@18.4.0-beta.17 — darwin-arm64 binary ships without dylib symlinks (libzstd.1.dylib missing); pinned 17.10.0-beta.17 + wrote a symlink-repair shim into scripts/dev-db.ts. Three resolution attempts needed: both packages block `./package.json` via exports, so the shim resolves main entries and walks up to `native/`.
NEXT: Create the GitHub remote and push (closes M0's CI verification), then M2 intake wizard (read DESIGN_GUIDELINES.md first — UI milestone).
GOTCHAS: `pnpm db:dev` runs the embedded Postgres in the foreground (data in `.pgdata`, matches default DATABASE_URL). package.json has no `"type": "module"`, so top-level await fails in tsx scripts — wrap in `main()`. `next build` regenerates `next-env.d.ts` with a triple-slash reference that trips lint; the file is now eslint-ignored (generated, never hand-edited).

## S-004 / 2026-07-02 / M2
GOAL: Intake wizard on branch `m2-intake`: 7 steps + review, autosave, resume, strict validation.
DONE: Tailwind v4 tokens + fonts per DESIGN_GUIDELINES; migration 0001 (`intake_draft_json`, D-026); core Zod step schemas + alias overlap + 9 unit tests; server actions (autosave/completeStep/finishIntake); /projects list + /projects/new wizard. Verified live in browser: empty Next blocked with 3 field errors; autosave created draft + "Saved HH:MM:SS"; quit → /projects shows draft 1/8 with Resume; resume restored all fields; valid Next advanced to step 2 with high-water rail. Tests/typecheck/lint/build green; migration applied to dev DB.
UNVERIFIED: Full 7-step walk to review + completion in the browser (core paths unit-tested; review/completion code exercised only by inspection). CI — first run triggers on this push. Alias-overlap warning rendering on review screen.
REJECTED: shadcn/ui init for M2 — hand-rolled token-backed primitives (src/components/ui.tsx) suffice until a complex widget (dialog/combobox) arrives; stack doc unchanged. react-hook-form — controlled state + server Zod is enough (A2).
NEXT: M3 budget-aware matrix (allocator in /src/core using DEFAULT_INTENT_ALLOCATION + PM-11 redistribution, template rendering, 50-cap UI+server, approval freeze). Before M3: walk the full wizard once manually and check the first CI run on GitHub Actions.
GOTCHAS: .claude/launch.json must use the absolute node binary path (pnpm shim fails — no node on default PATH). React controlled inputs need native-setter + input-event dispatch when driven from eval. The dev-server tab can navigate away on HMR reloads mid-test — re-navigate before asserting.
