> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the single "where are we" answer — active product, branch, milestone state, next action · TRACKER: AGENT_BUILD_PLAN.md

# STATUS.md — active control plane

> Read this file first, every session (boot ritual §8). It is the only home for live status of the active product. Static milestone definitions live in `AGENT_BUILD_PLAN.md` §6; product contract in `AGENT_PRD.md`; rationale in `DECISIONS.md`. Update this file whenever milestone state or the next action changes (handoff ritual).

| Field | Value |
|---|---|
| **Active product** | Resonance GEO Agent (`resonance_geo_v1`) — autonomous crypto AI-perception audit on Virtuals ACP (D-106) |
| **Product contract** | [AGENT_PRD.md](AGENT_PRD.md) (architecture frozen 2026-07-12) |
| **Build plan** | [AGENT_BUILD_PLAN.md](AGENT_BUILD_PLAN.md) (M35–M42, D-108) |
| **Commercial criteria** | [AGENT_STRATEGY_MEMO.md](AGENT_STRATEGY_MEMO.md) (non-binding on engineering) |
| **Branch** | `m37` (cut from `geo-agent-v1`); M36 merged to `geo-agent-v1`; the M35 ACP harness lives on `m35` |
| **Current milestone** | M37 — mechanical extraction + metrics + report, $0. Complete: all §6.3 acceptance evidenced (S-090), pending merge to `geo-agent-v1`. M35 kill-gate operator-blocked in parallel |
| **Milestone state** | M37 Code complete — acceptance green (golden suite exact, M6b not_estimable, C-16 clean, report built from 300 stored responses; full suite 658 passed/0 failed; S-090) · pending merge · M36 merged · M39 unblocked next · M38 operator-blocked (live spend/credentials) · M35 operator-blocked |
| **Next action** | Merge `m37` → `geo-agent-v1`, then start M39 (commerce persistence + effectively-once effects, offline $0 — independent of M35, §6.5). M38 (grounded engines live) needs operator API credentials + ~$25 spend; M40+ need the M35 wallets. Operator in parallel: Virtuals dev onboarding (§5.1) to unblock M35, and provider API keys via Settings to unblock M38 |
| **Blocked on** | M38 needs operator API credentials + live spend; M35/M40+ need operator wallet setup. M39 is NOT blocked |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Merged to `geo-agent-v1` (S-089) |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Code complete — acceptance green (S-090), pending merge |
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
