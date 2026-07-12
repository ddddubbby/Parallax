> LIFECYCLE: ACTIVE · ROLE: PLAYBOOK · OWNS: go-live gates and per-audit delivery/archive record (D-043)

# RELEASE_CHECKLIST.md - Go-Live Gates and Per-Audit Delivery Record

> The M10 acceptance artifact ("release checklist complete"). Two parts: the
> one-time go-live gates that must all pass before the first paid audit, and
> the per-audit delivery checklist recorded for every client engagement
> (PRD §11 item 11 / D-024). Split from `RENDER_DEPLOYMENT.md` because that
> doc covers the first deploy while this one changes with every delivered
> audit (recorded as D-043).

## Part 1 — Go-live gates (one-time, in order)

Check these off during the first production bring-up. Every gate has an
owner: **[op]** = operator action, **[auto]** = provable by a command.

- [ ] **[op] Render Blueprint deployed** from `render.yaml` per
  `RENDER_DEPLOYMENT.md`'s first-deploy flow; `APP_PASSWORD` set at prompt.
- [ ] **[op] Wait-for-CI enabled** on the Render services — otherwise a push
  deploys even when GitHub Actions is red (RENDER_DEPLOYMENT.md operational
  notes). Verify in the Render dashboard, not by assumption.
- [ ] **[op] Database backup retention verified** on the Render plan, and
  understood as NOT the evidence archive (D-024).
- [ ] **[auto] `/health` returns 200** on the deployed URL.
- [ ] **[op] Login works** with `APP_PASSWORD`; `/debug` and `/settings`
  are unreachable logged-out (ST-6). Confirm `DISABLE_AUTH` is absent from
  every production env var group — it must exist only in local `.env.local`.
- [ ] **[op] Provider keys entered via Settings** (never in Render env,
  C-11): DeepSeek first (it is also the extraction engine, D-041), then any
  of OpenAI/Anthropic/Gemini/Perplexity being used for the audit. Verify
  each key with the Settings Verify button (a real, minimal paid call).
- [ ] **[auto] Mock validation run completes** on production: a mock run
  through the UI finishes, dashboard renders, report generates. Proves the
  whole pipeline on the deployed infrastructure at $0.
- [ ] **[auto] `pnpm audit:deepseek-mini` passes** (M8's live acceptance:
  5 cells x k=2 under $2, breaker proof phase fires). First real spend.
- [ ] **[auto] Grounded live validation run passes** on each grounded
  provider used for the audit, and specifically **closes the Gemini
  grounding caveat** (ENGINEERING_SPEC §3): confirm real citations parse
  into `citations_json` for every grounded provider before any grounded
  audit-grade run.
- [ ] **[op] Worker heartbeat visible** in `/debug` during the runs above
  (RN-9) — proves the deployed worker, not a local one, did the work.
- [ ] **[auto] Worker drains on SIGTERM** instead of exiting immediately:
  an in-flight paid provider call is allowed to finish (or the job is
  released cleanly for reclaim) within a bounded deadline before the
  process exits. Without this, a Render redeploy mid-run risks an
  ambiguous billing outcome on a paid call (D-092).
- [ ] **[auto] `/health` checks database readiness**, not liveness only —
  a DB that's down or unreachable must not report a healthy 200 (D-092).
- [ ] **[op] Observability wiring matches the stack table**: either pino
  and Sentry are actually installed and wired before this gate, or the
  stack tables in `MASTER_CONTEXT.md` §5 and `DEVELOPMENT_GUIDELINES.md`
  are confirmed still accurate as corrected (D-092) — `reportError`
  (`src/observability.ts`) remains the single swap-in seam per D-076.

## Part 2 — Per-audit delivery checklist (every engagement)

Copy this block into the log below for each delivered audit.

- [ ] Run mode is `live_audit`, k=5 (C-1); matrix version approved and frozen (C-4).
- [ ] Misinformation register fully reviewed — no `unreviewed` claims left
  (`claims_found.reviewed_at` set, D-024).
- [ ] Aggregate report claims all carry n >= 30; anything below renders as
  insufficient-data or directional-only (D-015).
- [ ] Report sections reviewed and edited by the operator; RB-5 tone spot-checked.
- [ ] Resonance demo gate (internal): `pnpm demo:resonance` exits 0, then walk audit evidence -> Resonance study -> mock run -> results -> report -> exports at $0.
- [ ] Exports delivered to client: report (Markdown and/or print-PDF) +
  agreed evidence pack subset.
- [ ] **Evidence archived (D-024): `pnpm archive:evidence <runId>` exits 0.
  The run must be completed or paused; queued/running/failed/cancelled runs
  fail closed unless `ARCHIVE_ALLOW_PARTIAL=true` is explicitly set for a
  debug/partial archive that will not be treated as final delivery evidence.
  Preferred dump mode is native `pg_dump` custom format redacted to exclude
  server-only provider credentials; if local Postgres client tools are
  unavailable, the script writes a marked SQL data snapshot plus dump manifest
  through the existing DB connection with the same exclusion. Set
  `ARCHIVE_REQUIRE_PG_DUMP=true` when a native custom dump is mandatory.
  Archive directory moved OFF Render (external drive / cloud storage).**
- [ ] Archive recorded in the log below.
- [ ] Retro logged: pilot audits get a full retro in `MASTER_CONTEXT.md`
  (PRD §11 item 9); later audits get at least a BUILD_NOTES entry.

## Archive log

| Date | Project | Run ID | Archive location | Dump mode | Recorded by |
|---|---|---|---|---|---|
| _none yet_ | | | | | |
