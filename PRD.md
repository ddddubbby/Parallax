# PRD.md - Resonance (Parallax engine) MVP

> What to build. Identity and decisions live in `MASTER_CONTEXT.md`; implementation rules live in `DEVELOPMENT_GUIDELINES.md`. Execution detail for M16+ lives in `RESONANCE_BUILD_PLAN.md`.

---

## 1. Vision

Resonance is the product umbrella (D-063): an internal operator tool that measures how AI assistants present a brand at every buying stage and simulates what that presentation does to buyers. It is organized around two named epistemic layers (D-077): the Evidence Layer (the audit engine — Presence, Position, and Perception as the Four P pillars answering the client's core questions, with Proof as the trust rail underneath all three), and the Simulation Layer (simulated buyer action via the synthetic panel), plus a value-add layer of test-before-you-spend study templates on top of it. The two-layer split is a presentation layer over the existing pillar/intent taxonomy — no stored data, metric keys, or intents are renamed by it.

Parallax remains the name of the measurement engine (M0-M15): it turns a multi-week manual research task, "how do AI assistants describe, rank, recommend, and misrepresent this brand versus competitors?", into a same-day operator pipeline: structured intake, capped prompt matrix, sampled provider runs, structured extraction, metrics with confidence intervals, findings, and an editable report. The software runs, counts, stores evidence, and drafts. The operator remains responsible for prompt curation, QA, claim confirmation, and final recommendations.

The Simulation Layer has a different epistemic status from the Evidence Layer: measured and simulated data never mix (C-12), simulations are conditioned on measured audit evidence by default (C-13), and simulation claims are comparative only (C-14). Scope through M20 is an internal tool for testing and demos: the existing shared-password login stays (it guards spendable credentials); multi-user, client portals, and payments are post-PoC.

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

The consultant-builder: a solo consultant or small agency operator selling brand, SEO, PR, or positioning work to B2B SaaS and considered-purchase brands. They are technically literate but not expected to be an engineer. They run 2-8 audits/month (and, from M16, Simulation Layer studies off the back of those audits) and need evidence that survives client scrutiny.

The end client is not an app user.

## 4. Core use cases

1. Full baseline audit: 40-50 cells, audit-grade repetitions, target provider set.
2. Rapid snapshot: 15-20 cells, one or two providers, lower-cost package.
3. Misinformation register: factual-risk deliverable for regulated or trust-sensitive clients.
4. Competitive displacement diagnosis: lost-shortlist cells plus sources driving competitor wins.
5. Evidence pack: raw answers, extractions, and metrics backing strategy work.
6. Simulation Layer study (M16+): after an audit surfaces how AI frames the brand, a resonance study simulates how buyer segments respond to that framing and to candidate fixes — the "so what, and which fix" chapter that closes the loop from measurement to action. Comparative and evidence-conditioned only (C-12/C-13/C-14).

## 5. MVP scope

This section and §6 define the original measurement-engine MVP (M0-M10). The Evidence Layer / Simulation Layer identity work and the Simulation Layer product are specified in sections 8.19-8.22 and tracked as M16-M20 (and further backfilled in sections 8.23-8.30 for M21-M29); nothing below is retracted by them.

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
- `/projects/[id]/setup` (M27, D-084: row-level post-intake editing of competitors/personas/markets/attributes/fact sheet; archive-not-delete)
- `/projects/[id]/matrix`
- `/projects/[id]/runs` and `/projects/[id]/runs/[runId]`
- `/projects/[id]/dashboard`
- `/projects/[id]/report`
- `/projects/[id]/resonance` and `/projects/[id]/resonance/[studyId]` (M16+ — Simulation Layer studies and results, always SIMULATED-badged)
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

From M11, templates are additionally keyed by category archetype — the list above becomes the `b2b` pack, and consumer packs replace its procurement idiom with natural buyer language (AT-1..AT-5 in section 8.16, D-052).

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

MT-12 (the prompt-frame rule, D-054) governs every rate below: a metric may never count a signal the prompt itself planted. Cells carry a frame derived from intent — unbranded (discovery, consideration; brand-free per PM-9), client-branded (validation, objection), comparative (comparison). At cross-intent scopes each metric counts only in-frame samples; intent-pure scopes (`intent`, `intent_persona`) are exempt as transparent per-intent drill-down.

MT-1: Mention Rate = unbranded samples where client brand is mentioned / unbranded eligible samples (MT-12: a mention planted by a branded prompt is not visibility).
MT-2: Organic Recommendation Rate = unbranded samples where client brand is recommended / unbranded eligible samples (MT-12: affirming a validation prompt's premise is not an organic recommendation).
MT-3: Share of Voice = client brand mentions / all tracked brand mentions across unbranded samples (MT-12: comparative cells collapse to prompt structure; client-branded cells are structurally 1.0).
MT-4: Avg First Position = mean client position over unbranded samples where the client appears (MT-12: a brand named in the prompt is trivially listed first).
MT-5: Citation Share = client citations / tracked-brand citations over grounded unbranded samples; scopes with zero grounded samples emit no row at all rather than a misleading 0.
MT-6: Accuracy Rate = supported client claims / checked client claims, all frames — claim content is model-generated and cannot be planted.
MT-7: Stability Index = mean pairwise Jaccard of top-5 tracked-brand sets across reps in the same cell and engine-mode, all frames — it measures the model's consistency under an identical prompt.
MT-8: Metrics are computed at overall, provider, mode, intent, market, persona, and cell-cluster scopes where sample size allows, with MT-12 applied at every cross-intent scope.
MT-9: Sentiment reports as distributions per brand per scope in two groups that are never pooled and never averaged into a single score: organic (client mentions in unbranded samples) and solicited (validation samples). Objection cells feed no sentiment metric — their prompts solicit concerns, so their skew is planted by design; their content feeds findings instead.
MT-10: The attribute-association matrix cell (brand x attribute) = share of client-mentioning samples associating that attribute, excluding samples whose resolved prompt text contains the attribute phrase (MT-12: an echo of a planted attribute — validation's `{attribute_list}` or an operator edit — is not perception).
MT-11: Interval methods are per metric per D-023: Wilson for MT-1, MT-2, MT-6, and MT-13; MT-3, MT-4, MT-5, and MT-7 render as point estimates labeled without intervals in MVP.
MT-13: Comparative Win Rate = comparison samples where client brand is recommended / comparison eligible samples. No comparative rank metric exists: position inside comparison answers mirrors prompt order (the template names the client first), so it is not reported.

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

### 8.16 Semantic layer: the Four P's and category archetypes (M11)

The next-stage organizing principle (D-051): every operator- and client-facing surface answers one of four client questions, called pillars — Presence ("Am I in AI's consideration set?"), Position ("When compared, do I win?"), Perception ("How does AI describe my brand?"), and Proof ("Is the story true — and sourced?"). The confidence machinery (k=5 sampling, Wilson intervals, n >= 30 gate, Stability Index) is deliberately NOT a pillar: it is the rail under all four. The intent taxonomy and all stored data are unchanged — the semantic layer sits on top.

SL-1: A pure `src/core` module defines the pillar taxonomy and maps every intent to exactly one pillar: discovery and consideration map to Presence, comparison to Position, validation and objection to Perception. Proof is fed by every response's claims and citations regardless of intent.
SL-2: A `METRIC_GLOSSARY` in `src/core` is the single source of truth for every metric key: human label, pillar, the client question it answers, plain-language definition, computation summary, interval caveat (per D-023), and direction-of-good. A completeness test fails if the analysis layer emits a metric key with no glossary entry.
SL-3: The run page's metrics preview renders glossary labels grouped by pillar with one-line meanings. Raw metric keys never appear in any UI.
SL-4: The matrix board shows each cell's pillar, and the approval view summarizes pillar coverage (cells per pillar), making question coverage a visible editorial decision.
SL-5: Dashboard sections and report chapters are headed by pillar and phrased as the client question they answer.

Category archetypes fix the B2B-jargon defect found in the Heytea pilot (prompts asked which "bubble tea vendors are worth a demo"):

AT-1: Intake basics gains a required "how do buyers get this?" archetype selection: `b2b`, `consumer_product`, or `consumer_venue`. Stored on `projects` via migration; existing projects default to `b2b`.
AT-2: `prompt_templates` gains an `archetype` column via migration. The seed provides three packs (5 intents x >= 3 variants each); matrix generation selects only templates matching the project's archetype.
AT-3: Templates must read as natural buyer language for their archetype, enforced by a per-archetype forbidden-jargon test (e.g. consumer packs may not contain "vendor", "demo", "procurement", "teams evaluating") — same pattern as RB-5's forbidden-phrase test.
AT-4: Approved matrices are untouched (C-4); archetype affects only new template selection and generation.
AT-5: The allocator (PM-2, PM-3, PM-11) is archetype-agnostic; quotas and redistribution behave identically for every pack.

### 8.17 Trust and provenance (M12)

The statistical-honesty differentiator, made visible at the point of consumption. The client's core anxiety — "are these numbers computed from real LLM answers, or made up?" — is answered structurally, not rhetorically.

TP-1: Every aggregate claim in the generated report carries its n, provider set, grounding mode, and run date inline.
TP-2: The report gains an evidence appendix: each finding cites at least one quoted raw-response excerpt with its response id, escaped per D-040.
TP-3: A methodology chapter is auto-generated from the metric glossary plus the run's actual configuration (k, caps, interval methods per D-023, eligibility definition per D-014).
TP-4: Every dashboard metric card offers provenance drill-through: metric to the eligible raw responses behind it, <= 2 clicks, reusing the DB-2 drilldown machinery.
TP-5: No aggregate number renders anywhere — dashboard, run page, report, export — without its n.

### 8.18 Pillar visual system and navigation (M13)

The pilot proved features can exist and stay invisible (the operator ran a full audit without discovering the dashboard or exports), and the M11 semantic layer proved a taxonomy can exist and stay invisible too — pillar logic was wired but not apparent at a glance. M13 makes the Four P's the dominant visual structure (D-055). The original M13 scope (OX-1..6) is split across M13-M15; every OX requirement survives below with its new home.

OX-1 (M13): A persistent per-project subnav (Matrix, Runs, Dashboard, Report) with active state on every project page; breadcrumbs stay. Intake lives at /projects/new and is not a subnav item.
OX-3 (M13): Every page has deliberate empty, loading, and error states; no dead ends.
OX-4a (M13): The dashboard reorganizes into four numbered pillar sections (01 Presence - 04 Proof), each framed with its client question, a structural spine, and its metric cards and views grouped inside; the confidence rail renders as a distinct footer band, never a fifth pillar (D-051).
OX-4b (M13): The matrix board groups cells into the same numbered pillar sections with intent sub-headers inside; pillar coverage counts render in the toolbar. Proof has no cells — a note explains every cell feeds it.
VS-1 (M13): Pillar identity is structural first (numbering, framing, spine) plus four muted structural tints defined as tokens (D-055); the tints never style actions, verdicts, severity, or emphasis — signal orange remains the only accent (V-2 intact).
VS-2 (M13): Shared PillarSection/PillarChip components in /src/components render pillar identity everywhere; no surface hand-rolls its own pillar styling. Pillar metadata stays in /src/core (C-7).

### 8.18a Competitive spectrum (M14)

The dashboard reads only persisted metric rows (D-032), and those are client-scoped only — so "Heytea vs each competitor" is a data-layer milestone, not chart styling.

CS-1: recomputeMetrics emits a per-brand scope (scope_type `brand`, scope_key = brand id) for every tracked brand under the same D-054 frames: unbranded mention rate, unbranded mention share (the per-competitor Share of Voice, closing the M5 gap and OX-4's second half), avg first position, and comparative win rate. No migration — metric rows are disposable (C-5).
CS-2: Position gains a head-to-head bar chart (comparative win rate per brand) and Presence gains an open-field bar chart (mention share per brand); "rest of the field" grouping is removed. Charts follow the chart rules: client in accent, competitors in stepped ink alphas, wrappers only (C1.6).
CS-3: The report's Position chapter gains the per-competitor table with provenance; a brand_metrics CSV joins the export set.
CS-4: Per-bar drill-through shows the brand-scoped responses behind the figure (TP-4 machinery).
CS-5: An independent SQL spot-check verifies at least two per-brand figures against the raw tables.

### 8.18b Explanatory layer (M15)

What each pillar's prompts do, answered where the operator decides.

EL-1: PILLARS metadata gains businessValue and feedsMetrics (derived from metricIntentFilter, never duplicated); matrix pillar section headers expand to show the client question, what the prompts do, the business value, and exactly which metrics the cells accumulate into.
EL-2: A sample-budget panel at generation/approval shows, per pillar, cells x k x engine-modes = expected n against the n >= 30 gate, live as cells are added and removed — the operator rebalances allocation deliberately per audit instead of PM-2 changing globally (resolves the S-024 open question).
EL-3: Per-cell affordance shows which metrics that cell's intent feeds.
OX-2 (M15): Guided pipeline: every stage page states where the project is and offers the single primary next action.
OX-5 (M15): Demo-readiness: the seeded demo project walks every view end-to-end with real-shaped mock data at $0 spend.
OX-6 (M15): Jargon pass: operator-facing terms (cell, rep, engine-mode) get inline glossary explanations.

### 8.19 Layer identity and Resonance presentation (M16)

FL-1: A pure core mapping (`src/core/funnel.ts`) assigns pillars to funnel stages: Presence -> Upper, Position + Perception -> Mid, Proof -> trust rail (never a stage), lower funnel fed by resonance metrics only. Additive over D-051; no pillar/metric/intent renames.
FL-2: Dashboard and matrix pillar sections display their funnel-stage chip; Proof displays "TRUST RAIL". Chips are structural (badge tokens), never a new accent (V-2).
FL-3: The app presents as Resonance; Parallax remains the engine name. No repo/package/identifier renames.
FL-4: A shared `SimulatedBadge` component exists; every simulation surface added in M17+ must render it (C-12).
FL-5: Project subnav gains a Resonance item from M16 (stub until M17); glossary gains funnel-stage and simulated terms.

### 8.20 Simulation Layer: resonance studies and synthetic panel runs (M17-M18)

RS-1: A resonance study = named panel personas x 2-3 stimulus variants (`measured_ai | corrected | repositioned | custom`), with one designated baseline. Persona fields: age and income band (the paper-validated conditioning axes) plus location and behavioral profile (prompt context that aids role-play coherence, never presented as validated segmentation — D-066); no gender/ethnicity fields (C-14).
RS-2: `measured_ai` stimuli must cite stored raw response ids from the same project (C-13); evidence-conditioning is mandatory at approval — no operator toggle can bypass it (D-078 removed the "unconditioned" toggle entirely). GENERIC now renders only on studies approved before D-078, kept for historical accuracy on every surface and export; no current workflow can produce a new one.
RS-3: Approval compiles the study into a frozen `matrix_versions` row (`kind='resonance'`) with one cell per persona x stimulus (`intent='simulation'`); C-1 cap applies; PM-2/PM-8/PM-9/archetype logic is bypassed by design (stimuli legitimately contain brand names).
RS-4: Resonance runs reuse the run/job/worker pipeline unchanged: run modes, k semantics, C-9 mock separation, cost guards, breaker, events. Runs display a SIM badge everywhere runs are listed. EXCEPTION: generation mode stays locked to exactly ONE (resonance metric scopes carry no mode dimension). Provider count was originally capped at one too (D-067 — each model is a distinct synthetic population, the paper reports engines separately) but D-080 (M24) lifted that cap: a resonance run now accepts >=1 providers, with every metric computed strictly within one provider's own samples (`resonance_variant`/`resonance_delta` scope keys become `<stimulusId>|<providerId>`, `resonance_variant_persona` becomes `<stimulusId>|<personaKey>|<providerId>`) so distinct engine populations are never pooled. The results page, report, and CSV export render one block per engine; no cross-engine comparison UI or pooled numbers exist anywhere.
RS-5: Elicitation prompts request a free-text reaction and never a numeric rating (the validated SSR elicitation; direct Likert elicitation is a known-failed baseline).
RS-6: SSR scoring converts each response to a 5-point PMF via embedding similarity against versioned anchor statement sets (target 6 sets — the paper's main setup — with >=4 as the floor; averaged; min-subtraction normalization). Scores are stored as versioned `extractions` rows discriminated by `extracted_json.kind='ssr'` (the integer `schema_version` column is unchanged — D-066); re-scoring creates a new version (C-3). Anchor sets are checked-in fixtures carrying a `calibrated` flag — `purchase_intent.v1` ships uncalibrated and the report method section must say so; a study pins its anchor version at approval.
RS-7: Embeddings are a provider capability (`EmbeddingProvider`, `EMBEDDING_PROVIDER` env, OpenAI `text-embedding-3-small` first) with spend counted in projection, the per-run cap, and daily budgets (C-2, D-022 pattern). Mock runs are fixture-backed and never call a live embedding engine.
RS-8: Resonance metrics (disposable, C-5) compute per-variant and per-variant-x-persona PMFs, mean purchase-intent point estimates (no invented intervals — D-023), and delta-vs-baseline rows. ΔPI is always framed as a Likert-scale purchase-intent mean shift vs baseline — a survey construct, never a purchase-probability or conversion claim (D-066). Variant aggregates obey the n>=30 gate (default study shape: 6 personas x k=5 = 30 per variant); persona slices are always directional-only.
RS-9: Audit metrics and resonance metrics never cross-contaminate: recompute dispatches on matrix kind, and wall tests prove an interleaved project keeps audit rows byte-identical (C-12). The wall extends to shared UI plumbing FROM M17 (D-068, the milestone that first produces completed resonance runs): audit dashboard/report run selectors filter `kind='audit'`, audit report generation and all export/print routes reject resonance runs until M19's dispatch, and the OX-2 next-action pipeline state is computed from audit-kind rows only.

### 8.21 Simulation Layer: results, report, exports, demo (M19)

RR-1: A Simulation Layer results view shows variant ranking (PMF distributions), the delta table per segment, and deterministic highest/lowest excerpt panels (D-061 pattern, no LLM summarizer); every panel SIMULATED-badged.
RR-2: Drill-through from any resonance figure reaches the exact eligible responses (shared eligibility function with recompute) in <=2 clicks (TP-4 pattern).
RR-3: Resonance runs generate their own report sections (`resonance_method`, `resonance_results`, `resonance_evidence`) via deterministic templates (D-033) with model-origin text escaped (D-040) and C-14 language enforced by an extended forbidden-phrase test (RB-5 pattern). The method section must state: anchor-set version and its calibration status (uncalibrated in v1), that stimuli are text-only (the paper's image-stimulus setting performed mildly better — a known limitation, D-066), and that ΔPI is a Likert-scale survey-construct shift, not predicted buying behavior.
RR-4: Exports: markdown, print-HTML, JSON evidence, and CSV (formula-injection guarded, D-045); the evidence archive works on resonance runs.
RR-5: `pnpm demo:resonance` walks a seeded demo study end-to-end at $0 (idempotent, D-059 pattern); the project next-action banner surfaces the resonance step once an audit run completes.

### 8.22 Value-add layer: study template packs (M20)

VA-1: Four seeded study templates — AI-framing repair (default, the C-13 flagship), promo framing, price presentation (framing only, never absolute willingness-to-pay), message/claim variants — each a stimulus scaffold plus test-before-you-spend guidance copy.
VA-2: Template placeholders must be resolved before approval; pack copy is covered by the C-14 forbidden-phrase test.
VA-3: An adversarial hardening checklist (C-12/C-13/C-14 sweeps, budget chaos, injection, kill/resume) and a fresh-clone internal demo close out the internal build (see `RESONANCE_BUILD_PLAN.md` M20).

### 8.23 Layer identity: Evidence Layer / Simulation Layer (M21)

A first-time client met three competing vocabularies at once — pillars, funnel stages, pipeline terms — and saw "Resonance" mean both the whole product umbrella and one sub-tab, even though the C-12 epistemic wall already existed in code. D-077 resolves this by naming two product-facing epistemic layers and retiring the upper/mid/lower funnel framing (superseding 8.19's FL-1/FL-2 framing language); this is presentation-only, following the D-063 precedent — no pillar, metric, or intent rename, no schema change, no migration.

LI-1: `src/core/funnel.ts`'s label strings and `funnelStampForPillar` are rewritten so audit pillars stamp "EVIDENCE LAYER" and Proof keeps "TRUST RAIL"; the dormant lower-stage label now leads with "Simulation Layer". The underlying `FunnelStage` type and its `"upper"|"mid"|"lower"` internal values are unchanged (non-rendered internals, D-077).
LI-2: The "Resonance" umbrella-vs-subtab naming collision is resolved: the project subnav tab, the simulation page's h1/empty-state/breadcrumb/results heading, the print and markdown report titles, the `RESONANCE_REPORT_SECTIONS` titles and method-section body text, the SIMULATED badge line, the Settings embedding-engine caption, and the run-form's D-067/D-080 caption all rename to "Simulation". The umbrella brand (app title, login h1, nav mark) stays "Resonance", explicitly untouched — as does the `resonance` route segment.
LI-3: The glossary's "funnel stage" term is redefined around the Evidence Layer / Simulation Layer split.
LI-4: A full metrics recompute stays byte-identical pre/post the copy change, proving the milestone touched presentation only.

### 8.24 Test-DB isolation + evidence-only studies (M22)

Two independent hardening items shipped together (D-078), closing a live operational hazard and a real C-13 gap.

TI-1: `pnpm test` runs every DB-backed test against a fresh, ephemeral, embedded-Postgres instance, never the shared dev DB — closing the D-073 hazard where the test suite's `claimJobs` calls could claim and corrupt a real queued run's jobs mid-session. Any startup failure overrides `DATABASE_URL` to a guaranteed-unreachable string (fail closed) rather than leaving it unset, so a broken embedded-PG degrades the same way "no Postgres installed" already does, and never silently falls through to the dev DB.
TI-2: `pnpm test:db` boots the same ephemeral instance standalone in the foreground for manual poking, mirroring `pnpm db:dev`'s UX.
EO-1: A `measured_ai` resonance stimulus with real stored evidence is unconditionally required for study approval (C-13) — the `genericUnconditioned` operator toggle and its RPC-reachable form field are removed entirely; no flag, UI or otherwise, can bypass the evidence requirement at approval.
EO-2: Historical GENERIC studies approved before this milestone keep rendering truthfully (export label, report badge, CSV column) — kept deliberately for historical accuracy, never reachable for new approvals.
EO-3: A template-pack draft lacking a measured_ai baseline shows a plain-language readiness requirement at approval time instead of a raw server error.

### 8.25 Coverage contract + price/promo templates (M23)

An audit of the default template set found zero of the 45 seeded prompt templates mention price, cost, deals, offers, or discounts, so two of the four value-add study packs (price presentation, promo framing) could never draw real Evidence Layer support for their `measured_ai` baseline (D-079). This section closes that gap with a checkable coverage contract plus opt-in templates that leave the default 40-cell allocation, golden dataset, and mock-e2e expectations provably unchanged.

CV-1: A pure `FrameAspect` taxonomy (presence, positioning, perception_attributes, factual_claims, pricing, promotions) tags every seeded prompt template — defaulted from the template's intent, with an explicit per-row override where a template's evidentiary content diverges from its intent's usual meaning.
CV-2: Each study template pack declares a `requiredAspect`; `evaluatePackCoverage` cross-checks a pack's requirement against the project's actual cell coverage and stamps ok/gap, rendered as an informational "Simulation coverage" panel on the matrix board (never a block, D-058 precedent).
PP-1: Six opt-in price/promo prompt templates (one price + one promo per archetype) seed with `active:false`, so `getMatrixInputs`'s active-only filter guarantees zero effect on the default allocation until an operator explicitly flips them on via a per-archetype "Activate {aspect} templates" board control.
PP-2: The price_presentation and promo_framing study template packs each ship a pre-filled `measured_ai` baseline slot so they can satisfy 8.24's EO-1 hard evidence rule once the operator attaches a real response.

### 8.26 Multi-provider resonance (M24)

D-067 (8.20's RS-4) restricted a resonance run to exactly one generation engine-mode because pooling two engines' PMFs into a single variant mean would silently merge two distinct synthetic populations — the C-12 failure mode one level down. D-080 lifts that provider restriction (generation mode still stays locked to exactly one) by extending the same never-pool discipline to the provider dimension rather than avoiding it with a hard cap.

MP-1: A resonance run now accepts >=1 providers; generation mode remains locked to exactly one, since resonance metric scopes still carry no mode dimension.
MP-2: Every resonance metric computes strictly within one provider's own samples: `resonance_variant`/`resonance_delta` scope keys become `<stimulusId>|<providerId>`, `resonance_variant_persona` becomes `<stimulusId>|<personaKey>|<providerId>`; a provider's ΔPI baseline subtracts only its own baseline mean, never another provider's.
MP-3: The results page, report (`ResonanceReportContext.providerSections`), and `resonance_metrics.csv` (new `providerId` column) each render one block per engine; no cross-engine comparison UI or pooled numbers exist anywhere in the product.
MP-4: A one-shot, repeatable `pnpm recompute:resonance` sweep migrates existing resonance runs' metric rows to the new composite scope-key format without touching audit-run metrics.

### 8.27 prompt_cells freeze-trigger DB backstop (M25)

Infrastructure hardening, not a client-facing feature — matches the compact treatment of 8.14/8.15. M25's operator-scoped deploy/Sentry/grounded-provider work was explicitly deferred by operator decision; the ops track instead delivered this DB-level closure of a real gap: C-4 ("approved matrices are frozen") was application-enforced only (`assertDraft()`), so a raw migration, script, or a future code path that forgot to call the guard could still mutate a frozen `prompt_cells` row with nothing to stop it (D-081).

FT-1: Migration 0010 adds a Postgres trigger rejecting direct UPDATE/DELETE on `prompt_cells` rows whose parent `matrix_versions.state` is `approved` or `superseded`; draft-state rows and all INSERTs remain fully mutable.
FT-2: A transaction-scoped `SET LOCAL app.bypass_cell_freeze` GUC (never a session-level `SET`, which would leak onto a pooled connection's next unrelated query) provides a narrow test-only escape hatch for fixture teardown, used only by dedicated helpers in `matrix.test-helpers.ts`.
FT-3: A same-week hotfix (D-083, migration 0011) corrected a bug in the trigger itself (`RETURN OLD` on `UPDATE`, which silently discarded legitimate draft-cell edits) — TG_OP branching now returns NEW on UPDATE and OLD on DELETE.

### 8.28 Calibration protocol + comparison harness (M26)

`purchase_intent.v1` ships uncalibrated (D-066) until independently validated against real human survey data, which does not exist yet. This section builds the measurement machinery for that future benchmark without pretending a benchmark has happened (D-082) — infrastructure ahead of data, not a user-facing feature, so it gets the compact 8.14/8.15-style treatment rather than the full requirement-list prose.

CL-1: `CALIBRATION_PROTOCOL.md` defines the survey design (direct five-point Likert rating from human respondents shown the identical stimulus text), minimum sample guidance (n>=30 per stimulus, >=8 distinct stimuli), the paired human/SSR PMF fixture format, and section-6 acceptance thresholds for flipping a new anchor set's `calibrated:true` (Pearson r >= 0.6, mean absolute error <= 0.5, mean Wasserstein-1 <= 0.75, n>=30 per counted stimulus, >=80% directional sign agreement) — labeled explicitly as this protocol's own floor, not a figure borrowed from the SSR paper.
CL-2: A pure `src/core/calibration.ts` (`computeCalibrationSummary`) computes per-stimulus and aggregate Pearson r, mean absolute error, and a closed-form Wasserstein-1 distance from paired human/SSR PMF observations — no DB, no network call, no new dependency.
CL-3: No script invokes the harness against real data, and `purchase_intent.v1` stays `calibrated:false` — a deliberate stop-line until real human-benchmark data exists (flipping calibration on a synthetic self-comparison would be exactly the invented-precision variance theater D-023 exists to prevent).

### 8.29 Post-intake Setup editing (M27)

Post-completion intake editing was explicitly out of MVP scope with no resolution path (`projects/new`'s own code comment): the operator had no way to view or change competitors, category, personas, markets, or the fact sheet once intake finished. Reopening the intake wizard was rejected because its completion path deletes and reinserts normalized rows with new UUIDs (D-026), which would orphan `prompt_cells.persona_id`/`market_id` and `brand_mentions.brand_id` foreign keys the moment any matrix, run, or extraction already exists (D-084).

SU-1: A dedicated `/projects/[id]/setup` page (row-level, not the wizard) lets an operator view and edit competitors, personas, markets, attributes, and the fact sheet after intake completes. Every edit is an UPDATE keyed by the existing row id, preserving identity for every downstream foreign key.
SU-2: "Remove" archives rather than deletes for brands/personas/markets (nullable `archived_at`, migration 0012) and fact claims (the existing `factClaimStatus` enum, since `claims_found.fact_claim_id` FK-blocks a real delete); attributes, which carry no foreign key anywhere, get a real delete. The client brand can never be archived (server-enforced).
SU-3: Generation-input reads (`getMatrixInputs`, and both PM-9 scan call sites) exclude archived rows; historical label-resolution reads (`getPersonaLabelsForProject`/`getMarketLabelsForProject`, `regenerateCell`'s own cell-specific lookups) remain archived-inclusive so existing matrix cells keep readable labels.
SU-4: Zero active competitors blocks new comparison-intent generation with a clear server-side error instead of silently rendering an empty competitor list; the matrix board warns when a draft matrix predates the project's most recent Setup edit (`projects.setup_updated_at`), never on approved versions (C-4 — frozen evidence is never flagged stale).
SU-5: `/projects/new` redirects a non-draft project id to `/projects/[id]/setup` instead of `/projects`.

### 8.30 Buyer-voice guard + JTBD field clarity + template grammar fix (M28)

PM-9 (D-046) only ever caught brand NAMES contaminating prompt inputs, never brand- or business-GOAL language. An operator-reported bug — a marketing-objective `job_to_be_done` value ("Penetrate traditional DSLR consumer segment") producing a grammatically and evidentially broken prompt — showed PM-9's other half was missing (D-085).

BV-1: `findBusinessVoicePhrases` flags business/brand-goal phrasing (penetrate, capture, grow/expand/gain share, acquire/win customers, convert, dominate, target market, market share, grow revenue, increase adoption, scale to, launch into, plus a bounded "target ... segment" pattern) using the same word-boundary matcher PM-9's own brand-term check relies on, as a warning — never a block, matching PM-9's own precedent — at intake review and on Setup basics save.
BV-2: Every user-facing "Job to be done" label is renamed to "Buyer's goal (in their words)" with a hint contrasting a concrete buyer-goal example against a brand-goal example, on both intake and Setup (Setup's field previously shipped with no guidance at all, an M27 regression fixed here). The underlying `job_to_be_done` column/field identifier is unchanged — copy-only, no migration.
BV-3: Every `{job_to_be_done}` prompt-template slot across all three archetypes is rewritten to a noun-phrase-compatible framing, so one stored buyer-goal value reads grammatically in every template variant that interpolates it.

## 9. Data model summary

`projects`, `brands`, `fact_claims`, `attributes`, `personas`, `markets`, `prompt_templates`, `matrix_versions`, `prompt_cells`, `audit_runs`, `jobs`, `responses`, `extractions`, `brand_mentions`, `claims_found`, `provider_credentials`, `metrics`, `findings`, `report_sections`, `run_events`; from M17: `resonance_studies`, `resonance_stimuli` (migration 0008, which also adds the `simulation` value to the `intent` enum, `matrix_versions.kind`, `matrix_versions.resonance_study_id`, `prompt_cells.stimulus_id`, and `prompt_cells.panel_persona_key`; `prompt_cells.persona_id`/`market_id` are already nullable — D-066).

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
11. Every delivered audit has an archived evidence pack: the EX-3 export plus a redacted database snapshot stored off-Render, recorded in the release checklist (D-024).

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
| M8 | Live validation: DeepSeek + extraction mini-audit | 5 cells x k=2 under $2 cap; validation labels visible; breaker fires | Done |
| M9 | Provider expansion and hardening | Target grounded providers added through same interface; provider-down degrades gracefully | Done |
| M10 | Pilot audit | Full live audit delivered; retro logged; release checklist complete | In progress — DeepSeek gate closed (115-job live run, 2026-07-03); deploy + grounded-provider gates open |
| M11 | Semantic layer: Four P's, metric glossary, archetype template packs | Every emitted metric key has a glossary entry and no raw key renders in UI; archetype packs seeded and selected at intake; pillar visible on matrix, run, dashboard, and report surfaces | Done |
| M12 | Trust and provenance | Report claims carry n/provider/mode/date; evidence appendix quotes raw excerpts by response id; methodology chapter auto-generates; metric-to-responses drill-through <= 2 clicks | Done |
| M13 | Pillar visual system + navigation | Numbered pillar sections with spines/tints on dashboard and matrix; per-project subnav on every project page; V-2 intact (orange stays the only accent) | Done |
| M14 | Competitive spectrum | Per-brand metric scope under D-054 frames; head-to-head and open-field bar charts replace "rest of the field"; per-competitor report table + CSV; SQL spot-check green | Done |
| M15 | Explanatory layer | Pillar business-value explainers in matrix; live per-pillar sample-budget panel vs the n>=30 gate; guided next actions; $0 demo walkthrough | Done |
| M16 | Layer identity + Resonance presentation | Funnel-stage chips on dashboard/matrix (renamed to Evidence Layer / Trust Rail stamps by M21, D-077); app presents as Resonance; SimulatedBadge exists; recompute byte-identical pre/post (presentation-only proven) | Done |
| M17 | Resonance studies + mock panel run | Migration 0008 clean on fresh+existing DB; study -> approve -> mock run completes storing raw responses, zero extractions; PM-9 bypass proven with branded stimulus; audit mock e2e still green | Done |
| M18 | SSR scoring + resonance metrics | Golden SSR math tests; mock run fixture-scored end-to-end, recompute idempotent; embedding spend in projection+budgets; C-12 wall tests green | Done |
| M19 | Simulation Layer surfaces + report + demo | Results view with <=2-click drill-through; resonance report sections + guarded exports; archive works; `pnpm demo:resonance` walkable at $0 | Done |
| M20 | Value-add packs + hardening + internal demo | Four template packs seeded; C-12/13/14 adversarial sweep logged; fresh-clone demo executed unassisted | Done pending operator sign-off walk (sweep + fresh-clone demo executed 2026-07-05; caught and fixed the drizzle-config env P1) |
| M21 | Layer identity: Evidence Layer / Simulation Layer copy | Funnel-stage stamps read `EVIDENCE LAYER`/`TRUST RAIL`; the "Resonance" umbrella-vs-subtab collision resolved to "Simulation" on the simulation surfaces only; recompute byte-identical pre/post (presentation-only proven) | Done |
| M22 | Test-DB isolation + evidence-only (kill GENERIC) | `pnpm test` runs DB-backed tests against an ephemeral embedded-Postgres instance, never the dev DB; C-13 approval guard is unconditional (no genericUnconditioned escape) while historical GENERIC rows still render truthfully | Done |
| M23 | Coverage contract + price/promo templates | Matrix board shows an ok/gap "Simulation coverage" panel per resonance study pack (D-058 precedent, never a block); price/promo audit templates exist and are activatable but ship opt-in so default 40-cell allocation, golden dataset, and mock-e2e stay unchanged; price_presentation/promo_framing packs get a measured_ai baseline slot so they're approvable | Done |
| M24 | Multi-provider resonance (supersedes D-067) | A Resonance run accepts >=1 providers (mode still locked to exactly 1); each provider is scored as its own synthetic population — variant/persona/delta scope keys carry a `\|providerId` suffix, ΔPI baselines computed within each provider's own samples, never pooled; results page/report/CSV render one section per engine; dev-DB sweep recomputes historical resonance runs to the new key format idempotently with audit runs untouched | Done |
| M25 | Ops & deploy (reduced to hardening residue by operator decision) | Render deploy, Sentry wiring, and grounded-provider validation deferred by operator decision — out of scope this sprint. Residue delivered: migration 0010 adds a DB trigger blocking direct UPDATE/DELETE on `prompt_cells` rows whose parent `matrix_versions.state` is 'approved' or 'superseded' (C-4 DB backstop, D-081); a transaction-scoped `SET LOCAL` bypass GUC plus a shared `matrix.test-helpers.ts` keeps ~11 DB-backed test files' fixture teardown working; the M3 tamper test now also asserts DB-level rejection | Done (residue only — deploy/Sentry/grounded items remain open, deferred) |
| M26 | Calibration spike | `CALIBRATION_PROTOCOL.md` committed (survey design, n>=30-per-stimulus sample guidance, paired-data fixture format, section-6 acceptance thresholds for flipping a NEW anchor version's `calibrated:true`, honest limits); pure `src/core/calibration.ts` comparison harness (Pearson r, per-stimulus MAE, closed-form Wasserstein-1) with hand-computed unit tests (perfect match r=1; shifted case MAE=1.0, meanW1=1.0, r=11/14); `fixtures/calibration/example-paired.json` marked SYNTHETIC; `purchase_intent.v1` stays `calibrated:false`; no UI, no script invoking the harness (deliberate stop-line — no real human data yet) | Done |
| M27 | Post-intake Setup editing | Dedicated `/projects/[id]/setup` page (row-level, archive-not-delete) lets an operator view/edit competitors, personas, markets, attributes, and the fact sheet after intake completes, without reopening the intake wizard (D-026 UUID-churn FK-orphan risk); migration 0012 adds `archived_at`/`setup_updated_at`; the two-reads trap (generation-input excludes archived, label-resolution includes it) is enforced at `getMatrixInputs`; zero-active-competitor and stale-draft guards surface on the matrix board | Done |
| M28 | Buyer-voice guard + JTBD field clarity + template grammar fix | A new PM-9-pattern warning (never a block) flags business/brand-goal phrasing in `job_to_be_done` at intake review, and on Setup basics save; the field is relabeled "Buyer's goal (in their words)" everywhere with a buyer-vs-brand-goal hint+placeholder (Setup's own field, which shipped with none, was the M27 regression); every `{job_to_be_done}` template slot across all three archetypes is noun-phrase-compatible so one stored buyer-goal value reads grammatically in every variant | Done |
| M29 | Pause/cancel observability hotfix | A manually-paused run now logs an `operator_paused`/`operator_cancelled` event and the run page shows a plain-language reason instead of a bare stamp when a run is paused with no explanatory event on record; small enough that it received no Decision Log entry (BUILD_NOTES S-058 only, same precedent as the D-083 hotfix) | Done |

Progress notes:

- 2026-07-09 M28 done (D-085, no migration). Buyer-voice guard: `findBusinessVoicePhrases` (src/core/matrix.ts) — PM-9's "other half" — flags business/brand-goal phrasing (penetrate, capture, grow/expand/gain share, acquire/win customers, convert, dominate, target market, market share, grow revenue, increase adoption, scale to, launch into, plus a "target ... segment" pattern) via the same word-boundary `containsPhrase` helper PM-9's own `findBrandTerms` relies on (D-062 finding 3 lesson: no naive substring matching). Wired as a warning at the same three moments PM-9 itself uses: intake review (`review.tsx`, alongside the existing brand-term block; NOT live-as-you-type in step-forms, matching PM-9's own review-only surfacing), and Setup basics save (`scanBasicsForBusinessVoice` in `modules/setup/actions.ts`, a sibling to `scanBasicsForBrandTerms`, combined into the same `warning` slot when both fire). Field relabel: "Job to be done" -> "Buyer's goal (in their words)" in intake step-forms, Setup, and every warning-message label string (review.tsx, actions.ts, matrix/board.tsx prose) — `job_to_be_done` the column/schema/identifier is untouched (copy-only). Setup's field gains the hint+placeholder it never had (the M27 regression) matching intake's own, both now spelling out a concrete buyer-goal vs brand-goal contrast. Grammar fix: of the 8 `{job_to_be_done}` template rows (all in `discovery`, across b2b/consumer_product/consumer_venue), 2 were verb-phrase-framed ("...trying to {job_to_be_done}?", "...who wants to {job_to_be_done}?") and were rewritten to noun-phrase-compatible framings ("...working on {job_to_be_done}?", "...focused on {job_to_be_done}?"); the other 6 already accepted a noun phrase. No opt-in M23 price/promo template (v4/v5) uses `{job_to_be_done}`, so none needed changes. New `src/core/prompt-templates.test.ts` pins the zero-verb-phrase-framing regression.
- 2026-07-09 M28 verification: D-016 fixture-hash risk assessed and found NOT to affect golden tests (`golden.test.ts` keys fixtures by `fixtureId` against hand-authored response text, entirely independent of resolved-prompt text) nor `test:mock-e2e` (its 6 checks are pipeline-behavior invariants — no duplicate job_id, terminal state, retry/reclaim events logged, elapsed budget — none content-dependent); an approved matrix's stored `resolvedText` is frozen (C-4) regardless, so only future draft generation is affected. `pnpm exec tsc --noEmit`/`pnpm lint` clean (`pnpm lint` repo-wide surfaces the same pre-existing unrelated stray-worktree warning noted in S-055/S-056, not from this branch). `pnpm test`: 481 passed/12 skipped (73 files, up from 471/12 — 8 new `findBusinessVoicePhrases` tests, 1 new Setup-action warning test, 3 new `prompt-templates.test.ts` tests). `pnpm test:golden` 36/36. `pnpm test:mock-e2e` 6/6 PASS, run against a separately-booted `pnpm test:db` ephemeral instance with an explicit `DATABASE_URL` override (D-073/M23/M27 precedent — never the dev DB). `pnpm build` skipped (`:3000` occupied by the operator's dev server; verified via typecheck+lint+tests instead). Live-rendered a sample resolved sentence via a throwaway script calling the real `renderTemplate`/`TEMPLATE_SEED`: the exact reported bug ("Penetrate traditional DSLR consumer segment") reproduces the broken sentence pre-fix-in-spirit and `findBusinessVoicePhrases` catches it (`["penetrate"]`); the same template with a clean buyer-goal value ("night street photography") reads grammatically, as do both rewritten verb-phrase templates.

- 2026-07-09 M27 done (D-084, migration 0012 — additive, no backfill). New `/projects/[id]/setup` page + `SetupClient` (6 numbered sections), "Setup" leads the project subnav. `src/db/repositories/setup.ts`: every edit is an UPDATE by row id; every "remove" archives (brands/personas/markets via new `archived_at`; fact claims via the pre-existing `factClaimStatus` enum, since `claims_found.fact_claim_id` FK-blocks a real delete) except attributes (no FK anywhere, matched by name string — real delete). Client brand archive is server-rejected. `getMatrixInputs` (the sole generation-input read) now filters `archived_at is null`, correctly narrowing what `generateMatrix`/`addCell`/`regenerateCell`'s new-combo loops and both PM-9 scan call sites see; two new archived-inclusive lookups (`getPersonaLabelsForProject`/`getMarketLabelsForProject`) keep the matrix board's historical cell labels and `regenerateCell`'s own cell-specific persona/market resolving correctly after archiving. Every other brand/persona/market/attribute consumer (dashboard, findings, extraction, metrics, export, the misinformation register) needed zero changes — already archived-inclusive by construction. `getProjectFactClaims` gets the one new filter (`status='active'`), wiring the previously-dormant `factClaimStatus` enum's first consumer. Guards: zero active competitors blocks comparison-intent generation server-side with a clear error (was previously a silent empty `{competitor_list}`); every Setup mutation touches `projects.setup_updated_at`; the matrix board warns when a draft predates the last Setup edit (approved versions never do, C-4). `projects/new/page.tsx` now redirects non-draft projects to `/projects/${id}/setup`.
- 2026-07-09 M27 verification: `pnpm exec tsc --noEmit`/`pnpm lint` clean (one pre-existing unrelated worktree lint warning, not from this branch). `pnpm test` 471 passed/12 skipped (72 files, up from 462/12), run twice consecutively, identical. New tests: `src/db/repositories/setup.test.ts` (6 — row-identity preservation across a persona rename, archived-vs-label-resolvable read split, client-brand archive rejection, `setup_updated_at` touch, PM-9 active-terms exclusion, stale-draft true/false) and `src/modules/setup/actions.test.ts` (3 — id/empty-name guards, PM-9 basics-save warning). One pre-existing test updated (not changed in behavior): `matrix/actions.validation.test.ts`'s explicit `@/db/repositories/matrix` mock needed the two new label-lookup exports added. Migration 0012 applied clean to the ephemeral test DB (automatic) and the dev DB (`pnpm db:migrate`). `pnpm test:mock-e2e`: 5/6 checks pass across 3 runs (terminal state, no duplicate responses, retries logged, elapsed budget, run completes); the stale-lock-reclaim check failed all 3 times, confirmed pre-existing and unrelated via an empty `git diff m26-calibration...HEAD` on all worker/runner/reclaim paths. `pnpm build` skipped (`:3000` occupied by the operator's live dev server — starting a second Next process risks the shared-`.next` corruption D-075 already hit once).

- 2026-07-08 M24 done (D-080, supersedes D-067, no migration). Each Resonance-run provider is now scored as its own synthetic population: `recomputeResonanceMetrics` groups eligible SSR samples by `providerId` FIRST, then computes variant means/persona slices/ΔPI baselines entirely WITHIN that provider's own samples — scope keys became `resonance_variant`/`resonance_delta` = `<stimulusId>|<providerId>`, `resonance_variant_persona` = `<stimulusId>|<personaKey>|<providerId>`, with `providerId` also in `metadataJson`. The `getResonanceStudyResults` reader parses the composite keys and returns `providerGroups: ResonanceProviderGroup[]` (variants/personaRows/deltas per engine, evidence maps keyed with the provider suffix so one engine's responses never leak into another's variant card) plus a `providers: string[]` list; a single-provider run yields exactly one group. The D-067 "exactly one provider and one mode" guard (present in both `src/modules/runner/actions.ts` and its `src/db/repositories/runner.ts` PV-5 backstop) now rejects only `modes.length !== 1` — providers may be >=1. The run-creation form's `singleEngine` prop is renamed `singleMode`; providers render as a normal multi-select for Resonance while generation mode stays single-choice, with updated D-080 caption copy. The results page, report templates (`ResonanceReportContext.providerSections`), and `resonance_metrics.csv` (new `providerId` column, extracted from `metadataJson`) all render/export one block per engine — no cross-engine pooled numbers anywhere. Job/worker plumbing needed no change: `createRun`'s cartesian provider x mode x cell x rep job planner was already generic.
- 2026-07-08 M24 verification: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` clean; `pnpm test` 450 passed/12 skipped (66 files) against the ephemeral test DB, including a new `src/db/repositories/metrics.resonance.test.ts` DB-backed test that fabricates a two-provider ("mock" + "deepseek") resonance run directly (bypassing `createRun`'s C-9 mock-only-provider restriction, since a true multi-provider MOCK run is structurally impossible — the registry has exactly one mock provider id) with deliberately DIFFERENT per-provider baseline means (mock baseline mean=2 vs deepseek baseline mean=4.5): asserts 10 metric rows (4 variant + 4 persona + 2 delta, double the pre-M24 single-provider 5-row shape), each provider's delta computed against its OWN baseline (mock ΔPI=+2.0 aggregate n=30, deepseek ΔPI=+0.1 directional n=5 — a pooled/cross-provider implementation would have produced a materially wrong number here), independent per-(variant×provider) sufficiency gates, a stray pre-M24 bare-scopeKey row proven gone after recompute (no orphans), and byte-identical idempotent second-pass recompute. `pnpm test:mock-e2e` 6/6 PASS (run against a separately-booted ephemeral instance, dev DB untouched). Dev-DB sweep (`pnpm recompute:resonance`, a new one-shot script touching only the `metrics` table): found 7 existing resonance runs (not the ~5 estimated), recomputed all to the new composite-key format, second pass byte-identical for every run, and audit-run metrics rows (14,318 rows across 43 runs) numerically and per-run untouched before/after. Live read-only curl against a standalone build pointed at the dev DB (post-sweep) confirmed the results page renders an "Engine: deepseek" section header on a real single-provider resonance run (`heytea-be18` project) — no dev-DB run happens to be multi-provider yet (expected, since multi-provider didn't exist before this milestone), so the true multi-provider proof lives in the new DB-backed unit test.
- 2026-07-08 M24 judgment calls: (1) a full `createRun`-driven two-mock-provider E2E test is impossible without inventing a second mock provider id (C-9's `isProviderAllowedForRunMode` forces `providers === ["mock"]` for any mock run) — built the multi-provider proof as a direct-DB-fixture integration test instead (same established pattern as `wall.test.ts`/`service.test.ts`'s raw-insert fixtures that bypass the RPC layer), per the lead's own fallback instruction. (2) Kept the recompute-all sweep as a permanent `pnpm recompute:resonance` script (not a throwaway) since the build plan's "one-shot sweep... at deploy" language implies a repeatable deploy-time tool, matching the `archive:evidence` precedent. (3) `ResonanceStudyResults`'s flat `variants`/`personaRows`/`deltas` fields were replaced entirely by `providerGroups` (not kept alongside) to avoid two divergent shapes of the same data — every consumer (page, report/service.ts, tests) was updated in the same pass.

- 2026-07-08 M23 done (D-079, no migration). The Evidence-Layer -> Simulation-Layer coverage contract is now checkable: `src/core/prompt-templates.ts`'s `FrameAspect` taxonomy (presence/positioning/perception_attributes/factual_claims/pricing/promotions) tags every seed template (default from intent, explicit override where a template's content diverges — the six new price/promo templates); `RESONANCE_STUDY_TEMPLATES` declares each pack's `requiredAspect`; `src/core/coverage.ts`'s `evaluatePackCoverage` cross-checks the two and a new matrix-board panel stamps ok/gap per pack, informational only (D-058 precedent). Six opt-in price/promo audit templates (one price + one promo per archetype, inside `comparison`) seed `active:false` so the default allocation pool is structurally unchanged (`getMatrixInputs` only selects `active:true`); a new "Activate {aspect} templates" board control flips them on per-archetype when the operator chooses to. `price_presentation`/`promo_framing` (previously all-`custom` stimuli, unapprovable under M22's hard C-13 rule without manual operator intervention) each get a pre-filled `measured_ai` baseline slot.
- 2026-07-08 M23 verification: `pnpm lint`/`tsc --noEmit`/`pnpm build` clean; `pnpm test` 448 passed/12 skipped against the ephemeral test DB; seed run twice showed idempotent `51` templates (45 default + 6 opt-in, `active:false` confirmed by direct query); `pnpm test:mock-e2e` 6/6 PASS (run against a separately-booted ephemeral instance so the dev DB was never touched and no worker ran against it); `pnpm test:golden` 36/36. Coverage panel verified live (read-only authenticated curl against a standalone build, dev DB, no worker) on the real ledgerfox-demo project: ai_framing_repair and message_claim_variants stamp ok (14 and 8 cells respectively), price_presentation and promo_framing stamp gap (0 cells each) with their Activate control — reproducing the LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md 2c finding exactly, before either opt-in pack is activated.
- 2026-07-08 M22 done (D-078, no migration). Part A: `scripts/test-db.ts` boots an ephemeral embedded-Postgres instance on :5433 (distinct from the dev DB's :5432), migrates + seeds it, wired into `pnpm test` via vitest `globalSetup` (`scripts/vitest-global-setup.ts`) so every test run is isolated by construction — DATABASE_URL is always overridden, even on failure (to a guaranteed-unreachable string), closing the D-073 hazard for good. Part B: the C-13 approval guard in `approveAndCompileResonanceStudy` no longer consults `genericUnconditioned` at all (dormant for approval, kept only so historical rows render a truthful GENERIC label on reports/exports/results); the wizard's toggle and its RPC-reachable FormData field are removed; a template-pack draft lacking a measured_ai baseline now shows a plain-language readiness requirement instead of a raw server error.
- 2026-07-08 M22 verification: full suite green twice consecutively against the ephemeral DB (63/65 files, 439/451 tests, 12 graceful skips both runs); dev DB row counts (`audit_runs`, `resonance_studies`, `jobs`, `responses`, `projects`) byte-identical before/after. `pnpm lint`/`tsc --noEmit`/`pnpm build` clean. New regression test proves the C-13 hard rule at the repository/RPC level (not just UI): setting `genericUnconditioned: true` no longer bypasses the evidence requirement. Historical-label regression already existed (`src/core/resonance.test.ts`'s label-helper test) and is now annotated as the M22 historical-rendering proof.
- 2026-07-07 M21 verification: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (451/451, 65 files), `pnpm build` all green; recompute invariance proven on the LedgerFox demo project's most recent completed mock run (331 metric rows, byte-identical before/after a live `recomputeMetrics` call); grepped both `src` and the built `.next` output — zero remaining "Upper/Mid/Lower Funnel" occurrences, new "Evidence Layer"/"Simulation" copy present. V-2 one-accent held by construction (zero className/style changes this session).

- 2026-07-06 Post-M20 error-handling hardening (D-076, no migration): App Router `error.tsx`/`global-error.tsx`/`projects/[id]/error.tsx` boundaries render a shared token-backed `ErrorFallback` (Retry + route back, digest only, no stack/secret); a `reportError` observability seam (`src/observability.ts`, Sentry swap-in point, not wired); `.catch`/try added to every fire-and-forget client async path (dashboard run-switch, run-progress poll + pause/resume/cancel, extraction poll + recompute, drilldown, cost projection) so a transient failure keeps last data + shows inline retry instead of blanking; narrow try/catch → sanitized 500 on the three export routes (id/state guards from D-072 untouched). No ActionResult sweep, no new deps. Typecheck/lint clean, 18 DB-free tests pass (4 observability + sanitized-500 per export route). `pnpm build` + in-browser walk deferred (operator dev server on :3010 shares `.next`, D-075).
- 2026-07-05 M20 close-out: C-12 recompute-all sweep clean (35 runs, 0 violations); mock-e2e regression all PASS (injection + kill/resume); fresh-clone demo caught a real P1 — drizzle.config.ts ignored .env.local so db:migrate silently targeted the fallback DB — fixed via env-bootstrap import, then the clone ran migrate/seed/demos unassisted on a fresh database (23 resonance metrics, 90 SSR extractions). 298/298 tests green post-fix. Remaining: operator sign-off walk.
- 2026-07-05 Resonance roadmap: product restructured as Resonance (funnel presentation layer over the Parallax engine) with the lower-funnel synthetic panel and value-add template packs specified as M16-M20 (PRD 8.19-8.22, D-063/D-064/D-065, constraints C-12/C-13/C-14). Execution playbook with per-milestone steps, QA gates, and critical-bug risk tables written for handover: `RESONANCE_BUILD_PLAN.md`. M10 close-out (deploy, grounded providers, Gemini caveat) still runs as the parallel ops track and is unaffected.
- 2026-07-05 M16 done: Resonance identity is now product-facing in app chrome/title/login, with Parallax retained as the measurement-engine subtitle. `src/core/funnel.ts` adds the pure additive funnel-stage mapping; dashboard and matrix pillar sections render `UPPER FUNNEL`, `MID FUNNEL`, and Proof as `TRUST RAIL`.
- 2026-07-05 M16 verification: SimulatedBadge exists, `/projects/[id]/resonance` stub is linked from project subnav and carries `SIMULATED`; SSR curl confirmed required strings and no visible raw pillar ids; demo run recompute stayed byte-identical across two passes (312 rows). `pnpm lint`, `pnpm typecheck`, `pnpm test` (231 passed / 44 skipped), and `pnpm build` green.
- 2026-07-05 M16 scope note: no migration, no metric/math/schema changes. M17 starts the real `kind` discriminator work and must implement D-068 shared-plumbing wall guards before completed resonance runs can exist.
- 2026-07-05 M17 done: migration 0008 adds `resonance_studies`, `resonance_stimuli`, `matrix_versions.kind`, resonance study/cell links, and `intent='simulation'`; study builder now creates/edits personas and stimuli, compiles approved studies into frozen resonance matrices, and starts single-engine mock runs.
- 2026-07-05 M17 wall verified: audit matrix/dashboard/report/export/pipeline queries filter or reject resonance runs per D-068; resonance responses skip audit extraction and log the C-12 skip event. New integration test proves study -> approve -> mock run -> raw responses stored -> zero extraction rows.
- 2026-07-05 M17 verification: existing DB migration applied, fresh temp DB migration succeeded, `pnpm typecheck`, `pnpm lint`, `pnpm test` (283 passed), and `pnpm build` green. Local preview running at `http://localhost:3001` (`/projects/.../resonance` returned 200).
- 2026-07-05 M18 done: SSR scoring now routes resonance responses into versioned `extractions` rows with `extracted_json.kind='ssr'`; mock scoring is fixture-backed, live scoring uses the separate OpenAI embedding provider capability, and re-score creates a new extraction version.
- 2026-07-05 M18 metrics/cost wall: `recomputeMetrics` dispatches on matrix kind and emits only `resonance_variant`, `resonance_variant_persona`, and `resonance_delta` rows for resonance runs; live resonance projection, credential preflight, worker budget checks, and daily spend attribution include `EMBEDDING_PROVIDER` instead of the audit extraction engine.
- 2026-07-05 M18 verification: golden SSR/core/anchor/provider tests green; `CI=true pnpm test` passed (289 passed, including DB-backed resonance SSR/metrics and audit extraction tests), `CI=true pnpm lint`, `CI=true pnpm typecheck`, `CI=true pnpm build`, and `CI=true pnpm test:mock-e2e` passed.
- 2026-07-05 M19 slice: lower-funnel results render from the M18 resonance metric contract (`metadata_json.pmf`, `sufficientN`, `directionalOnly`) with SIMULATED-stamped ranking, ΔPI, persona slices, deterministic excerpts, and raw-response drill-through anchors.
- 2026-07-05 M19 report/export slice: resonance runs now dispatch to `resonance_method`, `resonance_results`, and `resonance_evidence` sections; markdown, print HTML, JSON, and resonance CSV exports are kind-aware and preserve PMF/SSR evidence.
- 2026-07-05 M19 verification: `pnpm demo:resonance` completed at $0 (90 responses, 23 metrics, 3 report sections); `CI=true pnpm test`, lint, typecheck, and build green; HTTP preview on port 3010 confirmed results/report/export markers. `archive:evidence` archives resonance runs without local `pg_dump` by writing a marked SQL data snapshot fallback; strict native dumps remain available with `ARCHIVE_REQUIRE_PG_DUMP=true`. Verified fallback archive exit 0 at `/tmp/resonance-archive-fixed`.
- 2026-07-05 M19 visual QA accepted in the in-app browser on the local preview; milestone closed as Done.
- 2026-07-05 M20 start: static value-add study template packs are being implemented without a migration; placeholder resolution and C-14 copy tests guard approval and pack language.

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
- 2026-07-03 M8 done: shared-password login (rate-limited, constant-time compare, stateless HMAC-signed cookie session — D-034) gating every route via `middleware.ts`; credential encryption service (AES-256-GCM, D-021) with a full Settings UI (ST-1..ST-5: add/rotate, verify against a real minimal live call, disable, delete, read-only env-sourced defaults panel); DeepSeek `LLMProvider` adapter with typed `ProviderCallError` mapping real HTTP failures to RN-6's error-type enum, resolved at call time via a credential-aware runtime resolver kept separate from the static display-only registry (D-035); per-provider daily-budget enforcement (C-2/D-012) wired into the worker's existing circuit-breaker pause path (D-037); live extraction engine (D-022) reusing the response's own generation provider (D-036), JSON-mode DeepSeek call graded against the same Zod schema and SM-2/SM-3 retry/dead-letter machinery as mock, billing every attempt whether or not it validates. `pnpm audit:deepseek-mini` built and safety-verified (exits cleanly with no DB/network activity when no credential is configured — the actual live run was intentionally never executed this session, pending the operator's real key). 182 tests total (30 new this milestone), lint/typecheck/build green.
- 2026-07-03 post-M8 hardening (external audit, branch m8-hardening): all eight audit findings confirmed and fixed. P1s: run mode is now an explicit, operator-selected boundary — the run form's DeepSeek exposure combined with `createRun`'s hardcoded `runMode: "mock"` could have stored real paid generations under MOCK semantics (D-038: server-side C-9 validation both directions, k=5 lock for live_audit, PV-5 all-skipped rejection, worker-level per-job guard); every provider call now carries a 45s `AbortSignal.timeout` kept under the stale-lock window, with `TimeoutError` correctly mapped (D-039); budget parsing fails closed on typos (D-039); cost projection now uses real average prompt length + per-call extraction estimates (D-039). P2s: credential base-URL overrides allowlisted against key exfiltration, and model-derived report text escaped at the template source against XSS through marked (D-040); C-7 "UI never imports providers" now lint-enforced with provider metadata flowing through a module action. 201 tests (19 new), mock e2e (500 jobs, kill/resume) green, lint/typecheck/build green.
- 2026-07-03 UX polish pass (branch ux-polish): route-level loading skeletons (app previously froze on every nav click — zero loading.tsx files against all-force-dynamic pages), completed-run "View dashboard →" CTA + inline pause-reason banner + missing VALIDATION-ONLY stamp on the run page, breadcrumbs normalized to Projects / name / section on all five project sub-pages, nav active-state fixed (was hardcoded to Projects), dashboard dims stale content while switching runs. All verified via SSR curls against real dev-DB data incl. a fabricated-then-cleaned paused run; 240 tests, lint/typecheck/build green. No new dependencies, no new surfaces.
- 2026-07-04 second audit round (branch audit-fixes-2, D-062): six external-audit findings verified-then-fixed. High: the live extractor wasn't given the desired-attribute list, so live attribute metrics drifted/under-counted against the exact-match denominator — now the list is passed into the extraction prompt and a deterministic `mapAttributesToCanonical` normalizes extracted phrases to canonical names before persist. Medium: attribute "view evidence" drills per-attribute (`attribute_<name>`) instead of a generic scope; planted-attribute exclusion uses word-boundary matching (`containsPhrase`) so short attributes aren't over-excluded; section regenerate returns and applies the fresh markdown so the editor isn't stale vs exports. Low: migration 0007 dedupes before the unique index; three duplicate decision IDs (D-054/D-055 + a pre-existing D-026) renumbered/removed so all 61 are unique. 270 tests green.
- 2026-07-04 M15 done (branch m15-explanatory-layer, D-058/D-059): completed the explanatory layer. OX-2: a project-wide "Stage: X → next action" banner in the project layout, driven by a pure `resolveProjectStage` over intake/matrix/run state — every stage page now shows the single primary next step. OX-6: a `GLOSSARY_TERMS` map + `GlossaryTerm` component giving cell/rep/engine-mode inline plain-language tooltips, applied on the matrix and run-creation surfaces. OX-5: `pnpm demo:walkthrough` makes the seeded ledgerfox-demo walkable end-to-end at $0 (approved matrix, completed mock run, 312 metric rows, 9 report sections) — verified rendering. 267 tests green.
- 2026-07-04 M15 kickstart (branch m15-explanatory-layer, D-058): the explanatory core (EL-1/2/3) that answers the operator's matrix complaint — every pillar section now explains what its prompts do, why it matters to the client, and which metrics the cells feed (PILLARS metadata + glossary-derived pillarMetricLabels, no duplication); a live per-pillar sample-budget panel projects cells×k=5 against the n>=30 gate, immediately surfacing the audit finding at matrix time (Position 5→25 <30 on the Heytea matrix, so the operator sees the head-to-head pillar is under-provisioned before running); per-cell hover shows the metrics that cell feeds. 265 tests green; SSR-verified explainers + budget render. OX-2/5/6 (guided next actions, $0 demo walkthrough, jargon tooltips) remain for the M15 completion pass.
- 2026-07-04 post-M14 audit fixes (branch audit-fixes, D-057): full verify-then-fix code audit of M11-M14 caught five real items — competitor chart bars weren't drillable (only the client was), drill-through evidence labels hardcoded "client" for every brand, brand_mentions lacked a DB uniqueness backstop (migration 0007), the dashboard Perception section showed no sentiment, and the report evidence appendix could cite an unrelated response for an unmatched finding. All fixed and verified against live data (competitor labels now read the scoped brand name, unique index applied, sentiment renders). Audit also surfaced (not a code bug) that the head-to-head chart is correctly hidden by the n>=30 guard on the Heytea run (comparison n=25) — bump comparison allocation before the next live run. 263 tests green.
- 2026-07-04 M14 done (branch m14-competitive-spectrum, D-056): the dashboard shows the client ranked against every competitor instead of "rest of the field". recomputeMetrics emits a per-brand scope (scope_key = brand id) under the same D-054 frames — unbranded mention rate, per-competitor share of voice (shares sum to 1), avg first position, comparative win rate. Two ranked bar charts (Presence: mention share; Position: head-to-head win rate), a per-competitor report table, and a brand_metrics CSV; per-bar drill-through reuses TP-4 scoped to the brand. Independent-SQL spot-check (CS-5) verifies per-brand mention rates and the share sum. The Heytea data surfaced a real finding: Chagee edges Heytea in head-to-heads (0.96 vs 0.92) while Heytea leads share of voice (0.71 vs 0.16). No migration (metric rows disposable, C-5); all 31 runs recomputed. 263 tests green.
- 2026-07-04 M13 done (branch m13-pillar-visuals, D-055): the Four P's became the dominant visual structure — dashboard and matrix reorganized into numbered, framed, spined pillar sections (confidence rail as a footer band, never a fifth pillar), four muted structural tints added as tokens with a DESIGN_GUIDELINES amendment keeping orange the only accent, and OX-1's per-project subnav (Matrix/Runs/Dashboard/Report) on every project page — curing the reported matrix→dashboard dead-end. Original M13 scope split into M13/M14/M15 (PRD 8.18-8.18b) with no OX requirement dropped. 260 tests green; SSR-verified all four numbered sections, rail, tints, and subnav. Ops note: a stale background worker raced the test suite mid-session (caught, killed, $0 spent — see BUILD_NOTES S-025 gotcha).
- 2026-07-04 prompt-frame rule (branch metric-frames, D-054): operator vetting caught that every rate metric pooled branded and unbranded prompts — the audit's headline numbers were echoes of its own prompts (pooled mention rate 0.850 vs honest 0.564; avg first position 1.484 vs organic 3.400 on the live Heytea run). PRD 8.9 rewritten around MT-12 (a metric may never count a signal the prompt planted): presence metrics count unbranded samples only, new MT-13 Comparative Win Rate owns the head-to-head signal, sentiment splits organic/solicited with objection excluded, attribute association excludes planted attributes, citation share is grounded-only. Drill-through applies identical filters; independent-SQL spot-check re-derives frames and passes; 260 tests green; all runs recomputed idempotently (C-5, no migration).
- 2026-07-04 next-stage planning (branch m11-planning): the Four P's semantic layer, category archetype template packs, trust & provenance, and operator UX are specified as M11-M13 (new PRD sections 8.16-8.18, tracker rows, D-051/D-052/D-053) after an operator debrief on the first live pilot — key findings: metrics render as uninterpretable raw keys, prompts speak B2B jargon regardless of category (audit-validity defect), the dashboard/exports existed but were undiscoverable, and nothing ties prompts/metrics back to the client's core questions. M10 tracker row updated: DeepSeek gate closed by the 115-job live run; deploy and grounded-provider gates remain, running as a parallel ops track.
- 2026-07-04 post-pilot gap-audit fixes (branch worker-env-bootstrap): implemented the four actionable items from a systematic M1-M10 gap audit (patterned on the three bugs found this session). (C1/C2, highest severity — a live bug reachable with no API key) the worker's `processJob` conflated a provider-call failure with a persistence (`recordSuccess`) failure in one try/catch, so a DB blip after a successful paid call was misclassified as a provider `server_error` and, after 5 such, wrongly marked a healthy provider "down" (D-042) — split into two failure domains, new `persistence_error` type (migration 0005) never fed to provider-down (D-049), regression-tested. (A1) `createRun` now preflights the per-provider daily budget and the run form shows today's spend vs cap, instead of the run silently pausing mid-flight (D-050). (B1) env-bootstrap added to seed/dev-db scripts. (D2) report page gains a run-switcher matching the dashboard. 247 tests, lint/typecheck green; report + run-form verified 200 via SSR. The remaining audit items are the already-known M10 go-live gates (live provider validation, Gemini grounding caveat, CI/deploy), not code fixes.
- 2026-07-03 runs index page (branch worker-env-bootstrap): fixed a navigation dead-end — an in-progress run's queue/progress page was reachable only via the post-creation redirect, so clicking away stranded the run with no path back (reported during the live pilot). Added `/projects/[id]/runs` (newest-first list with state/mode badges + job progress via one grouped query), linked from the projects list and the run-detail breadcrumb (D-048, reversing S-018's "no run-list hub" note which only held for completed runs). Verified against the live DB: index lists both project runs and links to each; the live pilot run completed 115/115 jobs at $0.04. typecheck/lint green.
- 2026-07-03 worker env bootstrap (branch worker-env-bootstrap): a live_audit run dead-lettered every deepseek job with "No active credential" and tripped the failure breaker — root cause was `pnpm worker` (bare `tsx`) loading no `.env` files, so `CREDENTIALS_ENCRYPTION_KEY` was unset in the worker; `decryptApiKey` swallowed the resulting config error to null and the resolver wrongly marked a good credential `invalid`. Fixed with `src/env-bootstrap.ts` (Node 22 `loadEnvFile`, no dep) imported first in the worker + audit/archive scripts, plus a `CredentialConfigError` split so a missing/malformed KEK propagates loudly (leaving the row alone) while only genuine ciphertext failures invalidate it (D-047). Credential verified-and-reactivated; run left paused (resuming spends real money — operator's call). 246 tests, lint/typecheck green. NOTE: committed on-branch only, not merged — a concurrent operator was live-editing the repo (WIP enable/disable-credential feature).
- 2026-07-03 PM-9 early warning (branch pm9-early-warning): operator hit an approval-time PM-9 block on the Heytea pilot project — root cause was a brand-contaminated `job_to_be_done` intake value ("Analyze how AI ranks Heytea…", the audit's meta-goal, not a buyer job) interpolated into discovery cells, with no warning until the approve click. Extracted `scanUnbrandedCells` into `src/core/matrix.ts` (approval gate refactored onto it), matrix board now badges violating draft cells inline + shows a summary banner pointing at the intake fields, and the intake review step warns when `job_to_be_done`/`category` contain tracked brand terms (warning only — branded intents legitimately use brands). Heytea data fixed and its 4 draft discovery cells re-rendered brand-free. 242 tests (2 new), lint/typecheck green, banner/badge/clean states verified via SSR curls against the real dev DB.
- 2026-07-03 second post-M10-prep audit round (branch m10-audit-fixes-2, milestone still open): a second independent audit found 5 more issues; 4 confirmed and fixed, 1 investigated and correctly rejected. Fixes: (1) `afterJobFinished` checked the cost-cap/budget breaker BEFORE checking whether the run had finished — a run whose final job crossed the cap got paused with zero jobs left to ever finish it, stranded forever; reordered so a finished run always completes. Reproduced against the pre-fix code (a real spawned worker, not a reimplementation) to confirm the bug, then confirmed the fix. (2) The extraction reconcile sweep only caught responses with no extraction row at all — a worker crash between creating a pending extraction and its next state transition left a "torn" row invisible to that query and permanently stuck; added `listResponsesWithStaleExtraction` (pending/retrying past an age threshold) feeding a second sweep pass via `reExtractResponse`. (3) Settings Verify called `provider.generate()` with no AbortSignal — the only call site with no timeout; added the same `AbortSignal.timeout` every other path uses. (4) CSV exports had no spreadsheet-formula-injection guard (CWE-1236) despite carrying raw model-origin text in live mode — cells starting with =/+/-/@/tab/CR now get a leading single-quote guard; JSON export stays raw. Rejected: a claim that Render's `generateValue: true` for the credential encryption key might not produce a valid 32-byte shape — checked against Render's own Blueprint docs, which confirm it always generates exactly a 256-bit base64 value, already handled correctly by existing code; documented in RENDER_DEPLOYMENT.md instead of changed. 240 tests (16 new, including a real reproduce-then-fix regression test for the ordering bug and 4 tests fabricating a torn extraction against the real dev DB), 3x repeated full-suite run for stability, mock e2e green, lint/typecheck/build green.
- 2026-07-03 post-M10-prep audit fixes (branch m10-audit-fixes, milestone still open): an independent audit of the prep merge found 7 real issues, all fixed and tested. Four P1s: (1) grounded cost projection dropped search/grounding fees — now sums over supported (provider,mode) pairs each priced in its own mode; (2) C-2 violation — D-041's single extraction engine meant DeepSeek extraction spend was charged to the generation provider's budget and never to DeepSeek's, so a non-DeepSeek run's extraction was unguarded — now `getProviderSpendToday` attributes all extraction cost to the configured engine and the worker checks the engine's budget on every live run (D-044); (3) evidence archives could ship with 0 metrics (metrics are computed on demand, never on completion) — the archive now recomputes (idempotent, C-5) and warns loudly if eligible samples yield no rows; (4) the misinformation-review gate the release checklist requires had no UI — added confirm/correct/re-open controls + server action writing `claims_found.reviewed_at` (SM-5). Two P2s: live `createRun` now preflights active credentials for selected providers AND the extraction engine before spending; the injected-failure worker branch now runs `afterJobFinished` (could strand a run on the final job). One P3: print route raw hex → `var(--color-*)` tokens (V-10). 225 tests (9 new), mock e2e green, print page verified rendering 14 token vars / 0 hex, extraction-attribution and archive-recompute verified against real dev-DB runs.
- 2026-07-03 M10 prep (branch m10-pilot-prep, milestone stays open — the live audit itself is gated on operator keys and a real deploy): `render.yaml` gained the M9 provider env vars + `EXTRACTION_PROVIDER` (a deploy would otherwise silently fall back to hard-coded defaults against D-020's precedence contract); D-024's never-built evidence archive now exists as `pnpm archive:evidence <runId>` and was verified against the real dev DB (1MB bundle: 497 responses with raw text, 467 metrics with real Wilson intervals; missing `pg_dump` correctly exits 2 with an INCOMPLETE warning); `RELEASE_CHECKLIST.md` created as the M10 acceptance artifact (D-043) — go-live gates ordered mock -> deepseek-mini -> grounded validation with the Gemini caveat closure as an explicit gate, plus the per-audit delivery checklist and archive log.
- 2026-07-03 M9 done: all four target audit providers (OpenAI, Anthropic, Gemini, Perplexity) added through the same frozen `LLMProvider` interface with zero runner-schema changes (PV-4), every endpoint/model/pricing/citation-shape detail verified against official docs on the implementation date (PV-7) — including two things that would have been wrong from training data alone: Perplexity's endpoint moved to `/v1/sonar`, and Anthropic/OpenAI doc hosts moved. Citations normalized to the shared `Citation` shape per provider path (`url_citation` annotations, `web_search_result_location` blocks, `groundingChunks`, `search_results`); Perplexity is the first grounded-ONLY provider (ungrounded pairs skip per PV-5's existing planning machinery). Shared adapter plumbing extracted to `src/providers/shared.ts` (typed errors, HTTP classification, timeout mapping, domain normalization). Extraction engine consolidated to one configured provider (D-041, default deepseek). Provider-down graceful degradation (D-042): dead provider's remaining jobs skip with new `provider_down` error type (migration 0004, additive), healthy providers finish, run completes PARTIAL, failure breaker evaluates only non-down providers — proven by a DB-backed two-provider test (5 fabricated dead-letters on deepseek, 12 fabricated successes on openai, run completed, breaker counts clean, raw counts partial). 216 tests (34 new), mock e2e green, lint/typecheck/build green.
- 2026-07-03 M9 note: one open PV-7 item, recorded in ENGINEERING_SPEC §3 — Gemini's `generateContent` grounding-response nesting couldn't be re-verified from live docs (Google now foregrounds a new "Interactions API"); the adapter implements the documented stable schema defensively (unexpected shape → visibly empty citations, never a crash) and must be confirmed by the first live grounded validation run before any grounded audit-grade Gemini run. All live verification (grounded mini-runs, Settings verify buttons) still requires operator API keys — same stopping point as M8. MiniMax skipped per PV-3 (optional candidate; adds nothing now that DeepSeek covers cheap validation).
- 2026-07-03 M8 note: found and fixed a real pre-existing bug — `provider_credentials`'s `(provider_id, label)` unique index was global, not partial on `status='active'` like its sibling index, so rotating a key under the same label collided with its own just-disabled predecessor row (migration 0003 fixes this). Also found that `vi.stubGlobal("fetch", ...)` across concurrently-executing Vitest test files was genuinely racing and leaking into each other under the default parallel-file pool — reproduced across 3 of 5 full-suite runs before the fix; resolved via `fileParallelism: false` in `vitest.config.ts` (suite runtime ~3.5s -> ~8s, judged an acceptable tradeoff for determinism). Separately, an early failed test run (before an FK-ordering fix in three test files' `afterAll` cleanup) left 3 real `live_validation`/deepseek runs with "running" jobs orphaned in the dev DB — exactly the kind of stray state a live worker would pick up and bill against; manually cleaned up and all three cleanup loops hardened with per-run try/catch so a single ordering miss can never again abort cleanup of the rest. The UI run-creation flow (`modules/runner/actions.ts`) still hardcodes `runMode: "mock"` — live run creation currently only exists through this script, not the Projects UI; flagged as a follow-up, not done this milestone.
- 2026-07-04 M11 done: pure semantic layer added (`PILLARS`, intent-to-pillar map, metric glossary + prefix resolver), with a completeness test covering every emitted metric family including dynamic sentiment/attribute keys.
- 2026-07-04 M11 archetypes: migration 0006 added `category_archetype`/`archetype`; intake persists the buyer-language archetype; matrix generation filters templates by archetype; seed now has 45 templates and an AT-3 forbidden-jargon test for consumer packs.
- 2026-07-04 M11 surfaces/verification: run metrics preview, matrix board, dashboard headings/cards, and report chapter titles now render pillar/question framing instead of raw metric keys; verified with focused tests, full Vitest, lint, typecheck, build, migration, and seed-twice idempotency.
- 2026-07-04 M12 report trust: generated report aggregate claims now carry n/providers/modes/run date inline; Method & Confidence is generated from actual run config plus the metric glossary; Raw Answer Appendix cites deterministic raw-response excerpts per finding (D-055).
- 2026-07-04 M12 dashboard provenance: scorecard metric cards and Share of Voice drill through to D-014 eligible responses with numerator/denominator labels in <=2 clicks; aggregate chart sections expose n beside the visualization.
- 2026-07-04 M12 verification: no migration; report-template tests, typecheck, lint, full Vitest (211 passed, 44 DB-gated skipped), and production build pass.

## 12. Roadmap after MVP

Completed (D-063, D-077): M16 layer identity + Resonance presentation -> M17 resonance data layer + mock panel runs -> M18 SSR scoring + metrics -> M19 Simulation Layer surfaces + demo -> M20 value-add packs + hardening -> M21 Evidence Layer / Simulation Layer copy (D-077) -> M22 test-DB isolation + evidence-only studies (D-078) -> M23 coverage contract + price/promo templates (D-079) -> M24 multi-provider resonance (D-080) -> M25 prompt_cells freeze trigger residue (D-081) -> M26 calibration protocol + comparison harness (D-082) -> M27 post-intake Setup editing (D-084) -> M28 buyer-voice guard + JTBD clarity (D-085) -> M29 pause/cancel observability hotfix. Ordering rationale (M16-M20): identity/presentation first because it is zero-risk and stabilizes navigation; data layer before scoring so the pipeline is provable in mock at $0 before any embedding spend; surfaces after metrics so every chart has real rows behind it; value-add packs last because they are presets over proven machinery. M10 close-out (deploy, remaining live providers, Gemini grounding caveat) remains a parallel ops track gated on operator actions and is still open as of M30.

Post-PoC parking lot (deliberately NOT scheduled — see RESONANCE_BUILD_PLAN parking lot): multi-user/auth changes, payments, client portals, live embedding-fidelity calibration, bootstrap intervals for PMF means and D-023 point estimates, additional simulation constructs (relevance/trust/switch-likelihood), image stimuli, anchor-set tuning, non-English panels, location/footfall studies. Earlier demand-driven items stand: client-deliverable polish (charts in the PDF, branded layout, `.docx` export), AI Overviews through a SERP/API vendor, snapshot preset, run-over-run comparison, extraction-accuracy trends, Shortlist Radar, SourceLift, and white-label theming only after at least two agencies ask.
