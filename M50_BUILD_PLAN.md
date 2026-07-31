> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M50 live-run remaining-time forecast implementation and acceptance · TRACKER: STATUS.md

# M50 — Live-run remaining-time forecast

## Outcome

Replace the M46 point ETA, which jumps because it switches from historical-run seed data to as few as two live completion intervals, with a live-run-only forecast range. The run page never forecasts until 10 terminal pipeline completions have been observed in the run on screen, then renders a conservative p10–p90 range and nothing else.

## Rulings (D-120, supersedes D-117 ruling 3's ETA portion)

1. **Live-run-only inputs** — throughput derives solely from the current run's persisted terminal pipeline completion timestamps (generation success plus terminal extraction/scoring — overall pipeline completion). Compatible-prior-run ETA seeding, its repository query, the EWMA (α=0.35), and the 3×-median outlier filter are removed. No migration.
2. **Calibration floor** — no forecast until 10 terminal pipeline completions; state `calibrating` renders no estimate.
3. **Rolling-window range** — rolling five-completion windows across the latest 20 completions; per-window cadence is the window span divided by its four inter-completion gaps (exact for a steady pace); remaining-time estimates are `remaining × cadence`; the range is a conservative p10–p90 over those estimates (nearest-conservative-rank indices), displayed at minute granularity (low rounded down, high rounded up, clamped to ≥1 min). Ready copy is exactly `Estimated 8–14 min remaining` — no basis, sample-count, or explanatory copy on that line.
4. **Stale-pace recalibration** — when no terminal completion arrives for more than 3× the observed slow-end cadence, the range is suppressed and the state becomes `recalibrating` rather than leaving a stale forecast on screen.
5. **Suppressions and retained surfaces** — paused, worker-offline, terminal, and zero-remaining runs never render a range. Exact completed/total progress, generation/extraction-scoring stage lanes, the worker-offline banner, pause reason, and cost display are unchanged.

## Forecast DTO

`state`: `calibrating | ready | recalibrating | paused | offline | terminal | complete`; `range`: `{ lowSeconds, highSeconds } | null` (ready only). The detail DTO field is `forecast`; `RunEta`/`estimateRunEta` are deleted.

## Implementation phases

1. **Governance** — branch `m50` from `m49@7b0dc1a`; D-120 + supersession edge; STATUS/PRD §8.38/canon index; this plan.
2. **Core forecast** — `src/core/run-forecast.ts` (DTO, windows, percentiles, stale check, formatter) with hand-computed unit tests; delete the EWMA/outlier/seed machinery from `src/core/run-progress.ts` (stage lanes and pipeline-completion helpers stay).
3. **Repository** — `getRunDetail` returns `forecast` computed from current-run pipeline rows only; `listCompatiblePriorCompletionTimestamps` deleted; DB-backed test proves terminal-pipeline (not generation-only) inputs and that historical runs are never queried.
4. **Operator experience** — run page renders the ready line only, plus a `data-forecast-state` hook; source-contract assertions; disposable Playwright fixture runs (ready/recalibrating) in a separate forecast e2e harness.
5. **Verification** — lint, typecheck, docs:check, Vitest, production build, both Playwright harnesses; BUILD_NOTES evidence.

## Test plan

- Unit: calibration below/exactly at 10 terminal completions; range ordering; exact `Estimated 8–14 min remaining`; live-run-only signature (no seed parameter); concurrent completion bursts (duplicate timestamps, no NaN); slow windows widening the range; stale-pace recalibration at and beyond 3× slow cadence; paused/offline/terminal/complete suppression.
- Repository: detail DTO uses terminal pipeline completion (extraction/scoring timestamp), not generation success alone; a compatible prior run does not change a calibrating current run (historical samples never queried); offline when the heartbeat is stale.
- UI contract: ready-only rendering, exact-copy formatter import, `data-testid="run-forecast"`, no legacy `run-eta`/EWMA references in the run page.
- Playwright main harness (workerless, offline by construction): `WORKER OFFLINE` + `data-forecast-state="offline"` + no forecast line on a newly started mock run.
- Playwright forecast harness (`playwright.forecast.config.ts`, disposable DB with fixture heartbeat): calibration on a fresh mock run, paused via the Pause control with reason, exact ready text on the seeded fixture, recalibration on the stale-pace fixture.

## Harness split (why two Playwright configs)

The main e2e database never runs a worker and already asserts `WORKER OFFLINE`; a live forecast requires a fresh heartbeat. One global heartbeat cannot be simultaneously stale and fresh, so the forecast states get their own disposable harness (`M50_FORECAST_FIXTURES=true`, port 3101, future-dated fixture heartbeat) while the main harness keeps the offline behavior. Both run in CI.

## Stop lines

- No historical-run data in the forecast; no per-provider pace decomposition; no second-by-second countdown.
- No basis, sample-count, or explanatory copy on the ready line.
- No migration, schema, provider-concurrency, retry, extraction-semantics, or spend-control change.
- No change to the framing-batch coarse remaining estimate (`formatApproxRemaining` in `framing-batch.ts` stays).

## Acceptance

Filled in at close: gates and evidence land in `STATUS.md` + `BUILD_NOTES.md` per D-092.
