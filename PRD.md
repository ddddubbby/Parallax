# PRD.md - Parallax MVP

> What to build. Identity and decisions live in `MASTER_CONTEXT.md`; implementation rules live in `DEVELOPMENT_GUIDELINES.md`.

---

## 1. Vision

Parallax turns a multi-week manual research task, "how do AI assistants describe, rank, recommend, and misrepresent this brand versus competitors?", into a same-day operator pipeline: structured intake, capped prompt matrix, sampled provider runs, structured extraction, metrics with confidence intervals, findings, and an editable report. The software runs, counts, stores evidence, and drafts. The operator remains responsible for prompt curation, QA, claim confirmation, and final recommendations.

## 2. How Parallax works

1. The operator creates a project and enters the client brand, aliases, competitors, fact sheet, desired attributes, personas, and target markets.
2. The app generates a prompt matrix across five intent types, defaulting to 40 prompt cells and never exceeding 50.
3. The operator edits prompts and approves a matrix version. Approval freezes the resolved prompt text and competitor ordering.
4. The worker runs the approved cells against selected engine-modes. Audit-grade runs use k=5 repetitions. Validation mini-runs may use k=2 and are labeled validation-only.
5. Every raw response is stored immutably with provider, model version, tokens, cost, latency, mode, citations, and errors where applicable.
6. Extraction turns raw answers into structured records: brands, ranks, recommendations, sentiment, attributes, citations, and factual claims.
7. Claims about the client brand are matched to the fact sheet and reviewed in a misinformation register.
8. Deterministic code computes metrics, confidence intervals, stability, and findings.
9. The dashboard exposes six views, with <=2-click drill-down from any figure to raw answers.
10. The report builder generates editable sections and exports Markdown, print-PDF, and raw CSV/JSON evidence.

## 3. Target user

The consultant-builder: a solo consultant or small agency operator selling brand, SEO, PR, or positioning work to B2B SaaS and considered-purchase brands. They are technically literate but not expected to be an engineer. They run 2-8 audits/month and need evidence that survives client scrutiny.

The end client is not an app user.

## 4. Core use cases

1. Full baseline audit: 40-50 cells, audit-grade repetitions, target provider set.
2. Rapid snapshot: 15-20 cells, one or two providers, lower-cost package.
3. Misinformation register: factual-risk deliverable for regulated or trust-sensitive clients.
4. Competitive displacement diagnosis: lost-shortlist cells plus sources driving competitor wins.
5. Evidence pack: raw answers, extractions, and metrics backing strategy work.

## 5. MVP scope

- Seven-step intake wizard with autosave and review.
- Budget-aware prompt matrix, operator-edited, versioned, and capped per C-1.
- Jobs table plus polling worker; resumable, idempotent, cost-capped.
- MockProvider as provider #0.
- DeepSeek as the first live dry-run provider for validation mini-audits.
- MiniMax as the second candidate live provider after API-key/account details are confirmed.
- Provider interface designed for later OpenAI, Anthropic, Gemini, and Perplexity adapters.
- Extraction with strict schema, retry-once, dead-lettering, alias normalization, claim verification, and QA sampling.
- Metrics with Wilson confidence intervals, stability, small-n guards, and idempotent recompute.
- Dashboard with scorecard, funnel heatmap, share of voice, attribute radar, cited sources, and misinformation register.
- Findings engine, report builder, Markdown export, print-PDF export, and raw CSV/JSON export.
- Settings, Debug views, shared-password auth, website-entered provider credentials, and Render deployment skeleton.

## 6. Explicitly out of MVP scope

Scheduled runs, run-over-run trends, AI Overviews via SERP API, `.docx` export, white-label theming, multi-user auth/roles, client portals, Slack/CRM/email integrations, automated content generation, billing, mobile optimization, geo-proxy sophistication, Copilot/Meta/Grok, and consumer-UI scraping.

## 7. User journey

`/projects` -> New project -> wizard -> review projected footprint -> generate matrix -> edit within budget -> approve -> start mock or live validation run -> watch progress -> extraction QA and claim review -> dashboard -> report builder -> export.

Routes:

- `/projects`
- `/projects/new`
- `/projects/[id]/matrix`
- `/projects/[id]/runs/[runId]`
- `/projects/[id]/dashboard`
- `/projects/[id]/report`
- `/settings`
- `/debug`

## 8. Feature requirements

### 8.1 Wizard shell

PS-1: Seven steps plus review, progress rail, free back/forward.
PS-2: Server-side autosave per step; drafts resumable.
PS-3: Zod validation server-side with field-level errors.
PS-4: Review screen deep-links to steps and returns to review.

### 8.2 Brand and competitors

BC-1: Client brand fields: `name`, `aliases[]`, `domain`, `description`.
BC-2: Competitors: 3-8 brands, each with `name`, `aliases[]`, optional `domain`.
BC-3: Overlapping aliases across brands are flagged before matrix generation.

### 8.3 Context inputs

CM-1: Fact sheet rows: `type` in `pricing | feature | company_fact | security | availability`, `statement`, optional `source_note`, optional `source_url`.
CM-2: Desired attributes: 6-12 normalized phrases, for example `easy implementation`, `enterprise-ready`, `low cost`.
CM-3: Personas: 2-5 cards with `title`, `company_context`, `pain_points[]`, and `buying_criteria[]`.
CM-4: Markets: ordered list; order controls allocation priority.
CM-5: Project context includes `category` and `job_to_be_done`; prompt templates may not reference fields outside the intake schema.

### 8.4 Prompt matrix

PM-1: Templates render across intent, persona, market, and variant.
PM-2: Default 40-cell allocation: comparison 12, consideration 10, validation 8, objection 6, discovery 4.
PM-3: The allocator never exceeds `MAX_CELLS_PER_RUN = 50`.
PM-4: Priority is primary persona x primary market x two variants first, then broader coverage.
PM-5: UI shows a live cell counter; add-cell is disabled at 50.
PM-6: Server rejects approval above 50 cells.
PM-7: Inline text edit and per-cell variant regeneration are supported.
PM-8: Comparison cells store randomized competitor order.
PM-9: Unbranded discovery and consideration cells must contain no tracked brand names or aliases at approval.
PM-10: Approval creates an immutable version; later edits create a new version.
PM-11: If an intent's allocation quota exceeds the available persona x market x variant combinations, the allocator fills what exists and redistributes the remainder to other intents; it never duplicates identical cells.

Seed prompt templates must exist as database seed data, not hard-coded UI strings:

- discovery: "What tools should a {persona} in {market} consider for {job_to_be_done}?"
- consideration: "What are the best options for {persona} teams evaluating {category} in {market}?"
- comparison: "Compare {client_brand} against {competitor_list} for a {persona} buyer in {market}."
- validation: "Is {client_brand} a good fit for {persona} teams that care about {attribute_list}?"
- objection: "What concerns should a {persona} have before choosing {client_brand}?"

Each intent seeds at least three variant phrasings (`v1`, `v2`, `v3`); the list above is `v1`. Variant depth is what lets the allocator reach its per-intent quotas (see the demo-sizing contract in `ENGINEERING_SPEC.md` section 4). Additional variants follow the same placeholder constraints as CM-5.

### 8.5 Mock mode

MK-1: MockProvider is selectable at run creation.
MK-2: MOCK badge appears on every derived view.
MK-3: 30-50 fixtures cover ranked lists, prose comparisons, hedges, zero-brand answers, cited answers, wrong facts, refusals, truncated output, and malformed output.
MK-4: Fixture selection is seeded by a stable hash of `(resolved_text, provider_id, rep_index)`, never by row UUIDs, so selection is reproducible across re-seeds and fresh clones (D-016).
MK-5: Failure-injection toggles live in Debug.
MK-6: Default mock run completes in under 2 minutes.

### 8.6 Providers and live validation

PV-1: Provider adapters implement the same interface and declare grounding capability.
PV-2: DeepSeek is the first live dry-run provider. It is used for ungrounded live pipeline validation unless a verified grounded API path is added.
PV-3: MiniMax is a second candidate provider, not required for the first live mini-audit.
PV-4: OpenAI, Anthropic, Gemini, and Perplexity are later adapters and must not require changes to the runner schema.
PV-5: A provider that cannot return normalized citations cannot be selected for grounded runs.
PV-6: Provider-specific model names and prices live in provider config and `.env.example` as defaults, never in UI components. A non-null `base_url`/`default_model` on the provider's `provider_credentials` row overrides the env default (D-020).
PV-7: Provider capability details are specified in `ENGINEERING_SPEC.md` and must be verified against official docs before implementation.

### 8.7 Runner

RN-1: Run creation computes planned calls: cells x selected engine-modes x repetitions, plus one planned extraction call per generation call (D-022).
RN-2: Run creation shows projected cost — generation plus extraction estimates — and blocks if above the run dollar cap.
RN-3: Jobs are idempotent with unique `(run_id, cell_id, provider_id, generation_mode, rep_index)`.
RN-4: Worker restart resumes without duplicate raw responses.
RN-5: Per-provider concurrency and exponential backoff are enforced.
RN-6: Typed errors are stored: `rate_limit`, `timeout`, `server_error`, `auth_error`, `malformed_output`, `unsupported_mode`. `malformed_output` is transport-level only — no usable text received, no response stored; content-level problems belong to extraction (D-011).
RN-7: Circuit breaker pauses the run at cost cap or when failure rate exceeds 20%, where failure rate = dead-lettered jobs / finished jobs (succeeded + dead-lettered), evaluated as jobs finish.
RN-8: Pause/cancel is supported. "Partial" is derived, not stored: a run that reaches a terminal state with any dead-lettered or cancelled jobs is displayed with a partial badge.
RN-9: The worker records a heartbeat `run_events` row at least every 60 seconds while any run is active; Debug surfaces heartbeat staleness; worker crashes report to Sentry (D-024).

### 8.8 Extraction schema

SM-1: Extraction output must validate against the canonical schema before persistence.
SM-2: Validation failure retries once with the validation error appended to the extraction prompt.
SM-3: Second failure creates an extraction dead-letter; no raw response is dropped.

Canonical extraction shape:

```ts
type ExtractedResponse = {
  schema_version: 1;
  answer_summary: string;
  brands: Array<{
    canonical_brand_id: string | null;
    observed_name: string;
    aliases_matched: string[];
    mentioned: boolean;
    position: number | null;
    recommended: boolean;
    recommendation_strength: "strong" | "soft" | "neutral" | "discouraged";
    sentiment: "positive" | "neutral" | "mixed" | "negative";
    attributes: string[];
    evidence_quote: string;
  }>;
  citations: Array<{
    url: string;
    domain: string;
    title: string | null;
    cited_for_brand_ids: string[];
  }>;
  claims: Array<{
    brand_id: string | null;
    claim_text: string;
    claim_type: "pricing" | "feature" | "company_fact" | "security" | "availability" | "other";
    matched_fact_claim_id: string | null;
    verdict: "supported" | "contradicted" | "outdated" | "unsupported" | "ambiguous" | "not_checked";
    severity: "none" | "low" | "medium" | "high";
    evidence_quote: string;
  }>;
  refusal: boolean;
  malformed: boolean;
};
```

SM-4: Alias normalization maps observed names to canonical brands before metric computation.
SM-5: Operator claim review can override verdict and severity while preserving the original extracted values.
SM-6: Aggregate claims and findings render only where n >= 30 eligible samples unless explicitly labeled validation-only. Cell-level findings are exempt but always labeled directional only (D-015).
SM-7: Golden dataset fixtures reproduce exact expected extractions and metrics in CI.

### 8.9 Metrics

"Eligible samples" and scope are defined once in `DEVELOPMENT_GUIDELINES.md` E2 (D-014); every denominator below uses that definition.

MT-1: Mention Rate = samples where client brand is mentioned / eligible samples.
MT-2: Recommendation Rate = samples where client brand is recommended / eligible samples.
MT-3: Share of Voice = client brand mentions / all tracked brand mentions in scope.
MT-4: Avg First Position excludes samples where the brand is absent.
MT-5: Citation Share = citations associated with client brand / citations associated with all tracked brands.
MT-6: Accuracy Rate = supported client claims / checked client claims.
MT-7: Stability Index = mean pairwise Jaccard of top-5 tracked-brand sets across reps in the same cell and engine-mode.
MT-8: Metrics are computed at overall, provider, mode, intent, market, persona, and cell-cluster scopes where sample size allows.
MT-9: Sentiment reports as a distribution per brand per scope — the share of eligible samples mentioning the brand that carry each sentiment label. It is never averaged into a single score.
MT-10: The attribute-association matrix cell (brand x attribute) = share of eligible samples mentioning the brand where the extraction associates that attribute with it, computed over the project's desired-attributes list.
MT-11: Interval methods are per metric per D-023: Wilson for MT-1, MT-2, and MT-6; MT-3, MT-4, MT-5, and MT-7 render as point estimates labeled without intervals in MVP.

### 8.10 Dashboard

DB-1: Six views: scorecard, funnel heatmap, share of voice, attribute radar, cited sources, misinformation register.
DB-2: Every figure drills down to underlying raw responses in <=2 clicks.
DB-3: Small-n guards render "insufficient data" below n=30 for audit claims.
DB-4: Mock, validation-only, ungrounded, partial, and low-stability badges are visible wherever relevant.

### 8.11 Report

RB-1: Findings rules cover lost-shortlist cells, positioning gaps, misinformation, grounded-vs-ungrounded mechanism split, source concentration, and low-stability flags.
RB-2: Report sections store `generated_md` and `edited_md`; edited content always wins.
RB-3: Regenerating one section never touches other sections.
RB-4: Structure: executive summary, method and confidence note, visibility, perception, competitive dynamics, sources, misinformation register, recommendations, raw-answer appendix.
RB-5: Report tone is client-facing, cautious, and evidence-led. It never promises rankings or guaranteed remediation.

### 8.12 Export

EX-1: Markdown download.
EX-2: Print-styled HTML to PDF with section page breaks.
EX-3: Raw responses, extractions, metrics, and citations export as CSV/JSON.
EX-4: Exports are synchronous downloads; there is no export table, queue, or state machine in MVP (D-013).

### 8.13 Settings

ST-1: Provider credentials are entered only through the authenticated Settings UI, never through committed files or Render provider-key env vars.
ST-2: Secret values are encrypted server-side at rest, never returned to the browser, never logged, and displayed only as provider, status, last four characters, and last verified timestamp.
ST-3: Settings supports add/update, verify, disable, delete, and rotate for each provider credential.
ST-4: Defaults: repetitions, selected engines, extraction engine (the provider+model used for structured extraction, D-022), run dollar cap, and provider daily budgets.
ST-5: Default validation mini-run cap is $2. Default audit run cap is $25 until changed by operator.
ST-6: Login is rate-limited with lockout/backoff; password comparison is constant-time; sessions are httpOnly/secure cookies with expiry <=7 days; session tokens never appear in URLs (D-024).

### 8.14 Debug

AD-1: Jobs table with requeue.
AD-2: Dead-letters with re-extract.
AD-3: `run_events` tail.
AD-4: Fixture reload, failure injection, recompute, seed demo project.

### 8.15 Foundation readiness

FR-1: M0 is not complete until `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, Next config, Vitest config, Drizzle config, CI workflow, Render skeleton, and `/health` exist.
FR-2: Fresh-clone setup is documented in `README.md`.
FR-3: M0 verification commands are `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a local `/health` smoke check.
FR-4: M1 may not start until the table-by-table schema spec, lifecycle states, provider capability matrix, demo project, and fixture manifests exist.

## 9. Data model summary

`projects`, `brands`, `fact_claims`, `attributes`, `personas`, `markets`, `prompt_templates`, `matrix_versions`, `prompt_cells`, `audit_runs`, `jobs`, `responses`, `extractions`, `brand_mentions`, `claims_found`, `provider_credentials`, `metrics`, `findings`, `report_sections`, `run_events`.

Detailed schema semantics live in `ENGINEERING_SPEC.md`. Schema changes require migrations.

## 10. Acceptance criteria

1. Golden dataset test passes in CI.
2. Full mock audit E2E script passes with asserted row counts and <=50 cap enforcement.
3. Failure-injection suite passes; worker kill/restart resumes without duplicates.
4. Cap enforcement is verified at matrix approval, run creation, and worker planning.
5. DeepSeek live validation mini-audit completes under a $2 cap with stored raw responses, versions, costs, and ungrounded/validation labels.
6. First grounded provider mini-audit completes only after a provider path can return normalized citations.
7. Extraction spot-check is >=90% accurate on 20 responses; dead-letter rate <5%.
8. Every dashboard figure traces to raw text; report numbers match dashboard.
9. One pilot audit is delivered after target provider coverage is available; retro is logged in `MASTER_CONTEXT.md`.
10. Manual checklists in `DEVELOPMENT_GUIDELINES.md` are executed on the release commit.
11. Every delivered audit has an archived evidence pack: the EX-3 export plus a database dump stored off-Render, recorded in the release checklist (D-024).

## 11. Milestones and progress tracker

| M | Goal | Merge when | Status |
|---|---|---|---|
| M0 | Foundation: runnable stack skeleton, CI/deploy skeleton, docs wired | `pnpm install`, lint, typecheck, test, `/health`, CI, and Render skeleton all work | Code complete; CI verified on first remote push |
| M0.5 | Execution readiness: schema, states, provider matrix, fixtures | Engineers can start M1 without unresolved product/schema/provider questions | Done |
| M1 | Full schema + idempotent seed + constants | Migrations apply clean; seed twice creates no dupes | Done |
| M2 | Intake wizard | Draft -> quit -> resume intact; validation blocks bad input | Done |
| M3 | Budget-aware matrix | Default <=50 always; 51st blocked UI+server; approval freezes version | Done |
| M4 | Mock run pipeline | 1,000-call mock run <2 min; kill-resume clean; injection retries logged | Done |
| M5 | Extraction + metrics + golden dataset | Goldens exact; recompute idempotent; dead-letters visible | Done |
| M6 | Dashboard | Figures match SQL spot-checks; drill-down <=2 clicks | Done |
| M7 | Report + export | Full report from golden run; edits survive other-section regeneration | Done |
| M8 | Live validation: DeepSeek + extraction mini-audit | 5 cells x k=2 under $2 cap; validation labels visible; breaker fires | Not started |
| M9 | Provider expansion and hardening | Target grounded providers added through same interface; provider-down degrades gracefully | Not started |
| M10 | Pilot audit | Full live audit delivered; retro logged; release checklist complete | Not started |

Progress notes:

- 2026-07-02 done: canonical docs moved into repo, ambiguity reduced, structured repo folders initialized, and M0.5 execution-readiness specs added.
- 2026-07-02 remaining: initialize package dependencies, health route, CI workflow, Render skeleton, and first migration.
- 2026-07-02 known issues: no dependencies installed yet; provider credentials UI/storage is required before live DeepSeek validation; MiniMax account details still need operator confirmation.
- 2026-07-02 security/deploy: provider API keys moved out of env assumptions and into authenticated Settings UI with encrypted-at-rest storage; Render Blueprint skeleton added with no LLM provider API keys.
- 2026-07-02 doc audit: resolved contradictions D-011 through D-016 (malformed-output layering, per-provider budgets, no exports table, eligible-sample definition, cell-level finding exemption, deterministic mock seeding); baseline commit created.
- 2026-07-02 structure: removed speculative M9 provider directories and the dangerous `drizzle` gitignore line; status now has one home (this tracker).
- 2026-07-02 design: added `DESIGN_GUIDELINES.md` codifying the machine-age evidence-dossier visual language (D-019) — ink/paper surfaces, signal-orange accent, mono-first type, motion budgets, guardrails V-1 to V-12; wired into docs index and stack table.
- 2026-07-02 pre-production review: resolved D-020 through D-024 — config precedence and single-active credentials, KEK lifecycle and pinned crypto, extraction engine named and brought under all cost guards, per-metric CI methods, production hardening (login, heartbeat, evidence archive, additive-first migrations); seed contract now requires 3 variants per intent and a 2-persona/2-market demo.
- 2026-07-02 process: added `BUILD_NOTES.md` session working-memory convention (D-025); boot and handoff rituals updated; S-001 entry points the next session at the M0 scaffold.
- 2026-07-02 M0 build: Next 15 + TS scaffold with standalone output, `/health` route + test, worker heartbeat entrypoint, ESLint/Vitest/Drizzle configs (migrations `out` pinned), CI workflow, Node/pnpm pins. All FR-3 commands pass locally; `/health` smoke-tested through the standalone server (the Render start path).
- 2026-07-02 M0 remaining: CI has not executed (no GitHub remote configured); `db:migrate` unverified against a live Postgres — both close out with the first remote push and M1's first migration.
- 2026-07-02 M1 done: migration 0000 (20 tables per ENGINEERING_SPEC §2, C-1 cap and k=5 checks, partial unique indexes for one-client/one-active-credential/active-template), core constants, idempotent seed (15 templates = 5 intents x 3 variants, LedgerFox demo). Seed-twice acceptance and constraint rejections verified against embedded Postgres 17.
- 2026-07-02 M1 note: local dev DB is `pnpm db:dev` (embedded PG 17, foreground, data in .pgdata); `db:migrate` now verified against a live database. CI verification still awaits a GitHub remote.
- 2026-07-02 M2 done: intake wizard — 7 steps + review, Tailwind v4 design tokens per DESIGN_GUIDELINES, debounced server autosave into `intake_draft_json` (migration 0001, D-026), strict Zod step validation with field-level errors, alias-overlap flags on review, transactional normalization at completion. Acceptance verified live in the browser: empty submit blocked with field errors; draft → quit → resume restored all fields; step advance persists high-water.
- 2026-07-02 M2 note: GitHub remote now exists (pushed by operator); this merge's push is the first CI execution — verify the Actions run. Repo pushed as ddddubbby/Parallax.
- 2026-07-03 pre-M3 audit: full 7-step wizard now verified live through review and completion; alias-overlap warning rendered; completed intake appears as an active project. Static chain, production build, migrations, seed, and standalone `/health` smoke pass locally on the pinned toolchain.
- 2026-07-03 pre-M3 note: local `main` remains ahead of `origin/main`; push and verify GitHub Actions plus Render deployment before treating M3 as remotely cleared.
- 2026-07-03 M3 done: pure allocator (PM-2 quotas, PM-4 priority waves, PM-11 redistribution, PM-3 hard cap), template rendering with PM-8 randomized competitor order, PM-9 brand-term scanner; matrix board with live counter, inline edit, variant regeneration, versioned approval with supersede. 15 allocator unit tests plus a DB-backed acceptance test: demo generates exactly 40, filled to 50 via real actions, 51st rejected server-side on every intent, approved cells immutable (tamper attempt verified unchanged), new-draft copy editable.
- 2026-07-03 M3 note: interactive browser verification still blocked by the macOS Documents permission for the preview harness (page render verified via curl; all mutating paths covered by the actions integration test). Push pending operator credentials.
- 2026-07-03 M4 done: LLMProvider interface + MockProvider (38 fixtures, all 13 MK-3 archetypes, D-016 stable-hash selection now including rep_index per D-028); job planning under RN-1/RN-2 cost guards; polling worker with FOR UPDATE SKIP LOCKED claiming, per-provider concurrency, exponential backoff, MAX_JOB_ATTEMPTS dead-lettering, RN-7 circuit breaker, RN-9 heartbeat run_events; run creation/progress UI with live polling; Debug console (jobs+requeue, run_events tail, heartbeat staleness). `pnpm test:mock-e2e` (500-job run, kill mid-flight, restart, resume) passed all 6 checks: terminal state reached, zero duplicate responses, retries logged (failure injection worked), stale-lock reclaim logged (kill/resume worked), 17s elapsed against the 120s MK-6 budget. 49 unit tests total.
- 2026-07-03 M4 note: two schema/interface decisions logged as D-027/D-028 — test-only failure injection lives on `audit_runs`, not the provider interface; `GenerationRequest` gained an optional `repIndex` so mock fixture selection varies across a cell's k repetitions. Interactive browser verification still blocked by the same macOS Documents permission; pages verified via curl with real content assertions instead.
- 2026-07-03 M5 done: Zod `ExtractedResponse` schema, alias resolution (SM-4), duplicate-mention collapse, Wilson intervals (D-023-correct: only MT-1/2/6), all 9 metric families (MT-1..MT-10) as pure core functions. 28-entry golden dataset covering all 13 archetypes with verdicts against the real LedgerFox fact sheet — DB-free `pnpm test:golden`, 36 assertions, runs the real alias-resolution/collapse pipeline rather than asserting a pass-through. Fixture-backed mock extraction engine (D-022) wired into the worker synchronously after each response; SM-2/SM-3 retry-once/dead-letter proven against the dev DB with genuine outcomes (not simulated). Disposable metrics recompute (delete-then-rebuild) proven idempotent on a real 500-response, 2-engine-mode run: 309 rows, byte-identical on repeat. Two schema/design decisions logged: D-029 (extraction-side failure injection, independent of D-027's generation injection) and D-030 (MT-7 stability scope_key must include engine-mode — caught by recomputing the real M4 run, which uses two modes).
- 2026-07-03 M5 note: run detail page gets a lightweight extraction/metrics preview (overall scope only, recompute button) — the real six-view dashboard is M6's job. Debug gets extraction dead-letters + re-extract (AD-2). Interactive browser verification still blocked by the same macOS Documents permission; verified via curl plus a direct script driving the real repositories against the M4 e2e run's 500 responses.
- 2026-07-03 mid-term review (pre-M6): four defects found and fixed. (1) Responses that miss their synchronous extraction window (worker crash, unexpected throw, pre-M5 data) were never backfilled — 2,034 orphans existed; added an extraction reconcile sweep to the worker, verified live to zero. (2) First Render deploy would have failed: `tsx`/`drizzle-kit` were devDependencies but `pnpm worker` and `preDeployCommand` need them at runtime under NODE_ENV=production — moved to dependencies; worker buildCommand no longer runs a pointless Next build. (3) Citation Share was structurally zero — engines emit brand names, metrics compared UUIDs (D-031); resolution added, golden citations enriched, verified 0.50 on a live grounded run. (4) A double-processed job (at-least-once reclaim delivery) could have its succeeded state downgraded to dead_lettered by the duplicate attempt's failure handling — recordRetry/recordDeadLetter now guarded to `state='running'`.
- 2026-07-03 mid-term review note: the M4 kill/resume test itself was found dishonest — SIGKILL hit tsx's wrapper process while the orphaned worker child kept committing for ~1s, finishing the "stuck" jobs; earlier passes came from the over-eager 500ms stale window reclaiming live jobs. The e2e now spawns a single-process worker (`node --import tsx`) and passes with exactly the 8 orphaned jobs reclaimed in one batch.
- 2026-07-03 pre-M8 dependencies (documented, unbuilt, none block M6/M7): shared-password auth + ST-6 hardening (must land before any public Render deploy — /debug and Settings would be exposed); Settings UI + provider_credentials encryption service (D-017/D-021); per-provider daily-budget enforcement (C-2/D-012 — env vars exist, no enforcement code); live extraction-engine cost accounting in run projection (D-022 — currently $0 for fixture-backed mock extraction, correct until a live engine exists).
- 2026-07-03 M6 done: six views on `/projects/[id]/dashboard` (DB-1) — scorecard, funnel heatmap (intent x persona, D-032), share of voice, attribute radar, cited sources, misinformation register. Recharts wrapped per C1.6 (SoVChart, AttributeRadar; the heatmap is a token-styled grid, not a chart, since Recharts has no heatmap primitive). DB-2 drill-down verified with real data across all three mechanisms: scope-filtered list (funnel cell -> 25 responses), explicit response-id list (cited-source domain -> 22 citing responses), and direct single-response (misinformation row -> 1 of 92 real contradicted/unsupported claims) — every path is <=2 clicks. DB-3 small-n guard verified on live data: 9 of 10 funnel cells had n>=30 and rendered real percentages, the 10th (n=16) correctly rendered "insufficient data." DB-4 badges (MOCK/VALIDATION-ONLY/UNGROUNDED/PARTIAL/LOW-STABILITY) derived from run state. SQL spot-check test (Mention Rate, Recommendation Rate, Citation Share) passed against independently hand-written SQL on first try, on the real 500-response M4 run. 122 tests total, lint/typecheck/build green.
- 2026-07-03 M6 note: Share of Voice shows client vs. "rest of field" rather than a per-competitor breakdown — M5's metrics only computed client-vs-all-tracked, not a per-brand split; a real per-competitor SoV chart is a small, well-scoped addition for whenever M7's report builder or a future dashboard pass wants it. Interactive browser verification still blocked by the same macOS Documents permission; verified via curl (confirmed all six section headings and real claim text render server-side, since page.tsx server-fetches data as props rather than client useEffect) plus direct repository/script checks against real data.
- 2026-07-03 M7 done: findings engine (RB-1, six types: lost-shortlist restricted to comparison/validation intents, positioning gaps, misinformation aggregate, grounded-vs-ungrounded split, source concentration, low-stability — D-033) as pure, unit-tested functions; deterministic report templates for all nine RB-4 sections (no LLM call — D-033); report_sections state machine (generated -> edited -> regenerated) with edited_md always winning (RB-2). RB-3's literal acceptance line ("edit section A, regenerate section B, A intact") proven with a DB-backed test asserting a third control section is byte-identical including exact updatedAt timestamp, against the real 500-response M4 run (90 real findings computed). All four exports verified with real downloads: Markdown (shows the operator's persisted edit, not the stale generated text), print/PDF view (marked-rendered HTML tables, all 9 sections, edit persists there too), evidence JSON (500 responses/extractions, 467 metrics, 68 citations), and 4 CSVs (metrics.csv's mention_rate matches the value independently verified via SQL in M6's spot-check). RB-5 tone verified by an automated forbidden-phrase test distinguishing promissory claims from correct disclaimers (the phrase "not a guarantee of future AI behavior" must pass, not fail). 152 tests total, lint/typecheck/build green.
- 2026-07-03 M7 note: a live download surfaced real fixture-corpus behavior working exactly as designed — two enriched citation domains (cfoweekly.example, peerinsights.example) showed unresolved brand attribution in the export; traced to `cited-03` never having been promoted to a golden entry in M5, so it correctly uses the generic extraction fallback (no citation enrichment) rather than the golden-labeled path. Not a bug — confirms the fallback/golden distinction is real and visible in live data, exactly as documented in `src/providers/mock/extraction-engine.ts`. CSV export is 4 separate per-dataset files rather than one combined file or a zip (different column shapes don't share a natural single-table form; JSON export covers the single-file case). Interactive browser verification still blocked by the same macOS Documents permission; every export format was verified via real HTTP downloads and content inspection instead (stronger proof than clicking, since exports are plain-text responses, not React SSR output).

## 12. Roadmap after MVP

v1.1: AI Overviews through SERP/API vendor, `.docx` export, snapshot preset.

Later, demand-driven: run-over-run comparison, extraction-accuracy trends, Shortlist Radar, SourceLift, and white-label theming only after at least two agencies ask.
