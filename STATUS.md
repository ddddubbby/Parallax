> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M43 product, milestone state, next action, and integration target · TRACKER: M43_BUILD_PLAN.md

# STATUS.md — M43 control plane

> Read this file first in the `m43` worktree. It describes only this branch. The GEO agent's branch, commits, pull request, and branch-local `STATUS.md` remain authoritative for agent work; their live state is not mirrored here.

| Field | Value |
|---|---|
| **Active product** | Resonance authenticated operator web product — presentation-only UI refinement |
| **Product contract** | [PRD.md](PRD.md), with M0–M34A behavior frozen and the M43 section active on this branch |
| **Build plan** | [M43_BUILD_PLAN.md](M43_BUILD_PLAN.md) |
| **Branch** | `m43`, created from shared-governance commit `620148c`; integration target `geo-agent-v1` |
| **Current milestone** | M43 — Resonance Web UI Refinement |
| **Milestone state** | In progress — Phases 0–4 green; Phase 5 dashboard and reports is in progress |
| **Next action** | Refine the audit dashboard pillars, evidence edge sheet, Simulation summary, report builder, and print view; keep the live browser on the active route and run evidence/report regressions |
| **Blocked on** | Nothing |
| **Parked product** | Public brand-site UI work remains out of scope on M43. The GEO agent is active in parallel, not parked, and is authoritative on its own milestone branches. |

## M43 phase ledger

| Phase | Scope | State |
|---|---|---|
| 0 | D-112 parallel governance and tracker-aware docs check | Green on `geo-agent-v1` at `620148c` |
| 1 | Activate plan, PRD, status/handoff, approved Apple skill, and baseline journey | Green at `173619b`; baseline 3/4 with one pre-existing assertion-shape failure recorded in `BUILD_NOTES.md` |
| 2 | Live demo and shared UI foundations | Green at `f879a07` + `8bbd95a`; 782 unit tests and 6/6 Playwright/axe green; interactive evidence in `BUILD_NOTES.md` S-100 |
| 3 | Projects, intake, hub, setup | Green at `3c3596a` + `afd6db4` + `fa3e70d`; 9/9 Playwright green and interactive evidence in `BUILD_NOTES.md` S-101 |
| 4 | Matrix and runs | Green at `52f292a` + `7851ae0`; 11/11 Playwright and focused matrix/run/UI tests green; interactive evidence in `BUILD_NOTES.md` S-102 |
| 5 | Dashboard and reports | In progress |
| 6 | Simulation and Framing Evidence | Not started |
| 7 | Integration reconciliation, full verification, and handoff | Not started |

## Non-negotiable stop lines

- No change to schemas, migrations, APIs, action payloads, measurement logic, costs, methodology, epistemic labels, or export payloads.
- No `site/**`, agent core/gateway/worker/provider/deployment work, live provider call, wallet action, or production database access.
- No merge from M35–M42 into M43 and no merge from M43 into a sibling milestone branch.
- Any discovered need for one of those changes pauses only that portion for operator review.
