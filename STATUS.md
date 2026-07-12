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
| **Current milestone** | M40 — ACP gateway, **offline core** (§6.6). Transport hardening + VirtualsGatewayClient boundary + lifecycle orchestrator wired to M39's ledger, fixture-tested; pending merge. The real SDK/viem gateway + live sandbox verification (the merge gate) are wallet-gated |
| **Milestone state** | M40 offline core code-complete — SDK pinned; pure transport primitives (fingerprint/LRU-dedupe/reconnect/connection-state); gateway `ingestEvent` + `advanceOrder` drive M39's effectively-once ledger through the full lifecycle (created→budget→funded→submit→completed + expiry-refund) each effect exactly once, fixture-driven, under the per-order advisory lock. My M40 tests green (full suite 716 passed; the 9 failures are the pre-existing settings-test flake, task_a9867727) · M36+M37+M38+M39 merged. REAL VirtualsGatewayClient (AcpAgent/viem) + the live §6.6 gate (complete/reject/refund/expiry/restart on hidden $0.01 sandbox jobs, settlement ±$0.01) are wallet-gated (S-093) |
| **Next action** | Merge `m40` → `geo-agent-v1`. **Everything remaining is operator-gated on wallets or keys:** (1) OpenAI key in Settings → run `pnpm agent:live-validate … --confirm-spend` (M38 live); (2) Virtuals dev onboarding §5.1 (funded Base RPC, seller/test-buyer Privy wallets, restricted signer, hidden offering, funded buyer) → wire the real VirtualsGatewayClient + run the live M40 sandbox lifecycle + the M35 kill-gate; (3) Gemini/Grok keys → full M38 900-sample spike; (4) recorded legal risk-acceptance → launch prerequisite. The offline engineering (M36–M40 core) is done |
| **Blocked on** | Wallets: real M40 gateway wiring + live sandbox verification, M35 kill-gate, M41/M42. Keys: M38 live run (OpenAI), full spike (Gemini/Grok). Legal: launch. No offline-only engineering remains |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Merged to `geo-agent-v1` (S-089) |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Merged to `geo-agent-v1` (S-090) |
| M38 | Grounded engines live + spike (§6.4) | M37 | Merged to `geo-agent-v1` (S-092) — OpenAI slice; live run + full spike operator-blocked |
| M39 | Commerce persistence + effectively-once effects, offline (§6.5) | — | Merged to `geo-agent-v1` (S-091) |
| M40 | ACP gateway live in sandbox (§6.6) | M35, M38, M39 | Offline core code-complete (S-093), pending merge — real gateway + live verification wallet-gated |
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
