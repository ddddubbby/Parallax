> LIFECYCLE: ACTIVE · ROLE: CANON · OWNS: identity, hard constraints, session rituals, documents index · TRACKER: STATUS.md

# MASTER_CONTEXT.md - Resonance (Parallax engine)

> The single canonical context file for this repository. Every AI coding session and every human contributor starts here. It contains project identity, non-negotiable constraints, durable decisions, and session rituals. Resonance is the product; Parallax is the measurement engine and the repo/package/code name (D-063). Product scope lives in `PRD.md`; implementation rules live in `DEVELOPMENT_GUIDELINES.md`.

---

## 0. How to use this file

1. Read this file fully at session start. Then read the document relevant to the task.
2. Docs beat chat memory. If a conversation contradicts these documents, the documents win until the change is explicitly agreed and written into the Decision Log.
3. One fact, one home. Identity, constraints, decisions, and rituals live here. What to build lives in `PRD.md`. How to build lives in `DEVELOPMENT_GUIDELINES.md`.

---

## 1. What this product is

Resonance is the product umbrella (D-063): an internal, operator-facing web tool organized around two named epistemic layers (D-077) — the Evidence Layer and the Simulation Layer. The Evidence Layer — Parallax, everything built M0-M15 — audits how AI systems describe, rank, recommend, cite, and misrepresent brands: curated prompt matrix across LLM provider APIs with repeated sampling, structured extraction from stored raw answers, claim verification against a client fact sheet, and an editable audit report. Within the Evidence Layer, the Four P pillars (Presence, Position, Perception, Proof) organize the audit's client-facing questions, with Proof as the trust rail under the other three. The Simulation Layer — M16+ — takes measured AI framing as stimulus and simulates, via persona-conditioned synthetic panels scored with Semantic Similarity Rating (SSR, D-064), how buyer segments respond to that framing and to candidate fixes. This two-layer split is a presentation layer over the existing pillar/intent taxonomy, never a data restructure.

Measurement and simulation have different epistemic status and never mix (C-12). The measurement engine's ground truth is the AI itself; the simulation layer is a validated-but-bounded proxy for humans and speaks only in comparisons (C-14).

It is used by one operator, usually a consultant, to produce paid client audits and simulation studies. Through the internal PoC (M20) it is not a SaaS product: the existing shared-password login stays (it guards spendable API credentials, C-11/D-024), and there are no client logins, no multi-user roles, no billing, no marketing pages, and no white-label theming. The end client only receives exported reports and evidence packs.

## 2. Why it exists

AI assistants have become decision intermediaries between brands and buyers. Consultants sell "how does AI see your brand" audits at roughly $3k-$15k. Parallax's differentiator is statistical honesty: LLM outputs are probabilistic, so audit prompts are sampled repeatedly and metrics ship with confidence intervals plus stability signals. Never build features or write copy that promise guaranteed AI rankings. The product measures distributions, verifies claims, and preserves evidence.

## 3. Methodology in one screen

- A prompt cell is one resolved prompt: intent x persona x market x phrasing variant.
- Each audit-grade cell runs k=5 repetitions per selected engine-mode. Validation mini-runs may use k=2 and must be labeled validation-only.
- Metrics are rates or averages over samples and are reported with Wilson confidence intervals where applicable.
- Mock is provider #0 and remains permanently registered for tests, demos, and failure injection.
- The first live dry-run provider is DeepSeek, because its official API is OpenAI/Anthropic-compatible and currently offers low-cost text generation. MiniMax is the second candidate provider after account/API-key details are confirmed.
- The long-term target provider set remains OpenAI, Anthropic, Gemini, and Perplexity, added later through the same provider interface.
- Grounded means the provider/API path supplies web-grounded output with normalized citations. If a provider cannot supply citations, its runs are ungrounded live validation runs and must not be mixed into grounded aggregates.
- Metrics: Mention Rate, Organic Recommendation Rate, Comparative Win Rate, Share of Voice, Avg First Position, sentiment (organic/solicited, never pooled), attribute-association matrix, citation share, accuracy rate, and Stability Index. The prompt-frame rule (D-054, PRD MT-12) governs all of them: a metric never counts a signal the prompt itself planted — presence rates count only unbranded prompts, comparative wins only head-to-head prompts, and objection cells feed no sentiment.
- Checkable claims about the client brand are matched against the client fact sheet and reviewed in the misinformation register.
- Aggregate findings and metric claims render only where n >= 30 eligible samples. Cell-level findings (for example lost-shortlist) are exempt from the threshold but always carry a directional-only label, as do low-stability clusters. Eligible samples are defined in `DEVELOPMENT_GUIDELINES.md` E2.
- Simulation (Simulation Layer, M16+): a resonance study cell is panel-persona x stimulus variant; free-text reactions are elicited (never numeric ratings), scored into 5-point Likert PMFs by embedding similarity against versioned anchor statement sets (SSR, arXiv:2510.08338), and reported as per-variant distributions, point-estimate means (no invented intervals, D-023), and deltas vs a baseline stimulus. The n >= 30 gate applies to variant aggregates; persona slices are always directional-only. Simulated metrics live under `resonance_*` scopes and never enter audit aggregates (C-12).

## 4. Hard constraints - never violate

| ID | Constraint |
|---|---|
| C-1 | A run processes at most 50 prompt cells. Enforced at matrix approval, run creation, and in the worker. Default audit matrix: 40 cells, bottom-funnel weighted. k=5 is protected for audit-grade runs; cut coverage before repetitions. |
| C-2 | Three nested cost guards: C-1 structural cap, per-run dollar cap, and per-provider daily budgets. The guards cover all paid LLM calls — generation and extraction alike (D-022). |
| C-3 | Raw responses are immutable. Re-extraction creates new versioned extraction rows. Every reported number traces to stored raw text. |
| C-4 | Approved matrices are frozen. Edits create a new matrix version. Runs reference exactly what was sent. |
| C-5 | Metrics are disposable: pure functions over extractions, recomputable idempotently. |
| C-6 | Schema changes happen only via migration files in git. Database dashboards are read-only for inspection. |
| C-7 | Modules communicate only through the database and typed interfaces. The UI never imports providers. `/src/core` imports nothing from other project layers. |
| C-8 | Never scrape consumer chat UIs. Official APIs and SERP/API vendors only. Permanent rule, not a deferral. |
| C-9 | Mock runs are first-class but always flagged (`run_mode: mock`, MOCK badge) and never mixed into live aggregates. |
| C-10 | Provider grounding capability is explicit. Grounded runs are blocked for providers that cannot return citations through an approved API path. |
| C-11 | LLM provider API keys are never stored in source files, `.env.example`, `render.yaml`, fixtures, logs, or client-visible payloads. The operator enters them in the authenticated Settings UI; the server encrypts them at rest and only the server/worker can decrypt them. |
| C-12 | Measured and simulated data never mix. Resonance (simulation) rows are structurally separated (matrix `kind`, `resonance_*` metric scopes, run-scoped report sections); audit aggregates, charts, and reports never include simulated samples and vice versa; every simulation surface renders a SIMULATED badge. Enforced by recompute dispatch plus wall tests (same isolation discipline as C-9). |
| C-13 | Simulations are evidence-conditioned: at approval, a study's `measured_ai` stimulus must cite stored raw response ids from the same project — no toggle can bypass this (D-078 removed the operator "unconditioned" toggle entirely). GENERIC is now a historical-only label, rendered truthfully on studies approved before D-078 but unreachable for any new approval. |
| C-14 | Simulation claims are comparative only: rankings and deltas between stimulus variants. Never absolute purchase-intent promises, never sales/ROI predictions, never quoting the SSR paper's accuracy as our own. ΔPI is a Likert-scale survey-construct shift, never framed as purchase probability. Panel persona conditioning: age and income band are the paper-validated axes; location and behavioral profile are prompt context only, never presented as validated segmentation (D-066); no gender/ethnicity conditioning. Enforced in template copy by forbidden-phrase tests (RB-5 pattern). |
| C-15 | Simulation baseline provenance & disclosure (M34A, D-099 — supersedes the D-094 eligibility-certification form; D-096's shadow rollout of that form is moot). A measured Simulation baseline is a **verbatim stored response** linked to >=1 reviewed framing annotation from a locked, versioned codebook. At handoff the stimulus record **immutably snapshots**: codebook version, coding-run version, numerator/denominator, prompt spread, model/mode scope, and review method — and these render wherever the simulation result renders (recurrence figures can change on recode; the simulation retains the evidence state it was commissioned on). Low-recurrence baselines are usable but must carry accurate labels (e.g. `SINGLE OBSERVED INSTANCE`), never "recurring framing." Structural gates enforced in code: raw response exists; exact offset-verified span exists; denominator complete; codebook locked before counting; intended positioning revealed only after lock (reveal timestamped); reviewer identity/method disclosed; prompt/model versions pinned; stimulus links to coded evidence. **No semantic eligibility threshold exists** — no 5-of-6 rule, no leave-one-out, no unique-top, no medoid selection. Historical studies keep `LEGACY BASELINE`/`PRE-M34 BASELINE` rendering; B2B unchanged (no framing workflow). |
| C-16 | Resonance agent (`resonance_geo_v1`, D-106) descriptive-only rule: the autonomous agent offering never emits a legitimacy, trust, safety, investment, price, or trading judgment — measured distributions and verbatim evidence only. Enforced by forbidden-phrase tests on all report-authored prose (the C-14/RB-5 pattern), never by prompt instruction alone. Quoted model evidence (including financial-sounding language like "bullish"/"scam") is exempt — it is attributed engine output, not our claim. |
| C-17 | Resonance agent buyer input is hostile by default. Every buyer-submitted field is schema-validated (`additionalProperties: false`), length-capped, escaped independently at every sink (prompt/JSON/log/HTML), and rate-limited per buyer identity. No free text, project claims, or fact assertions are accepted or verified; on-chain contract identity (name/symbol read from the contract itself) is the only accepted identity anchor, and it too is treated as attacker-controlled. |

## 5. Stack snapshot

Hosting target: Render-only, with one `render.yaml` defining a Next.js web service, a background worker, and Postgres. Sanctioned fallback if DB cost matters: Render compute plus Supabase free Postgres.

Stack: Next.js 15 + TypeScript + Tailwind + shadcn/ui, Drizzle ORM, Zod, Vitest, and `run_events`. pino and Sentry are the observability target, not yet dependencies (D-076/D-081/D-092) — `src/observability.ts`'s `reportError` is the single swap-in seam.

| Command | Does |
|---|---|
| `pnpm dev` | Run the Next.js app locally |
| `pnpm worker` | Run the polling worker locally |
| `pnpm test` | Run Vitest, including golden dataset tests — DB-backed tests run against an ephemeral, auto-migrated+seeded embedded Postgres (`scripts/vitest-global-setup.ts`), never the dev DB (D-078) |
| `pnpm test:e2e` | Playwright smoke + axe floor over the critical operator journey (D-092); boots its own ephemeral DB + Next on :3100 |
| `pnpm test:db` | Boot the same ephemeral test-DB instance standalone in the foreground, for manual poking (mirrors `pnpm db:dev`'s UX; D-078) |
| `pnpm test:agent-mock-e2e` | M36 GEO-agent acceptance: headless contract→project→matrix→run path, 300/300 mock samples across the three engines, per-engine D-016 variation, adversarial resolver fixtures rejected pre-budget |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:studio` | Inspect data with Drizzle Studio |
| `pnpm research:m34a:collect` | Bounded live M34A neutral-evidence collection with raw provenance, span assistance, and harness-side C-2 ledger; never runs semantic eligibility |
| `pnpm research:m34a:workflow` | Build blind packet, lock codebook, generate recurrence matrix, or create C-15 evidence snapshot from M34A artifacts |
| `pnpm research:m34a:report` | Render descriptive M34A recurrence and actionable-gap report from locked human-reviewed coding |

This table is a snapshot of daily-driver commands. The canonical, complete command list — lint, typecheck, seed, and per-milestone acceptance commands — lives in `DEVELOPMENT_GUIDELINES.md` section F.

## 6. Repo map

```
/src/app                 Next.js routes and pages, UI-only entrypoint
/src/components          Presentational components, no fetching/business logic
/src/core                Domain types, Zod schemas, constants, pure math/rules
/src/modules/intake      Project intake and autosave orchestration
/src/modules/matrix      Prompt template rendering, allocation, approval
/src/modules/runner      Run creation, job planning, cost guards
/src/modules/extraction  Structured extraction and claim matching
/src/modules/analysis    Metrics, findings, stability calculations
/src/modules/resonance   Simulation Layer studies: compile, SSR scoring, resonance metrics (M17+)
/src/modules/framing     M34A framing evidence: study workflow, blind human coding, recurrence, gap classification, C-15 handoff (D-099/D-102)
/src/modules/report      Report section generation and export helpers
/src/modules/auth        Login/session (M8, D-034)
/src/modules/settings    Provider credentials UI/service (M8, D-017/D-021)
/src/modules/dashboard   Dashboard data assembly (M6)
/src/modules/setup       Post-intake Setup editing (M27, D-084)
/src/providers           LLMProvider interface, mock, live provider adapters
/src/db                  Drizzle schema, migrations, repositories
/src/worker              Polling worker entrypoint
/fixtures                Mock responses and golden expectations
/scripts                 Local verification and seed scripts
```

## 7. Documents index

Every governed document carries a first-line metadata header: `LIFECYCLE: ACTIVE | PARKED | HISTORICAL`, `ROLE: CANON | PLAN | PLAYBOOK | RECORD`, `OWNS: <single responsibility>`, plus `TRACKER:`/`DISPOSITION:` where applicable. `pnpm docs:check` (CI) validates this index against reality (D-107/D-112). PARKED is distinct from HISTORICAL: parked canon stays in root, immediately recoverable; historical documents live in `docs/history/`.

Parallel milestone branches may each carry an active plan (D-112). `STATUS.md` remains branch-local and names exactly one active product; its first-line `TRACKER` selects the one plan governing that branch. Never mirror another branch's live status into the current branch.

| File | Lifecycle | Owns |
|---|---|---|
| `STATUS.md` | ACTIVE | The single "where are we": active product, branch, gate state, next action (read FIRST, §8) |
| `MASTER_CONTEXT.md` | ACTIVE | Identity, hard constraints, rituals, this index |
| `DECISIONS.md` | ACTIVE | Append-only Decision Log + supersession register (D-107) |
| `AGENT_PRD.md` | ACTIVE | GEO agent product contract: input schema, prompt matrix, extraction rules, metrics, exclusions |
| `AGENT_BUILD_PLAN.md` | ACTIVE | GEO agent milestones M35–M42, ACP gateway/persistence architecture, wallet/deploy/ops, test plan |
| `AGENT_STRATEGY_MEMO.md` | ACTIVE | GEO agent commercial kill/scale criteria + GTM; non-binding on engineering |
| `DEVELOPMENT_GUIDELINES.md` | ACTIVE | Architecture, provider contracts, schemas, tests, workflow |
| `DESIGN_GUIDELINES.md` | ACTIVE | Visual language: tokens, typography, surfaces, motion, guardrails |
| `ENGINEERING_SPEC.md` | ACTIVE | Detailed schema, lifecycle states, provider matrix, seeds, acceptance commands |
| `RENDER_DEPLOYMENT.md` | ACTIVE | Render Blueprint assumptions, secret model, first-deploy checklist |
| `RELEASE_CHECKLIST.md` | ACTIVE | Go-live gates and the per-audit delivery/archive record (D-043) |
| `AUDIT_METHODOLOGY.md` | ACTIVE | Standing whole-repo cleanup-audit playbook (D-086) |
| `PROTECTED_REGISTER.md` | ACTIVE | Decision-Log-protected surfaces; consulted before any delete/merge/rename (D-086) |
| `BUILD_NOTES.md` | ACTIVE | Disposable per-session working memory; pruned at milestone merge (D-025) |
| `BRAND_PLAYBOOK.md` / `BRAND_SITE_GUIDE.md` | ACTIVE | Resonance external brand voice / site guide (the active brand, D-106) |
| `README.md` | ACTIVE | Quick orientation and local setup pointer |
| `PRD.md` | PARKED | The parked Resonance audit+simulation product: scope, requirements, closed M0–M34A tracker (D-106) |
| `CALIBRATION_PROTOCOL.md` | PARKED | SSR calibration design for the parked Simulation Layer (M26, D-082) |
| `docs/history/` | HISTORICAL | Executed/superseded plans and proposals, each with a `DISPOSITION` header — never edited, only appended to by future archival |
| `docs/audits/` | — | Working audit artifacts (per `AUDIT_METHODOLOGY.md` §8 disposability convention) |
| `fixtures/` | — | Demo project, mock response manifest, golden expectation manifest |

Split a section into a separate file only when it exceeds roughly 300 lines or changes at a clearly different cadence. Record the split in the Decision Log.

A milestone's build plan is a special case of the same rule (D-090). A milestone earns its own `M<N>_BUILD_PLAN.md` file only when its execution playbook clears the split test above — it spans multiple milestones, OR is multi-phase with per-phase acceptance criteria, OR realistically runs across several sessions or agents, OR exceeds ~300 lines. A milestone whose plan is smaller than that keeps its plan in its Decision Log entry plus its `BUILD_NOTES.md` handoff entry (as M27–M31 did), never a standalone file. When in doubt, no file: the Decision-Log-plus-BUILD_NOTES home is the default; a build-plan doc is the exception earned by size or procedural complexity, not a per-milestone habit. The boot ritual's "that milestone's named approved build plan when the PRD or Documents index names one" (§8) is deliberately conditional for exactly this reason — most milestones will not name one.

## 8. Session rituals

Boot ritual for implementation sessions:

> Read `STATUS.md` FIRST — it names the active product, its doc set, the current gate/milestone, and the exact next action; never derive "where are we" from anything else. Then read `MASTER_CONTEXT.md`, then the active product's PRD (`AGENT_PRD.md` for the GEO agent; the parked track's `PRD.md` §M<N> only when working that track), then the build plan `STATUS.md` names as TRACKER source, then `DEVELOPMENT_GUIDELINES.md` section A, then the current entries in `BUILD_NOTES.md`. For any UI-facing work, also read `DESIGN_GUIDELINES.md`. For cleanup/refactor work, also read `AUDIT_METHODOLOGY.md` and `PROTECTED_REGISTER.md`. Summarize the plan in <=10 bullets and list expected files to touch. Wait for confirmation before editing.

Handoff ritual:

> Update `STATUS.md` whenever gate/milestone state or the next action changed this session — it is step zero, not an afterthought. Append a session entry to `BUILD_NOTES.md` (template inside that file). Append decisions made this session to `DECISIONS.md`; a decision that supersedes a standing rule MUST add its edge to the supersession register there in the same commit. If a decision logged this session protects an existing surface from removal/rename/merge, also append it to `PROTECTED_REGISTER.md` (D-086) so the register doesn't silently go stale. When a milestone merges or a plan is superseded, move the finished plan to `docs/history/` (with lifecycle header) **in the merge commit itself** — never as a later catch-up pass — and prune the merged milestone's `BUILD_NOTES.md` entries in the same commit (D-025). Update command/acceptance tables when scripts or gates change: `README.md`, this file §5, and `DEVELOPMENT_GUIDELINES.md` §F. Update `DESIGN_GUIDELINES.md` only when a visual rule changes; update `RELEASE_CHECKLIST.md` only when a go-live gate changes. Run `pnpm docs:check` before handing off. Give the commit message. If stopping mid-task or blocked, write the `BUILD_NOTES.md` entry immediately, even without the rest of the ritual.

Session rules: one active session per milestone worktree, one branch per milestone, plan before any multi-file edit, and any schema-change plan must say the word migration. Parallel milestone branches isolate their environment, database, ports, and live status; shared surfaces land as isolated commits and merge through the named integration branch (D-112). Any proposal to delete, merge, rename, or "simplify away" an existing surface must check `PROTECTED_REGISTER.md` (D-086) first; a match is an automatic Keep — Protected, cite the D-number. A milestone touching UI cannot be marked Done in the PRD tracker until its interactive verification has actually run and is evidenced in `BUILD_NOTES.md`; record deferred verification as "Code complete — unverified" instead (D-092 — this is the rule M32 would have needed). Commit at each phase-green boundary within a milestone rather than in one commit at milestone close (D-092).

Operational hazards, every session:
- Never `git add -A` / `git add .` — the operator keeps live untracked WIP in the tree; stage explicit paths only.
- Never `pnpm build` while a dev server is running (shared `.next` corruption, D-075).
- `pnpm test` is DB-isolated since D-078, but never point ad-hoc scripts at the dev DB directly — it holds real operator runs (D-073).
- If `node`/`pnpm` are missing from PATH, bootstrap via nvm before concluding the project is broken.

## 9. Decision Log

Moved to `DECISIONS.md` (D-107): the append-only, immutable rationale record (D-001..present) plus the supersession register (`old decision → governing successor` edges — follow chains forward for current truth). Active behavior is defined by this file's constraints and rituals plus the living docs in §7; consult `DECISIONS.md` for the *why*, never to re-derive a rule that canon already states. New decisions are appended there; a superseding decision adds its register edge in the same commit.

## 10. Current state

Live status has exactly one home per branch: `STATUS.md` — active product, branch, current milestone, milestone state, next action, and parked-product pointer (D-107/D-112). Static milestone definitions live in the active plan named by STATUS's first-line `TRACKER`; STATUS never duplicates them, only their state, and never mirrors another branch. The M-counter is repo-global and continues across products (D-108): the parked track closed at M34A, the agent build runs M35–M42, and later products continue the same sequence. Do not record status in this file.

## 11. Cross-platform wiring

This file stays canonical and tool-agnostic. Tool-specific files are thin pointers only:

- `CLAUDE.md`: import/pointer to this file.
- `AGENTS.md`: one-line instruction to read this file.
- `.cursor/rules/parallax.mdc`: always-on pointer to this file.

Verify each tool's current instruction-file behavior in official docs before relying on it.

## 12. Glossary

cell: one resolved prompt. engine-mode: provider plus grounding mode. rep: one repeated sample. run: execution of an approved matrix across selected engine-modes and repetitions. extraction: structured record parsed from one raw response. dead-letter: a failed job or extraction stored for review. golden dataset: hand-labeled fixtures with exact expected extractions and metrics. mock mode: seeded fixture-backed provider mode. stability index: mean pairwise Jaccard of top-5 brand sets across reps. lost-shortlist cell: high-intent cell where a competitor appears in >=60% of samples and the client appears in <=20%. fact sheet: operator-entered ground truth. matrix version: immutable approved prompt-cell snapshot. pillar: one of the Four P's — Presence, Position, Perception, Proof — the client question a prompt/metric/report chapter answers (D-051, M11). archetype: a project's buyer-language category (b2b, consumer_product, consumer_venue) selecting its prompt-template pack (D-052, M11).

representation (intent): the sixth audit intent (M34, D-094/D-099) — a minimally-leading, brand-named but non-evaluative prompt measuring how AI describes the named client brand; maps to Perception, feeds no planted-signal metric, and is PM-9-exempt (it contains `{client_brand}` by design); the M34A prompt set is fixed, bare (zero shared instruction), pinned per protocol version, and CAL-2-validated as non-steering. framing lane: one of two never-pooled evidence sources — `organic_in_context` (spontaneous mention in existing unbranded responses; optional supporting evidence, never required per brand) or `neutral_elicited` (representation prompts; the primary lane); neither is ever called "bias-free"/"unbiased"/"vanilla" (forbidden vocabulary). codebook: the small project-specific set of framing associations (typically 5–10) an analyst develops on a blinded subset, then locks (versioned, timestamped) BEFORE full-sample counting and BEFORE the client's intended positioning is revealed (reveal timestamped) — D-099. coded association: one codebook entry observed in a response, valid only when linked to an exact offset-verified evidence span; other/ambiguous/none and `entity_ambiguous` are valid outcomes. recurrence matrix: the descriptive M34A output — association × (responses n/N, prompt spread, model/mode scope, review status); complete denominators, no Wilson/CI/independence claims. gap classification: reinforced / missing / misframed / unsupported / non-actionable, judged against the revealed positioning + verified fact sheet — the actionable framing gap is M34A's commercial output. framing baseline (M34A sense): a verbatim stored response linked to reviewed coded evidence, handed to Simulation with an immutable evidence snapshot per C-15; low-recurrence baselines carry accurate labels (`SINGLE OBSERVED INSTANCE`). Consistency-check terms are never conflated (D-099): intra-rater consistency (same analyst re-codes later) ≠ machine discrepancy check (LLM comparison, labeled) ≠ inter-rater reliability (second human only). The D-094-era eligibility machinery (5/6+LOO admission, unique-top, automatic medoid selection, abstention-certification states) is RETIRED (D-099) — those terms are historical. frame stability remains distinct from the shortlist Stability Index and is never conflated with it (BF-13's caution survives the descope).

Evidence Layer / Simulation Layer: the two named epistemic layers organizing the product (D-077), superseding the earlier upper/mid/lower funnel framing (D-063): the Evidence Layer is the audit engine, home to the Four P pillars, with Proof as the trust rail (never a pillar or a "stage"); the Simulation Layer is the resonance study system. funnel stage: the internal, non-rendered `FunnelStage` type (`"upper" | "mid" | "lower"`, `src/core/funnel.ts`) that the pillar-to-layer mapping is still built on under the hood (D-077 kept these values — they are implementation detail, not product vocabulary). resonance study: a Simulation Layer study definition — panel personas x stimulus variants with a baseline (D-064). stimulus variant: one framing shown to the synthetic panel (`measured_ai | corrected | repositioned | custom`); `measured_ai` quotes stored audit responses (C-13). panel persona: a simulation-side buyer profile — age and income band (paper-validated axes) plus location and behavioral profile (prompt context, not validated segmentation; D-066) — distinct from audit personas (CM-3). SSR: Semantic Similarity Rating — free-text reaction to Likert PMF via embedding similarity against anchor sets. anchor set: a versioned repo fixture of 5 reference statements per Likert point with a `calibrated` flag (v1 ships uncalibrated); studies pin their anchor version at approval. PMF: probability mass function over the 5-point scale; means are point estimates (no invented intervals, D-023). delta (ΔPI): a variant's Likert-scale mean purchase-intent shift vs the study baseline — a survey-construct shift, never purchase probability; the headline simulation metric.

"Validation" is overloaded; always qualify it: validation (intent) is one of the five prompt intents; validation run (`live_validation`, "validation-only") is a cheap k=2 pipeline dry-run that is never client-ready evidence; schema validation is Zod input/output checking. The provider id `google` is the Gemini provider — prose says Gemini, code says `google`.
