> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the single "where are we" answer — active product, branch, milestone state, next action · TRACKER: AGENT_BUILD_PLAN.md

# STATUS.md — active control plane

> Read this file first, every session (boot ritual §8). It is the only home for live status of the active product. Static milestone definitions live in `AGENT_BUILD_PLAN.md` §6; product contract in `AGENT_PRD.md`; rationale in `DECISIONS.md`. Update this file whenever milestone state or the next action changes (handoff ritual).

| Field | Value |
|---|---|
| **Active product** | Resonance GEO Agent (`resonance_geo_v1`) — autonomous crypto AI-perception audit on Virtuals ACP (D-106) |
| **Product contract** | [AGENT_PRD.md](AGENT_PRD.md) (architecture frozen 2026-07-12) |
| **Build plan** | [AGENT_BUILD_PLAN.md](AGENT_BUILD_PLAN.md) (M35–M42, D-108) |
| **Commercial criteria** | [AGENT_STRATEGY_MEMO.md](AGENT_STRATEGY_MEMO.md) (non-binding on engineering) |
| **Branch** | `m40` (cut from `geo-agent-v1`); M36 + M37 + M38 + M39 merged to `geo-agent-v1`; the M35 ACP harness lives on `m35` |
| **Current milestone** | M40 — ACP gateway (§6.6), **in progress**. Offline core (transport + boundary + orchestrator) merged; the S-095 lead review found the "offline engineering done" claim premature — a serving-path completion pass is underway on `m40` (buyer input schema/C-17, redact_v1, deliverable envelope + capability report endpoint, admission preflight, offering manifest, M39 matrix completion, agent extraction-skip) |
| **Milestone state** | M40 In progress — offline core + S-095 serving path merged (input schema/C-17, redact_v1, envelope + capability endpoint + migration 0018, admission math, manifest, M39 matrix completion, §11 extraction skip; full suite 780/0, 4/4 consecutive after two test-pollution fixes). Live §6.6 merge gate (complete/reject/refund/expiry/restart on hidden $0.01 sandbox jobs, settlement ±$0.01) remains wallet-gated · OPEN OPERATOR DECISION: launch engine scope — AGENT_PRD §5 mandates three engines per job, MVP direction is OpenAI-only; hold the 3-engine contract (recommended) or amend the offering — blocks M42, not current work |
| **Next action** | Operator: (1) OpenAI key in Settings → `pnpm agent:live-validate … --confirm-spend` (M38 live); (2) acp-cli onboarding (§5.1: `acp agent create`/`add-signer` → walletAddress/walletId/signerPrivateKey, fund test buyer) → M35 kill-gate proofs (STOP-LINE: signer relay failure halts the ACP track, register A1), then engineering wires the real VirtualsGatewayClient + gateway loop from the now-complete parts and runs the live M40 gate; (3) rule on launch engine scope; (4) recorded legal risk-acceptance → launch prerequisite |
| **Blocked on** | Wallets: M35 kill-gate (0/10 — the existential risk, register A1), real gateway wiring + loop, live M40 gate, M41/M42. Keys: M38 live run (OpenAI), full spike (Gemini/Grok). Operator ruling: launch engine scope. Legal: launch |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Merged to `geo-agent-v1` (S-089) |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Merged to `geo-agent-v1` (S-090) |
| M38 | Grounded engines live + spike (§6.4) | M37 | In progress — OpenAI slice merged (S-092); §6.4 acceptance (900-sample 3-engine spike) NOT met, operator-blocked (keys + spend) |
| M39 | Commerce persistence + effectively-once effects, offline (§6.5) | — | Merged (S-091) — S-095 review: `during_reconcile` cell + committed matrix artifact owed; closing in the current pass |
| M40 | ACP gateway live in sandbox (§6.6) | M35, M38, M39 | In progress — offline core merged (S-093); serving-path pass active (S-095); live §6.6 gate wallet-gated |
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
