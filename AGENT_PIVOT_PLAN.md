# RESONANCE AGENT PIVOT — Strategy, Engineering & Deployment Plan

> **STATUS: SUPERSEDED (2026-07-12).** This was the war-room first draft. The product contract now lives in `AGENT_PRD.md` (architecture frozen, conditional approval); commercial criteria live in `AGENT_STRATEGY_MEMO.md`; the protocol/deployment build plan is the reviewed 0→1 Virtuals ACP plan. Kept for the pivot rationale record only — where this draft conflicts with those documents, they win. Body preserved unedited below.

---

## 0. The decision you're being asked to make

Park the Resonance product at M34A. Redeploy the Evidence Layer (the audit engine) as **Resonance** — a fully autonomous, grounded-only, no-verdict **AI-perception audit agent for crypto projects**, sold as a fixed-price service on **Virtuals ACP** and **OKX AI**, whose buyers are primarily other agents. Engines: **OpenAI, Gemini, Grok**, cheapest grounded-capable model on each. Ten days to soft launch.

This doc is the full rationale, engineering plan, and deployment plan for that decision.

---

## 1. Strategic rationale (why this, why now)

Three facts, each grounded in current market data, converge:

1. **AI is now the crypto due-diligence layer.** "Every investor researching a token asks an AI first" — ChatGPT/Perplexity/Grok assemble a project's reputation from Reddit/media, not its own site. The July 2026 *Crypto Trust Index* found AI engines don't stay neutral: they "answer with a verdict, recommend, hedge, or warn," and crypto-native brands "start from zero." The pain is real, current, and unowned.
2. **The venue finally fits the buyer.** Earlier GEO framings died on buyer-venue mismatch (brand marketers aren't on-chain). Crypto projects *are*. Virtuals ACP supports **API-only sellers** (register a service with request/deliverable schemas — no autonomous personality-agent required). OKX AI (launched 30 Jun 2026) offers **instant pay-per-call for standardized services**, stablecoin settlement, on-chain reputation. A fixed-price perception report is precisely a "standardized service."
3. **The moat survives the pivot.** GEO tooling is now crowded and funded (Profound raised $58.5M). Our differentiator is not "another visibility dashboard" — it's **evidence-grade rigor** (k=5 sampling, Wilson intervals, n≥30 gates, stability, immutable verbatim receipts) plus the one answer no competitor will ship: **"AI has no stable representation of you yet."** In an adversarial market full of vanity scores, measured honesty *is* the wedge.

**Why the Evidence Layer only:** the Simulation Layer is our long-term moat but the epistemically fragile, human-in-the-loop half (four M34 protocol generations proved its judgment can't be autonomously honest — D-094→D-099). Measuring what AI *actually says* has ground truth = the AI itself (§1). That is safe to automate. Simulating humans is not. We ship the safe half.

---

## 2. Product definition

**Brand:** Resonance (client-facing copy only). **Code identifiers stay `parallax`** — zero renames, same rule as D-063. Churn-free.

**Hard guardrails (new constraints, §8):**
- **C-16 — Descriptive only, no verdict.** The agent never emits a legitimacy score, trust rating, buy/sell signal, or price view. It reports measured distributions and verbatim evidence. Enforced by forbidden-phrase tests (the C-14/RB-5 pattern we already own), not by prompt hope. *The single feature meme launchers would pay most for is the one thing we refuse to build — deliberately, from line one.*
- **C-17 — Untrusted buyer input.** Every field a buyer submits is hostile by default: schema-validated, length-capped, escaped at every sink (D-040/D-045 patterns), rate-limited per buyer identity, never trusted as instruction.
- **Full autonomy.** No human in the serving path. Safe *because* reports are deterministic templates over computed metrics (D-033), not LLM prose — honesty is a code property, verified by tests, not a per-report review.

**The offer (SKUs):**

| SKU | Scope | Price *(indicative)* | COGS *(verify)* | Margin |
|---|---|---|---|---|
| **Presence Ping** | 3 cells × k=5, 1 engine — "does AI know you, and as what?" | $9.99 pay-per-call | ~$0.50–1 | ~90% |
| **Perception Snapshot** | ~16-cell crypto matrix × k=5 × 3 engines — mention/framing/attributes/claims + verbatim receipts + honest-sparse state + entity-confusion | $99 escrow | ~$8–12 | ~88–90% |
| **Perception Tracking** | Weekly Snapshot re-run + delta report | $249/mo | ~$35/mo | ~86% |

Margins are strong but **not** the near-100% of the DeepSeek mock economics — grounded search on premium engines carries a per-search fee *on top of* tokens (§6). That fee is the dominant COGS line and is projected into the cost guard before any job is accepted.

**No agent token in v1.** We sell services for stablecoins/$VIRTUAL. Tokenization is a separate capital decision, deliberately deferred — it decouples the honesty brand from speculation.

---

## 3. Entity disambiguation (same-name tokens)

The single hardest correctness problem, solved structurally:

- **Requirement schema demands canonical identity:** contract address + chain + ticker + official URL. **No contract address, no job.**
- Prompts still use name/ticker naturally — that's what real users type, so it's the real distribution we must measure.
- Extraction classifies every response against fact-sheet anchors (chain, category, launch era) as **ours / namesake / ambiguous** — the `entity_ambiguous` machinery salvaged directly from M34A.
- Wrong-entity responses are **excluded from perception denominators but reported** as **Entity Confusion Rate** — a headline finding, not a swept-under bug. *"61% of AI answers about '$PEPE' describe a different token"* is a paid deliverable.
- **Fail-closed:** confusion too high to measure cleanly → the report says exactly that. Never guess which entity the model meant.

---

## 4. What is kept, parked, and new — and the precise sense of "M1–M34 intact"

"Intact" does **not** mean "the Resonance product keeps running." It means the codebase is three strata with three fates:

| Stratum | Fate | Detail |
|---|---|---|
| **The engine** (M1–M15 core + all hardening) | **Reused as the serving path** | Providers, runner, worker, cost guards (C-1/C-2/D-039/D-050), extraction, metrics/analysis, report generation, evidence immutability (C-3/C-4/C-5), golden tests, archive. This *is* the product. 34 milestones of worker/cost/immutability bug-fixes (D-039/D-045/D-049/D-072) are exactly what you want under an autonomous paid API. |
| **The operator console** (intake, dashboard, M31/M32 nav, report editor, login) | **Repurposed as back office** | Not dead weight — it's how you QA a misbehaving job, drill evidence, inspect the run queue. Zero code changes; simply not in the autonomous path. |
| **Simulation Layer + M34A framing** | **Parked, zero carrying cost** | Walled off behind boundaries that already exist structurally (C-12's entire purpose). Unparking later = a branch checkout, not an excavation. |

**Repo strategy — park, don't fork:**
- Commit the untracked `docs/audits/m34/v4-cal-report.md`, merge `m34-baseline-framing` → `main` (D-102/D-103/D-104 are shipped work), tag **`resonance-m34a-parked`**.
- New third entrypoint in the **same repo**: `/src/agent-service` (ACP/OKX job listener + internal job API), on branch **`geo-agent-v1`**. C-7's module boundary already makes core→matrix→runner→extraction→analysis→report headless; the UI is bypassed, not deleted, so nothing in `PROTECTED_REGISTER.md` is touched. One mental model, shared Zod/Drizzle types, shared cost guards (D-001 verbatim).

**Yes — new PRD.** GTM, buyer, pricing, and threat model all changed; by this project's one-fact-one-home law that's a new product doc, not a rewrite:

| Doc | Action |
|---|---|
| `PRD.md` | Status header: *"Resonance product PRD — parked at M34A (D-106)."* Body untouched — it's the record of the parked product. |
| **`AGENT_PRD.md`** (new) | Identity, crypto segments + methodology, SKUs + schemas, **A-series milestones** (A1 headless serving · A2 crypto pack · A3 ACP/OKX integration · A4 launch — new letter, no collision with M-history), GTM, kill/scale criteria. |
| `MASTER_CONTEXT.md` | §1 → two-product identity (Resonance agent active / Resonance-Simulation parked). Log D-106. Add **C-16** (no-verdict) and **C-17** (untrusted buyer input). C-12–C-15 stay law, dormant with the layer they govern. |
| `ENGINEERING_SPEC.md` / `RENDER_DEPLOYMENT.md` | Additive: agent-service entrypoint; **ACP wallet private key** custody (a new C-11-class secret — encrypted at rest, never in source, operator-held). |

---

## 5. Crypto methodology (the real design work, ~1 day, lead-reviewed before any template is coded)

The D-052 lesson governs: wrong archetype = measuring a distribution no buyer ever sees. What transfers **unchanged**: k=5, Wilson, n≥30, stability, the prompt-frame rule (D-054), immutable evidence, refusal handling.

**Segment map (buyer + decision moment = what an archetype encodes):**

| Segment | Buyer | Decision moment | v1 disposition |
|---|---|---|---|
| Meme tokens | Retail speculator | "should I ape / is it a rug" | **`crypto_token` (new)** |
| Utility / DeFi tokens | Users + holders | protocol choice + exposure | `crypto_token`, `{category}` param |
| Infra (L1/L2, oracles) | Developers, institutions | "what do I build on" | v1.1 (adapt b2b) — also the human-audit upsell |
| Wallets / exchanges | Consumers | "safest for beginners" | v1.1 (adapt consumer_product) |

**v1 ships ONE new archetype, `crypto_token`,** parameterized by the existing `{category}` template variable ("meme coins on Solana" vs "DEX tokens" is a category string, not a new pack).

**Crypto-specific additions:**
- **Project fact sheet** (chain, contract, launch date, supply mechanics, audit reports, hack history) → makes the **Proof pillar lethal**: LLMs constantly get chain/supply/hack facts wrong, and our misinformation register + accuracy rate already ships. Nobody in GEO-for-crypto has this.
- **Two new descriptive metrics:** **Risk-Framing Rate** (how often AI attaches scam/risk language — measured, never a verdict) and **Entity-Confusion Rate** (§3).
- **Honest-sparse state** as a first-class result: "AI has no stable representation yet" is a deliverable, not a failure.
- **Frame rule intact:** "best memecoins right now" = unbranded discovery; "is $X legit" = branded objection, feeds no sentiment. D-054 transfers cleanly. `representation` prompts (M34's bare, non-steering set) carry over as the neutral description lane.

---

## 6. Engines — OpenAI, Gemini, Grok, cheapest grounded model each

**Grounded-only MVP. No ungrounded probe in v1** (simplify to one, per your call — the stale-narrative probe is logged as a deferred idea, not scope). DeepSeek is dropped by your choice despite being grounded-capable now.

**Model-selection principle:** we buy statistical validity through **repetition (k=5) + our own stats**, *not* through model size (D-003). So the per-call model is the **cheapest tier that (a) exposes a grounded web-search path with normalized citations and (b) returns parseable output** — never a frontier reasoning model.

| Engine | Grounded path | Target model *(pin at spike)* | Why |
|---|---|---|---|
| **OpenAI** | Responses API `web_search` tool, `url_citation` annotations | cheapest mini-tier model exposing `web_search` | Default assistant for Western retail |
| **Gemini** | Grounding with Google Search, `groundingMetadata` | cheapest Flash-tier grounded model | Closes the open RELEASE_CHECKLIST "Gemini caveat" here |
| **Grok** | xAI Live Search, source citations | cheapest grok fast/mini tier | Crypto-native, X-wired — highest signal for this niche |

**Cost reality:** grounded search adds a **per-search fee on top of tokens** on all three (~$10–35 / 1,000 searches range *(verify)*). A Snapshot ≈ 16 cells × k=5 × 3 engines ≈ 240 grounded calls + extraction → COGS ~$8–12. This fee **must** be in cost projection before job acceptance — the D-039/D-044 lesson ("grounded fees in the cap check") applies verbatim.

**Extraction:** one configured cheap JSON-capable engine for all runs (D-041 pattern), fixture-backed in mock/CI.

**C-10 gate, non-negotiable:** each engine's citation payload must normalize from an **official API path** — verified in the Day-2 spike on real tokens *before* any paid matrix runs on it. Junk citations → engine is out. Rule, not sentiment.

**n≥30 sizing note:** engines are never pooled (D-080), so each needs its own ≥30 eligible samples per reported aggregate. 16 cells × k=5 = 80/engine, split by frame → headline metrics clear 30; thin slices render directional-only (on-brand, D-015). Allocation validated at spike (the D-058 sample-budget concern, pre-applied).

---

## 7. Security & budget — key exploit surface and depletion

**LLM keys cannot be exploited via prompt injection because they never enter model context — structural, not filtered:**
- Keys encrypted at rest (C-11/D-021, AES-256-GCM, per-row nonce), decrypted **server-side only**, travel only in the `Authorization` header.
- Buyer input lands only in prompt **text** — a different channel entirely from credential handling.
- Base-URL override allowlist (D-040) blocks exfil-via-proxy. Keys never in logs, payloads, or deliverables (already enforced).

**Budget depletion (the autonomous-agent failure mode):**
- **Reserve-then-settle ledger** (D-100): a job is accepted only if **escrow ≥ projected cost × 3** *and* daily-budget headroom exists (D-050 preflight).
- Per-job hard cap + per-provider daily caps (C-2). On depletion the agent **stops accepting jobs** — never runs at a loss, never silently degrades k or coverage.
- Overspend bounded by provider concurrency × one call (D-039).

**ACP/OKX wallet key = revenue custody, separate secret from LLM keys:** minimal hot balance, operator sweeps to cold storage on a schedule. New C-11-class secret, encrypted at rest, **operator-held — I spec it, I never touch it.**

**Buyer-facing abuse controls:** per-identity rate limits, global distributed-abuse bucket (D-072 pattern), request schema hard-caps, idempotency on job IDs.

---

## 8. Ten-day plan

Three tracks. **ENG** = agent coding sessions. **OPS** = operator-only (wallets, accounts, funds — I cannot and will not do these). **GTM** = go-to-market.

| Day | ENG | OPS (operator) | GTM |
|---|---|---|---|
| **0** | Park ritual: commit cal-report, merge M34A→main, tag `resonance-m34a-parked`, write D-106 + BUILD_NOTES, cut `geo-agent-v1`. Draft `AGENT_PRD.md` + deliverable JSON schema | **Start now (review queues):** Virtuals ACP dev onboarding + agentic wallet; OKX AI developer signup | Lock SKUs/prices |
| **1** | Headless spike: programmatic project→matrix→run for a hardcoded token, mock engine, end-to-end | Fund test wallet | Positioning copy |
| **2** | **Engine spike (critical path):** build OpenAI + Gemini + Grok grounded adapters; verify normalized citations (C-10); pin cheapest model IDs + real per-cell cost | — | Requirement-schema copy (all fields untrusted) |
| **3** | `crypto_token` archetype (+ migration if archetype is a PG enum — check Day 1) + ~16-cell pack; **lead reviews methodology addendum before templates are coded** | — | Showcase token list (BTC → mid-cap → 3-day meme) |
| **4** | Snapshot formatter: JSON deliverable + hosted report; **honest-sparse state**; **C-16 no-verdict forbidden-phrase suite green**; entity-confusion + risk-framing metrics | — | — |
| **5** | **Gate: full sandbox e2e** — mock + all three live engines on 3 real tokens; fresh-meme case *must* render honest-sparse, not fabricated signal | — | Generate showcase reports from Day-5 runs |
| **6** | ACP Node SDK v2 integration: Service Registry, request/deliverable schemas, job lifecycle (job→run→poll→deliver), $0.01 sandbox test | Sandbox wallet approvals | Draft launch thread with real data |
| **7** | **First-ever production deploy to Render** (RELEASE_CHECKLIST gates) + OKX AI pay-per-call listing on same API | OKX listing approvals | KOL shortlist; comped codes |
| **8** | Hardening: injection tests on buyer input, payment-preflight, rate limits, timeout/reject path; Virtuals graduation submission (external review — buffer) | Graduation requirements | Publish "AI Perception Index" showcase thread |
| **9** | **Soft launch** both venues; monitor first live jobs | Confirm payout rails | Launch push; ecosystem channels; comped reports |
| **10** | Triage + fix; verify escrow→delivery→settlement on real paid jobs | — | Retro vs kill/scale criteria |

**External-dependency risk (honest):** ACP graduation and OKX listing reviews are not under our control. Fallback: launch on whichever clears first + a direct Stripe/API sales path for the same deliverable, so Day 9 happens regardless of queue timing.

---

## 9. Deployment plan

**Topology:** same `render.yaml` shape as today — Next web (back-office console) + worker + Postgres — **plus one new always-on `agent-service`** (ACP/OKX job listener). Shared DB, shared cost guards.

**Three genuinely new deployment facts (why Day 7 is its own day):**
1. **First production deploy, ever.** M1–M34 never shipped to Render. RELEASE_CHECKLIST gates apply for real: wait-for-CI, backup retention, `/health` DB-readiness check (not liveness-only, per D-092), keys via Settings UI, mock→live validation ladder.
2. **Public paid API surface.** Previously one trusted operator; now untrusted external agents. C-17 envelope, rate limits, and payment-preflight are load-bearing, not nice-to-have.
3. **Wallet-key custody.** The ACP SDK holds a private key at runtime. Encrypted at rest, minimal hot balance, operator sweep. Never in source/logs (C-11 discipline extended).

**Secrets:** LLM keys via authenticated Settings (C-11, unchanged). `CREDENTIALS_ENCRYPTION_KEY` env group never deleted/recreated (D-021). Wallet key = new operator-entered encrypted secret.

**Worker drain:** SIGTERM drains in-flight paid calls against a deadline before exit (D-092 pre-deploy gate) — an autonomous agent must not abandon a billed job on redeploy.

**Observability:** `reportError` seam exists (D-076); Sentry still not wired (deferred, D-092) — acceptable for soft launch, flagged for scale.

---

## 10. Risks & mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Grounded adapters (OpenAI/Gemini/Grok) are net-new and unbuilt | **High** | Day-2 critical path; C-10 gate; mock fallback keeps pipeline testable if one engine slips |
| ACP graduation / OKX listing review delay | High | Fallback direct-sales path; launch on first venue to clear |
| Fresh tokens have no measurable AI presence | Medium | Honest-sparse state is a *feature*, not a failure — priced accordingly |
| Drift toward emitting a verdict (buyer pressure) | **High/existential** | C-16 hard-coded + forbidden-phrase tests from Day 4; refund-not-comply is policy |
| Adversarial buyer input | Medium | C-17 envelope; injection tests Day 8 |
| Budget depletion / loss-making jobs | Medium | Reserve×3 + daily caps; stop-accepting-jobs on depletion |
| Reputational: a report screenshotted to shill a rug | Medium | No-verdict output is not shill-able; descriptive-only framing on every deliverable |

---

## 11. Kill / scale criteria (set now, before emotion)

- **Scale** if by Day 30: ≥25 paid Snapshots **or** ≥1 tracking cohort **or** ≥2 qualified B2B human-audit leads.
- **Kill/park** if <10 paid jobs **and** zero B2B leads by Day 30 → fold `crypto_token` back in as an Evidence-Layer archetype (nothing wasted), unpark Resonance-Simulation.
- **Hard line:** the day a buyer's payment depends on us emitting a verdict, we **refund, not comply.**

---

## 12. Decisions I need from you before Day 0

1. **Approve the park + branch** (`resonance-m34a-parked` tag, `geo-agent-v1` branch, D-106) — go/no-go.
2. **SKU prices** — accept $9.99 / $99 / $249, or adjust.
3. **Snapshot matrix size** — ~16 cells confirmed, or tighter for cost/latency? (drives per-engine n≥30).
4. **`AGENT_PRD.md` first** vs. straight to Day-1 spike — which do you want in front of you first?
5. **New-doc location** — this file as the working draft, or promote to `AGENT_PRD.md` immediately on approval?

On your go, Day 0 executes exactly as written in §8.
