# BUILD_NOTES.md - Session Working Memory

> Disposable mid-milestone state for agent handoff. This file answers "what was the last session doing?" — nothing else. Durable facts do not live here: decisions go to the `MASTER_CONTEXT.md` Decision Log, status goes to the `PRD.md` tracker, schema/contract facts go to the spec docs.

## Rules

1. **Append one entry per session**, as step one of the handoff ritual — or immediately whenever stopping mid-task or blocked.
2. **Disposable:** when a milestone merges, delete its entries. Anything still worth keeping must graduate to a canonical doc first; if it can't, it wasn't worth keeping.
3. **No restating:** never duplicate what a commit message, the PRD tracker, or the Decision Log already says. The unique value here is dead ends, unverified work, and the exact next action.

## Template

```
## S-<NNN> / <YYYY-MM-DD> / M<N>
GOAL: <one line: what this session set out to do>
DONE: <verified work, each with the command or check that proved it>
UNVERIFIED: <built but not yet proven; say what proof is missing>
REJECTED: <approach tried and abandoned + why, one line each>
NEXT: <the exact first action for the next session — command or file-level>
GOTCHAS: <environment quirks, surprising behavior, anything that cost >10 minutes>
```

Session numbers increment forever and never reset; omit empty fields except NEXT, which is mandatory.

---

## Entries

## S-084 / 2026-07-12 / Product pivot: Resonance GEO agent (D-106) — park M34A, architecture frozen, clean plate for build
GOAL: Operator-directed pivot session. Park the Resonance product at its shipped M34A state, redeploy the Evidence Layer as an autonomous crypto AI-perception audit agent sold on Virtuals ACP, and clear everything blocking the new build so implementation can start from a clean tree.
DONE: (1) Three rounds of plan review: an initial 10-day war-room draft (`AGENT_PIVOT_PLAN.md`, now superseded), an operator-submitted external plan critiqued and partially adopted/rejected, a second operator-submitted plan fact-checked against live Virtuals/Base/vendor sources and the repo (zero-evaluator auto-settlement confirmed in `acp-node-v2`'s `acpAgent.ts` source; two enum-migration traps documented from D-066/D-102 history flagged; the `representation`/`discovery` intents already shipped by M34A were pointed out as reusable, no new intent value needed), then a final operator ruling resolving 7 open disagreements (zero-evaluator kept, B+C lane pooling rejected, `discovery_category` reinstated as query-context-only, name/ticker masking algorithm specified, two-metric repeatability spec, redaction scoped to deterministic illegal-content categories only, commercial criteria split out of engineering acceptance). `AGENT_PRD.md` rewritten to the ruling as the frozen product contract (plain-language, MUST/NEVER rules, exact 20-prompt matrix, per-lane metric tables, migration-trap warnings — written for lower-capability implementing agents per operator instruction). `AGENT_STRATEGY_MEMO.md` split out to hold kill/scale criteria and GTM, explicitly non-binding on engineering gates. (2) Park ritual executed: `docs/audits/m34/v4-cal-report.md` (untracked M34 CAL-1/CAL-2 report) committed to `m34-baseline-framing`; MASTER_CONTEXT.md updated in place (new C-16 descriptive-only / C-17 hostile-buyer-input constraints in §4; D-106 recorded in §9) and committed; `m34-baseline-framing` merged into `main` (fast-forward, 27 commits, D-095 through D-106); tagged `resonance-m34a-parked` at the merge point; new branch `geo-agent-v1` cut from `main`; `AGENT_PIVOT_PLAN.md` (status flipped to SUPERSEDED, body preserved as pivot-rationale record), `AGENT_PRD.md`, and `AGENT_STRATEGY_MEMO.md` committed as the founding commit of the new branch.
UNVERIFIED: No code exists yet — this session is planning/canon/repo-state only. Everything in `AGENT_PRD.md` §13 (zero-evaluator settlement, contract addresses, graduation process numbers) is source-cited but MUST be re-verified live at Gate 0/Gate D per the plan's own discipline — third-party pricing aggregators and the whitepaper's reorganized doc tree were both proven unreliable during this session's fact-checking and must never be treated as canonical without a live check.
REJECTED: Deleting or archiving the Simulation Layer/M34A code (parked, not removed — C-12's walls make this free); an LLM extraction layer in v1 (mechanical lexicons only, M34 lesson); accepting buyer-supplied project facts in the serving path (adversarial-buyer misinformation-register poisoning risk); pooling natural/anchored representation lanes for one completeness gate (operator's final pushback — prompt-frame rule one level down); buyer self-evaluation as an ACP settlement fallback; folding commercial kill/scale criteria into engineering acceptance gates (operator's ruling #7 — moved to `AGENT_STRATEGY_MEMO.md`).
NEXT: Gate 0 (protocol feasibility) on `geo-agent-v1` per the reviewed 0→1 Virtuals ACP build plan: fresh seller/test-buyer wallets, prove `AcpAgent.start()` + ACP-only signer policy + zero-evaluator auto-settlement + funded-rejection/refund + permissionless expiry claim on hidden Base-mainnet $0.01 jobs, before writing any production ACP code. Do not start Gate A (headless product / grounded engine adapters) until Gate 0 passes live.
GOTCHAS: `discovery_category` MUST NEVER be written to `category_archetype` — they are different concepts on different tables (agent projects always use archetype `crypto_token`; `discovery_category` lives on the agent order row and only selects a Lane-A prompt pack). Postgres enum additions (`xai` on `provider_id`, `crypto_token` on `category_archetype`) each need their own migration statement with no same-transaction consumer, per the D-066/D-102 trap — this repo has been burned by this exact mistake twice already. `src/core/extraction.ts`'s `jaccardSimilarity()` returns `1` for empty/empty sets and MUST NOT be reused unchanged for the new `descriptor_repeatability` metric (empty/empty must be `not_estimable`).

## S-059..S-083 / 2026-07-09..2026-07-12 / M30-M34A: merged to main, entries truncated per Rule 2 (D-025)
GOAL: (retroactive) These 25 sessions covered M30 (whole-repo cleanup audit), M31 (project workspace hierarchy), M32 (operator workflow UI architecture), M33 (verification/focus-state/demo-readiness close-out), and M34/M34A (Baseline Framing Integrity, descoped to human-reviewed framing evidence across D-094-D-105). All five milestones are merged to `main` and marked Done in `PRD.md` §11.
DONE: Durable content already graduated to canonical homes and is not repeated here — Decision Log entries D-086 through D-105 in `MASTER_CONTEXT.md` §9 carry full rationale for every ruling; `PRD.md` §11 progress notes carry per-milestone summaries; `M32_BUILD_PLAN.md`, `M34_BUILD_PLAN.md`, `M34A_PRODUCTION_PLAN.md`, `M34A_ASSURANCE_PLAN.md`, and `docs/audits/m34/*.md` carry full execution/acceptance detail for their milestones.
NEXT: Nothing pending from M30-M34A. Current work is S-084 above (Resonance GEO agent pivot, `geo-agent-v1` branch).
GOTCHAS: This truncation follows the same precedent set at the M30 cleanup audit (D-086, `BUILD_NOTES.md`'s own Rule 2): entries for a merged milestone are deleted once their content has graduated elsewhere, keeping this file small and disposable rather than an unbounded log. That precedent was skipped for five consecutive milestone merges (M31-M34A never got pruned) before this pass restored it — future merges should prune in the same handoff-ritual step that merges the branch, not as a separate catch-up pass.
