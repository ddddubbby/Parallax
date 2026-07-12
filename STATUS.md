> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the single "where are we" answer — active product, branch, milestone state, next action · TRACKER: AGENT_BUILD_PLAN.md

# STATUS.md — active control plane

> Read this file first, every session (boot ritual §8). It is the only home for live status of the active product. Static milestone definitions live in `AGENT_BUILD_PLAN.md` §6; product contract in `AGENT_PRD.md`; rationale in `DECISIONS.md`. Update this file whenever milestone state or the next action changes (handoff ritual).

| Field | Value |
|---|---|
| **Active product** | Resonance GEO Agent (`resonance_geo_v1`) — autonomous crypto AI-perception audit on Virtuals ACP (D-106) |
| **Product contract** | [AGENT_PRD.md](AGENT_PRD.md) (architecture frozen 2026-07-12) |
| **Build plan** | [AGENT_BUILD_PLAN.md](AGENT_BUILD_PLAN.md) (M35–M42, D-108) |
| **Commercial criteria** | [AGENT_STRATEGY_MEMO.md](AGENT_STRATEGY_MEMO.md) (non-binding on engineering) |
| **Branch** | `geo-agent-v1` (cut from `main` at tag `resonance-m34a-parked`) |
| **Current milestone** | M36 — headless audit core, mock-first (unblocked, can start now) · M35 in parallel once wallets exist |
| **Milestone state** | M35 Not started (blocked on operator) · M36 Not started (unblocked) |
| **Next action** | Engineering: start M36 (enum migrations → resolver → matrix → mock e2e). Operator, in parallel: Virtuals dev onboarding — owner/login wallet, Provider + test-Requestor agents, Privy wallet + restricted signer (AGENT_BUILD_PLAN §5.1) to unblock M35 |
| **Blocked on** | M35 only: operator wallet/account setup. M36–M39 are NOT blocked |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Not started |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Not started |
| M38 | Grounded engines live + spike (§6.4) | M37 | Not started |
| M39 | Commerce persistence + effectively-once effects, offline (§6.5) | — | Not started |
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
