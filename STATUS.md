> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the single "where are we" answer — active product, branch, milestone state, next action · TRACKER: AGENT_BUILD_PLAN.md

# STATUS.md — active control plane

> Read this file first, every session (boot ritual §8). It is the only home for live status of the active product. Static milestone definitions live in `AGENT_BUILD_PLAN.md` §6; product contract in `AGENT_PRD.md`; rationale in `DECISIONS.md`. Update this file whenever milestone state or the next action changes (handoff ritual).

| Field | Value |
|---|---|
| **Active product** | Resonance GEO Agent (`resonance_geo_v1`) — autonomous crypto AI-perception audit on Virtuals ACP (D-106) |
| **Product contract** | [AGENT_PRD.md](AGENT_PRD.md) (architecture frozen 2026-07-12) |
| **Build plan** | [AGENT_BUILD_PLAN.md](AGENT_BUILD_PLAN.md) (M35–M42, D-108) |
| **Commercial criteria** | [AGENT_STRATEGY_MEMO.md](AGENT_STRATEGY_MEMO.md) (non-binding on engineering) |
| **Branch** | `m38` (cut from `geo-agent-v1`); M36 + M37 + M39 merged to `geo-agent-v1`; the M35 ACP harness lives on `m35` |
| **Current milestone** | M38 — grounded engines live, **OpenAI-only slice** (§6.4). Code path built + offline-tested; pending merge. The live run + the full 900-sample three-engine spike are operator-blocked (OpenAI key + spend; Gemini/Grok keys) |
| **Milestone state** | M38 OpenAI slice code-complete — viem live RPC reader (bytes32 fallback), OpenAI-only `live_validation` run path, `pnpm agent:live-validate` harness (credential+spend gated, C-10 grounding check); offline tests green, full suite 712 passed/0 failed (S-092). AWAITING operator OpenAI key in Settings to run the live validation. Gemini/Grok unwired → full 3-engine 900-sample spike deferred · M36+M37+M39 merged · M40 needs the m35 ACP SDK pin + wallets |
| **Next action** | Merge `m38` → `geo-agent-v1`. **Operator to run the live OpenAI validation:** enter an OpenAI key in Settings (C-11 — never on the CLI), then `pnpm agent:live-validate --chain base --address 0x… --category ai_agent --name "…" --symbol … --k 2 --cap 3.00 --confirm-spend` (or set BASE_RPC_URL to resolve identity live). Next engineering milestone is M40 (ACP gateway) — needs the m35 `@virtuals-protocol/acp-node-v2` pin merged in + the operator wallets (funded Base RPC, seller/test-buyer Privy wallets, restricted signer, hidden offering). For the full M38 spike, operator adds Gemini + Grok keys |
| **Blocked on** | M38 live run: operator OpenAI key + `--confirm-spend`. Full M38 spike: Gemini/Grok keys. M40+: operator wallets + the ACP SDK pin. M35: operator wallets |
| **Parked product** | Resonance audit + Simulation Layer + M34A framing — parked at tag `resonance-m34a-parked` (D-106); PRD: [PRD.md](PRD.md); unparking = branch checkout |

## Milestone ledger (M-counter continues from the parked track's M34A — D-108)

| M | Goal (static definition) | Depends on | State |
|---|---|---|---|
| M35 | ACP protocol feasibility — kill-gate (AGENT_BUILD_PLAN §6.1) | Operator wallet setup | Not started |
| M36 | Headless audit core, mock-first, $0 (§6.2) | — | Merged to `geo-agent-v1` (S-089) |
| M37 | Mechanical extraction + metrics + report, $0 (§6.3) | M36 | Merged to `geo-agent-v1` (S-090) |
| M38 | Grounded engines live + spike (§6.4) | M37 | OpenAI slice code-complete (S-092), pending merge — live run + full 3-engine spike operator-blocked |
| M39 | Commerce persistence + effectively-once effects, offline (§6.5) | — | Merged to `geo-agent-v1` (S-091) |
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
