> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M44 product, milestone state, next action, and integration target · TRACKER: M44_BUILD_PLAN.md

# STATUS.md — M44 control plane

> Read this file first in the `m44` worktree. It describes only this branch (D-112). The GEO agent's branches, commits, and `main`'s trunk STATUS remain authoritative for agent work; their live state is not mirrored here.

| Field | Value |
|---|---|
| **Active product** | Resonance authenticated operator web product — D-114 methodology simplification (See → Pick → Rewrite → Test) + guided operator path |
| **Product contract** | [PRD.md](PRD.md) §8.34 (M44 section active on this branch; audit measurement remains frozen) |
| **Build plan** | [M44_BUILD_PLAN.md](M44_BUILD_PLAN.md) |
| **Branch** | `m44`, cut from `main` at `2e1785c` (post-M43 merge); integration target `main` (D-113) |
| **Current milestone** | M44 — methodology simplification + guided path |
| **Milestone state** | In progress — P0 (governance: D-114, C-15 rewrite, register supersession pass, PRD §8.34, this plan) complete this session; P1 (guided path) next |
| **Next action** | Implement P1: `/src/core/guidance.ts` derivation map + unit tests, hub NEXT STEP card, empty-state wiring, library hints, journey rail; then e2e fresh-project walk |
| **Blocked on** | Nothing — P1/P2 are $0 and mock-safe. P4 (blind extractor) needs an extraction-capable provider key only at live-validation time |
| **Parked product** | None parked by this branch. The GEO agent is active in parallel on its own branches (trunk STATUS on `main` is authoritative); the codebook-era Framing Evidence workflow retires to read-only historical per D-114 |

## M44 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Governance: D-114 + register edges, C-15/glossary, PROTECTED_REGISTER pass, PRD §8.34, plan, STATUS | Complete this session (docs:check green) |
| P1 | Guided path over existing flow (`guidance.ts`, hub card, empty states, rail) | Not started |
| P2 | Baseline picker v1 (attribute themes, auto-stamp, approval-gate simplification; migration if columns needed) | Not started |
| P3 | Framing workflow retirement to read-only historical | Not started |
| P4 | Blind framing extractor + embedding clustering (themes v2) | Not started |
| P5 | Report integration, forbidden-phrase tests, full verification | Not started |
