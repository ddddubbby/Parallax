> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the single "where are we" answer — active product, branch, milestone state, next action · TRACKER: AGENT_BUILD_PLAN.md

# STATUS.md — active control plane

> Read this file first, every session (boot ritual §8). It is the only home for live status of the active product. Static milestone definitions live in `AGENT_BUILD_PLAN.md` §6; product contract in `AGENT_PRD.md`; rationale in `DECISIONS.md`. Update this file whenever milestone state or the next action changes (handoff ritual).

| Field | Value |
|---|---|
| **Active product** | Resonance GEO Agent (`resonance_geo_v1`) — autonomous crypto AI-perception audit on Virtuals ACP (D-106) |
| **Product contract** | [AGENT_PRD.md](AGENT_PRD.md) (architecture frozen 2026-07-12) |
| **Build plan** | [AGENT_BUILD_PLAN.md](AGENT_BUILD_PLAN.md) (M35–M42, D-108) |
| **Commercial criteria** | [AGENT_STRATEGY_MEMO.md](AGENT_STRATEGY_MEMO.md) (non-binding on engineering) |
| **Branch** | `m39` (cut from `geo-agent-v1`); M36 + M37 merged to `geo-agent-v1`; the M35 ACP harness lives on `m35` |
| **Current milestone** | M39 — commerce persistence + effectively-once effects, offline $0 (§6.5). IN PROGRESS: Phase 1 (schema migration 0017) landed + verified; the ledger/state-machine/crash-matrix bulk remains (S-091). M35/M38 operator-blocked in parallel |
| **Milestone state** | M39 In progress — Phase 1 done (migration 0017 additive §4.3 tables + enums, verified fresh+existing DB). REMAINING: repositories, order state machine (§9), effectively-once effects ledger (§4.5), the enumerated transition/effect matrix (§6.5 merge gate), gateway leadership + advisory locks · M36+M37 merged · M38 operator-blocked (live spend/credentials) · M35 operator-blocked |
| **Next action** | Continue M39 Phase 2+: agent-order/effect repositories → order state machine → effectively-once effects ledger → the enumerated crash/injection/dual-instance matrix (zero duplicate external effects across every cell) → leadership/advisory locks. Then M39 merges. Operator in parallel: provider API keys via Settings (unblocks M38) + Virtuals dev onboarding §5.1 (unblocks M35/M40) |
| **Blocked on** | M38 needs operator API credentials + live spend; M35/M40+ need operator wallet setup. M39 (the current work) is NOT blocked |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Merged to `geo-agent-v1` (S-089) |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Merged to `geo-agent-v1` (S-090) |
| M38 | Grounded engines live + spike (§6.4) | M37 | Not started — operator-blocked (API keys + ~$25 spend) |
| M39 | Commerce persistence + effectively-once effects, offline (§6.5) | — | In progress — Phase 1 (schema 0017) done (S-091) |
| M40 | ACP gateway live in sandbox (§6.6) | M35, M38, M39 | Not started |
| M41 | Deploy & operations + soak (§6.7) | M40 | Not started |
| M42 | Production readiness — engineering completion (§6.8) | M41 | Not started |

## Launch prerequisites (external — never merge-gating, D-109)

Tracked separately from the milestone ledger so a third party's non-response can delay launch but never make engineering appear incomplete.

| Prerequisite | Register | State |
|---|---|---|
| Recorded operator/legal risk acceptance OR written Virtuals clarification (Developer Agreement) | A10 | Not started |
| Butler proven to preserve zero-evaluator jobs | A9 | Not started |
| Written DevRel confirmation on production-price review behavior | — | Not started |
| DevRel evaluator tests passed (allowlisted wallet, 100% automated) | A8 | Not started |
| Virtuals manual review → Shown visibility | A8 | Not started |
| Paid canary settled + reconciled (flips product to operating) | — | Not started |
