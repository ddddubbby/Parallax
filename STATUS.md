> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M47 product, milestone state, next action, and integration target · TRACKER: M47_BUILD_PLAN.md

# STATUS.md — M47 control plane

> Read this file first in the `m47` worktree. It describes only this branch (D-112).

| Field | Value |
|---|---|
| **Active product** | Resonance authenticated operator web product — M47 transition feedback and refresh cleanup (D-118) |
| **Product contract** | [PRD.md](PRD.md) (§8.36; no measurement/schema change) |
| **Build plan** | [M47_BUILD_PLAN.md](M47_BUILD_PLAN.md) |
| **Branch** | `m47`, cut from `main` at `ec9f2f8` (post-M46 merge PR #7); integration target `main` (D-113) |
| **Current milestone** | M47 — reachable route loading, same-segment pending feedback, redundant refresh removal |
| **Milestone state** | M47 complete (P0–P4); ready to merge |
| **Next action** | Open PR `m47` → `main`; archive `M47_BUILD_PLAN.md` + prune M47 BUILD_NOTES in the merge commit (D-025/D-113) |
| **Blocked on** | Nothing — gates green |
| **Parked product** | Resonance GEO agent — parked without further notice (D-116); branches/docs/code untouched and recoverable. Codebook framing workflow remains read-only historical (D-114) |

## M47 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Governance: archive M46, D-118, STATUS, plan, PRD §8.36 | Complete |
| P1 | Reachable `projects` / `[id]` loading + sync layout Suspense split | Complete |
| P2 | LocalViewTabs + ReportRunSwitcher pending feedback | Complete |
| P3 | Remove duplicate `router.refresh` after `revalidatePath` | Complete |
| P4 | Playwright + source contract + full gates | Complete |
