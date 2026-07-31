> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M52 product, milestone state, next action, and integration target · TRACKER: M52_BUILD_PLAN.md

# STATUS.md — M52 control plane

| Field | Value |
|---|---|
| **Active product** | Resonance operator web product — Run detail Diagnostics consolidation (D-122) |
| **Product contract** | [PRD.md](PRD.md) §8.40 |
| **Build plan** | [M52_BUILD_PLAN.md](M52_BUILD_PLAN.md) |
| **Branch** | `m52`, stacked on `m51-ui-ux-roadmap@b34b164` |
| **Current milestone** | M52 — Run detail Diagnostics consolidation |
| **Milestone state** | Done — pending merge after M50/M51 |
| **Next action** | Open PR against stack tip; retarget onto `main` after M50/M51 land |
| **Blocked on** | Nothing |
| **Integration order** | Merge M50, then M51, then retarget/merge M52 |
| **Parked product** | Resonance GEO agent remains parked (D-116) |

## M52 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Branch, D-122, STATUS/PRD/canon, this plan | Done |
| P1 | `diagnostics` view token + `events`/`extraction` aliases | Done |
| P2 | Run page tabs, Diagnostics shell, Overview recent-activity | Done |
| P3 | Contracts, e2e, full gates, BUILD_NOTES | Done |

## Acceptance evidence

- `pnpm lint --max-warnings 0` green
- `pnpm typecheck` green
- `pnpm docs:check` green (25 governed root docs)
- `pnpm test` — 901 passed / 12 skipped / 0 failed
- `pnpm build` green (clean `.next`)
- `pnpm test:e2e` — 18/18 (Diagnostics tab, `?view=events` alias, simulation events-only)
- `pnpm test:e2e:forecast` — 4/4
