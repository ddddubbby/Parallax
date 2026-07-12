> LIFECYCLE: ACTIVE · ROLE: CANON · OWNS: product contract for `resonance_geo_v1` — input schema, prompt matrix, extraction rules, metrics, exclusions · TRACKER: STATUS.md

# AGENT_PRD.md — Resonance GEO Agent (`resonance_geo_v1`)

> **STATUS: ARCHITECTURE FROZEN (conditional approval, 2026-07-12).** This document is the product source of truth for the autonomous agent offering. It is written for implementing agents: small steps, explicit MUST/NEVER rules, no implied context. `AGENT_BUILD_PLAN.md` owns HOW (milestones M35–M42, ACP gateway, wallet, Render); live milestone state lives in `STATUS.md`; this document owns WHAT. Commercial kill/scale criteria and GTM live in `AGENT_STRATEGY_MEMO.md`, not here. The Resonance product PRD (`PRD.md`) is parked, not replaced (D-106).

---

## 1. Product statement (plain language)

The buyer gives us a token's contract address. We ask three AI engines — OpenAI, Gemini, and Grok, each with live web search on — 20 fixed questions, 5 times each (300 answers total). We store every answer verbatim, count what appears in them using fixed word lists and literal matching, and deliver an immutable report with exact quotes.

The report answers six buyer questions:

1. Does AI even know my token exists?
2. When people ask about my token by name, does AI describe MY token — or a different one with the same name?
3. What words does AI use to describe my token?
4. Does AI attach warning language (scam, rug, unaudited…) to my name?
5. Which websites feed AI's view of my token?
6. Are AI's answers about me repeatable, or a coin flip?

We NEVER say whether a token is good, safe, legit, or worth buying. We measure what AI engines say and prove it with quotes.

- **Buyer:** other agents on Virtuals ACP (Base). Fully autonomous. No human touches an individual report.
- **Price:** $99 fixed (`99_000_000` micro-USDC). **SLA:** 90 minutes. One offering, no variants.

## 2. Input contract (what the buyer sends)

Six fields. JSON Schema with `additionalProperties: false`. Anything else → reject before budget.

| Field | Type | Allowed values | Purpose |
|---|---|---|---|
| `schema_version` | string const | `"1.0"` | Version pin |
| `asset_chain` | enum | `base` \| `ethereum` | Which chain the resolver reads |
| `contract_address` | string | `^0x[0-9a-fA-F]{40}$` | The ONLY identity anchor |
| `discovery_category` | enum | `meme_token` \| `ai_agent` \| `defi` \| `gaming` \| `rwa` \| `general_crypto` | Selects the Lane-A prompt pack. NOTHING else |
| `terms_version` | string const | `resonance-geo-terms-1.0` | Terms pin |
| `accept_terms` | boolean const | `true` | Autonomous terms acceptance |

**`discovery_category` rules (MUST follow all four):**
1. It MAY only select which Lane-A prompt pack runs.
2. It MUST NEVER participate in identity classification.
3. It MUST NEVER be presented as verified project metadata (report labels it "buyer-selected query context").
4. It MUST NEVER be written to `category_archetype`. Those are different concepts: agent projects always use archetype `crypto_token` (a new enum value); `discovery_category` lives on the agent order row.

**MUST NEVER accept:** project name, ticker, website, description, fact sheet, competitors, aliases, free text, attachments, custom prompts. Reason (learned M1–M34): buyer-supplied "facts" from an anonymous adversarial buyer become levers to make the report certify their marketing; free text is an injection surface. We verify NO claims in v1.

**Validation stack rule:** Zod is the application-side schema source; the published ACP JSON Schema is generated from it. The Virtuals SDK uses AJV internally — leave it alone. The rule is "no direct second validation stack in OUR code."

## 3. Identity resolution (before any money moves)

Steps, in order. Any failure → reject the ACP job before `setBudget`. Resolver failure is NEVER an evidence finding.

1. Normalize and checksum `contract_address`.
2. Verify the configured RPC's chain ID matches `asset_chain`.
3. Require non-empty contract bytecode.
4. Read `name()`, `symbol()`, `decimals()` — 5s timeouts, bounded response size, standard string decoding with `bytes32` fallback.
5. Require non-empty name and symbol. NFKC-normalize both.
6. Cap: name ≤ 64 chars, symbol ≤ 16 chars.
7. Reject if metadata contains control characters, bidi overrides, newlines, URL-like text, or any `prompt_control_v1` term.
8. Escape metadata independently for each sink: prompt text, JSON, logs, Markdown, HTML.

On-chain metadata is buyer-independent but still attacker-controlled — treat it as hostile input that happens to be canonical.

## 4. Prompt matrix (`crypto_geo_prompts_v1`, 20 cells)

Three lanes. Lane A never names the token (a mention there is earned, never planted). Lanes B/C name it deliberately (description is elicited, never inferred from silence). This is the audit engine's prompt-frame rule (D-054): **a metric never counts a signal its own prompt planted.**

Prompt design rules (all machine-enforced before freeze):

- **P1 — Zero shared instruction.** No "be honest," no "say if unsure," no system framing. (M34 v3 died on one shared sentence — D-097.) Bare questions only.
- **P2 — Buyer voice.** Phrased like real users type (D-052/D-085).
- **P3 — Lane A resolved prompts MUST NOT contain the token name or symbol.** Automated scan at job time (PM-9 pattern) — the name is attacker-controlled, so this check runs per job, not just at design time.
- **P4 — No prompt in ANY lane may contain any `risk_v1` term.** Design-time test, word-boundary matching.
- **P5 — Prompts are frozen and versioned.** Any text change = new prompt-matrix version = new offering version.

**Lane A — unbranded discovery (6 cells).** Interpolates `{chain}` and `{category_phrase}` only.

Category phrase mapping (deterministic, no other values):

| `discovery_category` | `{category_phrase}` |
|---|---|
| `meme_token` | meme tokens |
| `ai_agent` | AI agent tokens |
| `defi` | DeFi tokens |
| `gaming` | gaming tokens |
| `rwa` | real-world asset (RWA) tokens |
| `general_crypto` | tokens |

| # | Prompt |
|---|---|
| A1 | What are the most talked-about {category_phrase} on {chain} right now? |
| A2 | Which {category_phrase} on {chain} are worth knowing about? |
| A3 | I'm exploring {category_phrase} on {chain} — which ones come up the most? |
| A4 | What are the biggest {category_phrase} on {chain} by popularity? |
| A5 | Which {category_phrase} on {chain} are getting attention this year? |
| A6 | If someone wanted a shortlist of {category_phrase} on {chain}, what would be on it? |

**Lane B — natural representation (8 cells).** Interpolates `{name}`, `{ticker}` only — no chain, no contract. This is how real users ask; it measures description AND mistaken identity.

| # | Prompt |
|---|---|
| B1 | What is {name} ({ticker})? |
| B2 | What do you know about the {name} token? |
| B3 | How would you describe {name} ({ticker}) to someone new to crypto? |
| B4 | What is the {name} project about? |
| B5 | What's the story behind {ticker}? |
| B6 | What kind of project is {name}? |
| B7 | What is the {ticker} token used for? |
| B8 | What are people saying about {name} ({ticker}) lately? |

**Lane C — anchored representation (6 cells).** Adds `{chain}` + `{address}` so the engine cannot mean a different token. Probe lane for clean description.

| # | Prompt |
|---|---|
| C1 | What is {name} ({ticker}), the token at {address} on {chain}? |
| C2 | What do you know about the token deployed at {address} on {chain}? I believe it's {name}. |
| C3 | Describe {name} ({ticker}) on {chain} — contract {address}. |
| C4 | What is the project behind contract {address} on {chain}? It goes by {name} ({ticker}). |
| C5 | I'm looking at {ticker} at {address} on {chain}. What can you tell me about this token? |
| C6 | What information can you find on {name} ({ticker}), contract {address}, on {chain}? |

**Repo mapping:** Lane A cells use the existing `discovery` intent; Lanes B/C use the existing `representation` intent (shipped in migration 0013), distinguished by variant key. NO new intent enum value. 20 cells < the C-1 50-cell cap. Agent matrices are created directly in `approved` state (the D-064 resonance-compile precedent).

## 5. Sampling and engines

- Engines: OpenAI, Gemini (`google`), Grok (`xai` — new `provider_id` enum value, see §12). All grounded (live web search + citations). All three mandatory per job.
- Candidate models (cheapest grounded tiers; pin from official vendor pages, then confirm with measured billable M38 calls — third-party aggregators are never canonical): OpenAI `gpt-5.4-nano` family, Gemini `gemini-3.1-flash-lite`, xAI `grok-4.3`.
- k = 5 repeats per cell per engine (D-003: one answer is an anecdote, five is a sample).
- Per engine: 100 base calls, retry pool ≤25, ≤2 attempts per sample (transient 429/5xx/timeout only), hard max 125 calls/engine and 375/job, 45s provider timeout (repo default).
- Planned samples per engine: Lane A = 30, Lane B = 40, Lane C = 30.
- Engines are NEVER pooled in any metric (D-067/D-080: each engine is its own population).
- Refusal vs. absence: an engine *declining to answer* is a refusal — counted, reported separately, excluded from rate denominators (D-014). A grounded *"I can't find anything about this token"* is a real `absent` observation, NOT a refusal.
- A missing technical sample after retries exhausts → the job fails technically → reject/refund. Technical failure is never dressed as a finding (D-011).

## 6. Mechanical extraction (no LLM reads the answers)

No second model interprets output in v1. Fixed, versioned lexicons + literal matching. Why (M34's four dead protocol generations): a model interpreting model output smuggles judgment and injection into the numbers; grounded web text cannot prompt-inject a matcher that is not a model.

**Lexicons (checked in, versioned; changes = new version):**
- `risk_v1`: scam, rug, rug pull, fraud, honeypot, exploit, hacked, hack, phishing, malware, ponzi, manipulation, wash trading, unaudited, unverified, anonymous team, liquidity risk, contract risk, volatility, speculative.
- `descriptor_v1`: meme, community, utility, governance, defi, gaming, ai, infrastructure, payment, stablecoin, layer 1, layer 2.
- `prompt_control_v1`: ignore previous, system prompt, developer message, assistant message, tool call, reveal secret, http://, https://.
- `advice_prose_v1` (applies to OUR authored prose only, never to quoted evidence): buy, sell, price target, safe investment, good investment, guaranteed return, legitimacy score, trust score, scam score, risk score, bullish, bearish.

**Matching rules:** word-boundary and phrase-boundary matching with plural folding (the D-062 lesson: two-letter terms like "ai" must never match inside other words).

**Contamination control is metric-and-lane-specific (not one global rule):**

- **C-A:** Descriptor metrics are NEVER computed on Lane A (its prompts plant category words like "meme"/"AI"/"DeFi").
- **C-B:** Risk metrics may use any lane because P4 guarantees no prompt contains a risk term.
- **C-C — name/ticker masking (MUST implement exactly):** tokens named "SafeMoon", "RugRadio", or "AI Corp" would otherwise manufacture findings from their own name being repeated. Steps:
  1. On the ORIGINAL raw answer text, find all spans of the exact NFKC-normalized token name and all qualified-ticker forms (`$TICKER`, `(TICKER)`, ticker adjacent to the exact name).
  2. Make a working copy with each such span replaced by the same number of space characters (length-preserving, so all offsets stay identical).
  3. Run all descriptor/risk lexicon matching on the working copy.
  4. Store matched spans using offsets into the ORIGINAL text (identical by construction), with the original quoted span.

**Receipts:** every count links to `(response_id, start_offset, end_offset, quoted_text)` computed on the original stored answer. Reuse M34's primitives — SHA-256 hashing, offset verification, append-only records — but MUST NOT reuse or couple to the `framing_*` human-review tables (`framing_annotations`, `framing_evidence_snapshots`); those encode human-annotation semantics. The agent gets its own mechanical receipt tables sharing the same primitives.

## 7. Metrics (all per engine, never pooled)

Each metric block reports: numerator, denominator, Wilson 95% interval (proportions only, D-023), n, and a status: `estimable` (n ≥ 30), `directional` (1 ≤ n < 30, labeled per D-015), `not_estimable` (n = 0 or no qualifying pairs).

| # | Buyer question | Metric | Computed from | Notes |
|---|---|---|---|---|
| M1 | Does AI know I exist? | **Discovery Mention Rate** | Lane A only: % of answers naming the token (exact name, qualified ticker, or contract) | A mention here was never prompted |
| M2 | My token or an impostor? | **Identity Mix** | Lane B only: each answer classified `matched` / `namesake` / `ambiguous` / `absent` | Classifier in §8. Lane C is excluded — its prompts plant the answer |
| M3 | What does AI call me? | **Descriptor Profile** | Lane B matched answers and Lane C matched answers, **reported as two separate rate blocks — NEVER pooled** | A combined *quote index* (deduplicated exemplar quotes across B+C) is allowed; a pooled rate is not. Pooling would let the anchored lane conceal natural ambiguity |
| M4 | Warning language on my name? | **Risk-Language Rate** | Same lane separation as M3: Lane B matched and Lane C matched, separate blocks | Labeled: *counts words; does not judge the project*. Masking rule C-C applies |
| M5 | Who feeds AI's view of me? | **Citation Coverage + Source Domains** | All lanes, reported per lane | % answers with citations; ranked cited-domain table |
| M6a | Repeatable identity? | **`identity_repeatability`** | Lane B, within-cell: for each cell and engine, all unordered pairs of non-refusal samples (max 10 per cell); pair agrees iff same identity class; cell score = agreeing pairs / total pairs; engine score = mean over cells with ≥2 usable samples | Report pair counts and usable-cell counts. Point estimate, no interval |
| M6b | Repeatable description? | **`descriptor_repeatability`** | Lane B, within-cell: pairwise Jaccard of descriptor sets, ONLY pairs where both samples are identity-`matched` AND set union is non-empty | Empty/empty pairs are excluded, and zero qualifying pairs = `not_estimable` — NOT perfect consistency. MUST NOT reuse `jaccardSimilarity()` from `src/core/extraction.ts` unchanged: it returns `1` for empty/empty sets (line ~188). Write a separate helper |
| M7 | (always shown) | **Sample accounting** | All lanes | Planned vs. collected, refusals, errors, retries — honest denominators |

Neither M6 metric is the audit Stability Index (MT-7). Different computation, different name, never conflated (BF-13).

## 8. Identity classifier (mechanical, Lane A and B)

Classify each answer:

1. `matched` — the target contract address appears in the answer or its citations, OR the exact normalized name AND a qualified ticker appear together with exactly one matching chain/explorer reference and no conflicting contract.
2. `namesake` — the name/qualified ticker is tied to a different contract or only a different chain.
3. `ambiguous` — name/qualified ticker appears without enough chain/contract evidence, or signals conflict.
4. `absent` — no contract, exact name, or qualified ticker appears.

A qualified ticker is ONLY: `$TICKER`, `(TICKER)`, or the ticker adjacent to the exact project name. Never a bare short word.

## 9. Result and state model (commerce ≠ evidence)

These two state machines MUST stay separate:

**ACP job states (commerce):**
- `completed` — a valid report was delivered. Full stop. Sparse evidence does NOT prevent completion: a report proving "AI barely knows this token, here is the evidence of absence" is a valid paid deliverable.
- rejected/refunded — OUR side failed: provider outage, cost-cap breach, deadline breach, resolver failure, report-generation failure. Listed causes only.

**`representation_state` (evidence, inside the report and echoed informationally in the delivery envelope):**
- `estimable` — ≥1 engine has Lane-B `matched` n ≥ 30.
- `sparse` — some matched samples exist, but no engine reaches 30.
- `not_estimable` — zero matched samples on every engine.

The n ≥ 30 gate applies per metric per engine for statistical labeling. It is NEVER a payment or completion gate.

## 10. Evidence, redaction, and report

- Raw answers stored immutably (C-3); all metrics recomputable from them (C-5); report rendered from deterministic templates (D-033 — no LLM writes prose); published as immutable JSON with SHA-256 digest, 256-bit capability URL, ETag = digest, ≥365-day retention. Report links are durable but not confidential.
- **Attributed model opinions are findings, not advice.** "Bullish," "buy," "scam" quoted from an engine's answer stay in the report verbatim with attribution ("engine output, not our claim"). `advice_prose_v1` and the C-16 forbidden-phrase tests govern OUR authored prose only.
- **Redaction is a versioned, machine-testable policy (`redact_v1`) — every category is deterministic (D-109).** Exactly two categories: (a) **credential/secret patterns** — private keys, seed phrases, API-key formats, detected by regex + entropy rules; (b) **personal-data patterns** — email addresses, phone numbers, government-ID-shaped numbers, detected by pattern rules. Nothing else is redactable; "content illegal to redistribute" is NOT a machine category and does not exist in the policy. If an answer contains material outside machine-classifiable policy that automated safety signals flag (e.g. provider safety metadata), **the JOB fails closed: reject/refund, raw evidence preserved immutably for post-terminal incident review** — an individual report is NEVER paused for operator judgment. Every redaction retains source hash, offsets, policy code, and omission reason. Raw evidence stays immutable and access-controlled internally.
- Report includes: resolved identity + chain; methodology/model/prompt-matrix/lexicon versions; per-engine sample accounting; every metric block with n and status; evidence receipts; limitations; terms; retention; support contact; no-advice disclaimer; the statement that we verify neither ownership, affiliation, legitimacy, safety, nor investment merit.

## 11. Exclusions (MUST NEVER, enforced in code)

- No legitimacy/trust/safety/investment/price/trading judgment (C-16, test-enforced).
- No verification of any project claim; no misinformation register in the serving path.
- No sentiment inference or attribute interpretation beyond literal counted words.
- No competitor input; no comparison verdicts.
- No LLM reads model answers. No server-side fetching of cited URLs.
- No human in the serving path; no operator edit of any deliverable.
- No simulation: the Simulation Layer and M34A framing workflow stay parked behind their walls (C-12); nothing in the agent path imports them.
- No buyer self-evaluation fallback: production accepts ONLY the zero-address evaluator (see §13). If zero-evaluator settlement fails live verification, launch is blocked until Virtuals resolves it.

## 12. Migration rules (for the implementing agent)

1. Postgres enum additions (`xai` on `provider_id`, `crypto_token` on `category_archetype`) each get their own migration statement, and NO statement in the same batched transaction may consume the new value — Drizzle batches pending migrations into one transaction and PostgreSQL rejects direct use of a just-added enum value (this repo hit this twice: D-066, D-102; the `::text` comparison trick is the documented workaround where a CHECK needs the value).
2. Reuse `discovery` and `representation` intents; do NOT add intent values.
3. New agent tables (orders, order events, effects, deliverables, settlements, heartbeats/runtime control — per the build plan) are additive; agent orders link to existing runs. Never a parallel evidence engine.
4. All migrations forward-only; never destructively roll back evidence or commerce tables.

## 13. Commerce parameters (engineering-relevant only)

- Price fixed at `99_000_000` micro-USDC. Settlement: Base (8453), USDC.
- **Zero-evaluator settlement is documented and source-confirmed:** the SDK defaults `evaluatorAddress` to the zero address, and a successful `submit` auto-completes the job and releases funds (acpAgent.ts JSDoc). M35 still proves it live — contracts, SDKs, and signer relays drift. Graduation mode may allowlist ONLY the confirmed DevRel evaluator wallet; production never accepts arbitrary evaluators.
- Contract addresses (proxy, implementation, USDC) are EXPECTATIONS, not truths: every startup and readiness check reads and verifies chain ID, deployed code, proxy implementation, payment token, fee basis points, pause state, and expiry grace. Any mismatch fails readiness and freezes admissions.
- COGS: provisional expected ~$6.80/job, hard cap $9.00, re-pinned at M38 from measured billable calls. Escrow acceptance requires provider net ≥ 3× hard cap. Stop at cap: never shrink k, never drop an engine, never deliver partial — reject/refund.
- Graduation facts to plan around (re-verify at M42 against live docs): 10 successful sandbox transactions incl. 3 consecutive; automated evaluation for non-trading agents, ≤6 test cases per offering, 100% pass required; unused testing funds refunded; then ~5–10 business days of manual Virtuals review. The manual review is platform onboarding — it is NOT human verification inside our serving path.
- Legal gate: launch requires a *recorded* operator/legal risk acceptance OR written Virtuals clarification on the Developer Agreement's third-party/affiliation language. Silence is not approval; this is an operator decision, not a runtime check.

## 14. Statistics rules (inherited, unchanged)

k=5 (D-003) · Wilson on per-sample proportions only, labeled point estimates elsewhere (D-023) · n≥30 statistical labeling per metric per engine, directional below (D-015) · engines never pooled (D-080) · lanes B and C never pooled (prompt-frame rule, D-054) · raw immutable, metrics disposable (C-3/C-5) · mock engine first-class, never in live aggregates (C-9, D-016).

## 15. Resolved decisions (changelog for implementing agents)

| # | Question | Ruling |
|---|---|---|
| R1 | Zero-evaluator settlement | Documented + source-confirmed; Gate-0 live proof kept; NO buyer self-evaluation fallback ever |
| R2 | `category` input | Reinstated as `discovery_category`, closed enum, Lane-A pack selection only, four MUST-NEVER rules (§2) |
| R3 | B+C pooling for completeness | REJECTED — separate per-lane rates; quote index allowed; `representation_state` decoupled from ACP completion (§9) |
| R4 | Lane-A contamination | Fixed via metric-and-lane-specific rules + length-preserving name/ticker masking (§6 C-C) |
| R5 | Consistency metric | Two transparent point estimates (`identity_repeatability`, `descriptor_repeatability`); empty/empty = `not_estimable`; core `jaccardSimilarity` not reusable unchanged |
| R6 | Receipt suppression | Attributed model opinions (incl. financial language) always retained; deterministic `redact_v1` categories only |
| R7 | Validation stack | Zod source → generated JSON Schema; SDK's internal AJV untouched |
| R8 | Commercial kill/scale criteria | Moved to `AGENT_STRATEGY_MEMO.md`; engineering acceptance never gates on paid-job counts |
| R9 | Legal stop-line | Recorded operator risk acceptance or written clarification; silence ≠ approval |
| R10 | M34 reuse | Hashing/offset/append-only primitives yes; `framing_*` human-review tables no |

## 16. Roadmap (explicitly not v1)

Organic competitor view (tokens co-mentioned in Lane A become the comparison set — no buyer input) · Solana resolver · OKX AI listing · labeled, injection-hardened LLM-enrichment layer (never gating results) · category expansion · human-audit upsell for real projects.
