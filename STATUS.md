> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M50 product, milestone state, next action, and integration target · TRACKER: M50_BUILD_PLAN.md

# STATUS.md — M50 control plane

| Field | Value |
|---|---|
| **Active product** | Resonance operator web product — live-run remaining-time forecast (D-120) |
| **Product contract** | [PRD.md](PRD.md) §8.38 |
| **Build plan** | [M50_BUILD_PLAN.md](M50_BUILD_PLAN.md) |
| **Branch** | `m50`, cut from `m49@7b0dc1a` (M49 complete, pending merge) |
| **Current milestone** | M50 — Live-run remaining-time forecast |
| **Milestone state** | Done — pending merge |
| **Next action** | Open PR / merge `m50` when ready |
| **Blocked on** | Nothing |
| **Parked product** | Resonance GEO agent remains parked (D-116) |

## M50 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Branch, D-120, STATUS/PRD/canon, this plan | Done |
| P1 | Core forecast module + unit tests; EWMA/outlier/seed removal | Done |
| P2 | Repository forecast wiring; drop prior-run query; DB test | Done |
| P3 | Run-page rendering, contracts, fixtures, both Playwright harnesses | Done |
| P4 | Full gates + BUILD_NOTES evidence | Done |

## Acceptance evidence

- `pnpm lint --max-warnings 0` green
- `pnpm typecheck` green
- `pnpm docs:check` green (23 governed root docs)
- `pnpm test` — 884 passed / 12 skipped / 0 failed
- `pnpm build` green (clean `.next`)
- `pnpm test:e2e` — 18/18 (includes offline forecast state)
- `pnpm test:e2e:forecast` — 4/4 (ready exact copy, recalibrating, calibrating, paused)
