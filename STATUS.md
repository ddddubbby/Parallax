> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M50 product, milestone state, next action, and integration target · TRACKER: M50_BUILD_PLAN.md

# STATUS.md — M50 control plane

| Field | Value |
|---|---|
| **Active product** | Resonance operator web product — live-run remaining-time forecast (D-120) |
| **Product contract** | [PRD.md](PRD.md) §8.38 |
| **Build plan** | [M50_BUILD_PLAN.md](M50_BUILD_PLAN.md) |
| **Branch** | `m50`, cut from `m49@7b0dc1a` (M49 complete, pending merge) |
| **Current milestone** | M50 — Live-run remaining-time forecast |
| **Milestone state** | In progress — P0 governance |
| **Next action** | P1: core `src/core/run-forecast.ts` + unit tests; remove EWMA/seed machinery |
| **Blocked on** | Nothing |
| **Parked product** | Resonance GEO agent remains parked (D-116) |

## M50 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Branch, D-120, STATUS/PRD/canon, this plan | In progress |
| P1 | Core forecast module + unit tests; EWMA/outlier/seed removal | Pending |
| P2 | Repository forecast wiring; drop prior-run query; DB test | Pending |
| P3 | Run-page rendering, contracts, fixtures, both Playwright harnesses | Pending |
| P4 | Full gates + BUILD_NOTES evidence | Pending |

## Acceptance evidence

Pending — filled per phase per D-092.
