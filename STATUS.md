> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M56 cleanup pass, phase state, next action, and integration target · TRACKER: M56_BUILD_PLAN.md

# STATUS.md — M56 control plane

| Field | Value |
|---|---|
| **Active product** | Resonance operator web product — M56 whole-repo cleanup pass (D-126/D-127); no product behavior change |
| **Product contract** | [PRD.md](PRD.md) (requirements unchanged; drift annotations only) |
| **Build plan** | [M56_BUILD_PLAN.md](M56_BUILD_PLAN.md) |
| **Branch** | `m56`, cut from `main@5ba6e65` (the local merge of `m54`) |
| **Current milestone** | M56 — docs drift, repo noise, plan archival, zero-reference exports |
| **Milestone state** | P0 done; P1 in progress |
| **Next action** | P1 repo noise per `M56_BUILD_PLAN.md`, then P2 brand canon rewrite (D-127) |
| **Blocked on** | Pushing `main`/`m56` and opening the PR need GitHub credentials on this machine (no `gh`, credential helper points at a deleted temp binary) |
| **Integration order** | `m54` is already on local `main` (5ba6e65); `m56` merges to `main` after P5 |
| **Pending merge** | `m53` (D-123 sampling terminology, 343ab62, 8 behind main) stays unmerged by operator decision; trunk `PRD.md` has no §8.41 and `DECISIONS.md` no D-123 until it lands |
| **Parked product** | Resonance GEO agent remains parked (D-116); `AGENT_*` headers read PARKED from M56 P2 |

## M56 phase ledger

| Phase | Scope | State |
|---|---|---|
| P-1 | Merge `m54` (site source) into `main`; cut `m56` | Done (local; push pending) |
| P0 | D-126/D-127, STATUS, this plan, PROTECTED_REGISTER, audit register, baseline gates | Done |
| P1 | Repo noise: worktrees, stale branches, upload zip, `.gitkeep`, env var names | In progress |
| P2 | Brand canon rewrite (D-127); current-state docs synced to code | Pending |
| P3 | Archive eight merged plans to `docs/history/`; D-025 BUILD_NOTES truncation | Pending |
| P4 | Delete zero-reference exports DC-01..DC-24 | Pending |
| P5 | Closeout: gates, audit artifacts removed, handoff | Pending |

## Baseline evidence (main@5ba6e65)

- `pnpm lint --max-warnings 0`, `pnpm typecheck`, `pnpm docs:check` (27 governed root docs before the M56 plan, 28 after) green.
- Full Vitest: 915 passed / 12 skipped / 0 failed (125 files passed, 2 skipped).
- Playwright `test:e2e`: 18/18.

## Open follow-ups (not M56 scope)

- Hotel-case run date on the live site (31 Jul 2026, from S-123) should be confirmed against run `cffd5856` when the dev DB is up.
- `/studies` carries only the Insta360 study; the hotel and Leica tests are candidates for their own pages.
- Duplicate-helper merges and UI "Simulation runs/study pack" wording are recorded in D-126 as a future proposal.
