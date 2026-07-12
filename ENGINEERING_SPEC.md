> LIFECYCLE: ACTIVE · ROLE: CANON · OWNS: detailed schema, lifecycle states, provider matrix, seeds, acceptance commands

# ENGINEERING_SPEC.md - Parallax Execution Contract

> Detailed implementation contract for schema, lifecycle states, provider capabilities, seeds, and milestone commands. Read after `MASTER_CONTEXT.md`, `PRD.md`, and `DEVELOPMENT_GUIDELINES.md` when starting M0.5, M1, or any worker/provider/schema work.

---

## 1. Lifecycle state machines

State transitions must be enforced in repositories or service functions, not only in UI.

Matrix version state:

- `draft` -> `approved`
- `approved` -> `superseded`
- `draft` -> `discarded`

Run state:

- `draft` -> `queued`
- `queued` -> `running`
- `running` -> `paused`
- `paused` -> `queued`
- `running` -> `completed`
- `running` -> `failed`
- `queued | running | paused` -> `cancelled`

Job state:

- `queued` -> `running`
- `running` -> `succeeded`
- `running` -> `retryable_failed`
- `retryable_failed` -> `queued`
- `running | retryable_failed` -> `dead_lettered`
- `queued | running | retryable_failed` -> `cancelled`
- `queued` -> `skipped` when run planning blocks unsupported mode before execution.

Extraction state:

- `pending` -> `valid`
- `pending` -> `retrying`
- `pending` -> `dead_lettered` (raw text unusable for extraction; see D-011 layering rule)
- `retrying` -> `valid`
- `retrying` -> `dead_lettered`
- `valid` -> `qa_reviewed`

Claim review state:

- `unreviewed` -> `confirmed`
- `unreviewed` -> `corrected`
- `confirmed | corrected` -> `corrected`

Framing study state (M34A, D-102):

- `draft` -> `codebook_locked`
- `codebook_locked` -> `revealed`
- `revealed` -> `reviewing`
- `revealed | reviewing` -> `completed` only when every source job has a terminal review outcome
- Locked codebooks, completed response reviews, and evidence snapshots have no backward transition.

Resonance study state (M17+, D-064; approval compiles and freezes the study's resonance matrix version in the same transaction):

- `draft` -> `approved`
- `draft | approved` -> `archived`

Report section state:

- `generated` -> `edited`
- `generated | edited` -> `regenerated`
- Regeneration may only update the targeted section.

Exports have no state machine and no table in MVP: Markdown, print-HTML, and CSV/JSON exports are synchronous downloads rendered on request (D-013).

## 2. Database schema spec

Use Postgres UUID primary keys. Every table has `created_at timestamptz not null default now()`. Mutable business tables also have `updated_at timestamptz not null default now()`. MVP uses no hard deletes except disposable `metrics` during recompute.

Schema changes require a migration file in `src/db/migrations`; the Drizzle schema alone is not sufficient. The drizzle config must pin its migrations `out` path to `src/db/migrations` — never rely on drizzle-kit's default `drizzle/` output directory.

| Table | Required columns | Keys, indexes, invariants |
|---|---|---|
| `projects` | `id`, `name`, `slug`, `category`, `job_to_be_done`, `status`, `intake_step`, `setup_updated_at`, `created_at`, `updated_at` | Unique `slug`, auto-generated from `name` at creation, not operator-edited in MVP; `status` in `draft`, `active`, `archived`; one client brand required before matrix generation; `setup_updated_at` (nullable, migration 0012) is touched by every Setup mutation and drives the matrix board's stale-draft warning (M27, D-084) |
| `brands` | `id`, `project_id`, `role`, `name`, `domain`, `description`, `aliases_json`, `priority`, `archived_at`, `created_at`, `updated_at` | FK `project_id`; `role` in `client`, `competitor`; unique `(project_id, role, name)`; exactly one client per project; `archived_at` (nullable, migration 0012) marks a Setup-removed row — the client brand can never be archived (server-enforced); generation-input reads filter `archived_at is null`, historical label reads stay archived-inclusive (M27, D-084) |
| `fact_claims` | `id`, `project_id`, `type`, `statement`, `source_note`, `source_url`, `status`, `created_at`, `updated_at` | FK `project_id`; `type` per PRD; `status` in `active`, `archived`; used for claim matching; Setup "remove" sets `status='archived'` since `claims_found.fact_claim_id` FK-blocks a real delete (M27, D-084) |
| `attributes` | `id`, `project_id`, `name`, `priority`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, name)` after normalization; Setup "remove" is a real delete — no FK references `attributes.id` anywhere (M27, D-084) |
| `personas` | `id`, `project_id`, `title`, `company_context`, `pain_points_json`, `buying_criteria_json`, `priority`, `archived_at`, `created_at`, `updated_at` | FK `project_id`; priority controls allocation; `archived_at` (nullable, migration 0012), same archive-not-delete pattern as `brands` (M27, D-084) |
| `markets` | `id`, `project_id`, `name`, `priority`, `archived_at`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, name)`; `archived_at` (nullable, migration 0012), same archive-not-delete pattern as `brands` (M27, D-084) |
| `prompt_templates` | `id`, `intent`, `template_text`, `variant_key`, `active`, `created_at`, `updated_at` | Seed data; unique `(intent, variant_key)` where `active` (partial unique index) |
| `matrix_versions` | `id`, `project_id`, `version`, `state`, `cell_count`, `approved_at`, `superseded_at`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, version)`; `cell_count <= 50`; approved rows immutable |
| `prompt_cells` | `id`, `matrix_version_id`, `intent`, `persona_id`, `market_id`, `variant_key`, `resolved_text`, `competitor_order_json`, `created_at` | FK `matrix_version_id`; no updates after parent approval; index `(matrix_version_id, intent)`; `representation` cells are audit cells with null persona/market/stimulus/panel-persona and use the five pinned M34A prompts |
| `audit_runs` | `id`, `project_id`, `matrix_version_id`, `run_mode`, `state`, `repetitions`, `selected_providers_json`, `selected_modes_json`, `planned_calls`, `cost_cap_usd`, `actual_cost_usd`, `failure_rate`, `debug_failure_injection_json`, `started_at`, `completed_at`, `created_at`, `updated_at` | FK project/version; run mode per guidelines; state per this file; `repetitions = 5` for `live_audit`; "partial" is not a state or column — a run is displayed partial when it reaches a terminal state with any `dead_lettered` or `cancelled` jobs; `debug_failure_injection_json` is nullable test-only chaos config: `{ generation?: {rate, errorType}, extraction?: {invalidRate} }` — `generation` is applied by the worker before calling the provider (D-027), `extraction` is applied by the extraction service before validating (D-029); independently controllable |
| `jobs` | `id`, `run_id`, `cell_id`, `provider_id`, `generation_mode`, `rep_index`, `state`, `attempt_count`, `locked_by`, `locked_at`, `last_error_type`, `last_error_message`, `next_attempt_at`, `created_at`, `updated_at` | FK run/cell; unique `(run_id, cell_id, provider_id, generation_mode, rep_index)`; index `(state, next_attempt_at)` |
| `responses` | `id`, `job_id`, `run_id`, `cell_id`, `provider_id`, `generation_mode`, `model_version`, `raw_text`, `citations_json`, `tokens_in`, `tokens_out`, `cost_usd`, `latency_ms`, `created_at` | Immutable; unique `job_id`; a response row is written only when the job succeeds, so retries never collide with it (D-011); every metric trace starts here |
| `extractions` | `id`, `response_id`, `extraction_version`, `state`, `schema_version`, `extraction_model`, `extracted_json`, `validation_error`, `qa_status`, `qa_notes`, `created_at`, `updated_at` | FK response; unique `(response_id, extraction_version)`; only latest valid version feeds metrics |
| `brand_mentions` | `id`, `extraction_id`, `brand_id`, `observed_name`, `position`, `recommended`, `recommendation_strength`, `sentiment`, `attributes_json`, `evidence_quote`, `created_at` | Derived from valid extraction; rebuilt on re-extraction; index `(brand_id, recommended)` |
| `claims_found` | `id`, `extraction_id`, `brand_id`, `fact_claim_id`, `claim_text`, `claim_type`, `extracted_verdict`, `extracted_severity`, `operator_verdict`, `operator_severity`, `review_state`, `reviewed_at`, `evidence_quote`, `created_at`, `updated_at` | FK extraction; operator fields override extracted fields for reporting; `reviewed_at` is set whenever `review_state` leaves `unreviewed` (D-024) |
| `provider_credentials` | `id`, `provider_id`, `label`, `encrypted_api_key`, `key_version`, `api_key_last4`, `api_key_fingerprint`, `base_url`, `default_model`, `status`, `last_verified_at`, `last_used_at`, `created_at`, `updated_at` | Server-only table; `provider_id` per guidelines; `status` in `missing`, `active`, `invalid`, `disabled`; unique `(provider_id, label)`; at most one `active` row per provider via partial unique index on `provider_id` where `status = 'active'` (D-020); non-null `base_url`/`default_model` override env defaults (D-020); decrypt failure sets `status = 'invalid'` (D-021); raw keys are never stored |
| `metrics` | `id`, `run_id`, `scope_type`, `scope_key`, `metric_key`, `n`, `value`, `ci_low`, `ci_high`, `metadata_json`, `computed_at` | Disposable; unique `(run_id, scope_type, scope_key, metric_key)`; recompute deletes by `run_id` first; `ci_low`/`ci_high` are null for metrics without a defined interval method (D-023) |
| `findings` | `id`, `run_id`, `finding_type`, `severity`, `title`, `body_md`, `evidence_json`, `created_at`, `updated_at` | Derived; rows are regenerate-only in MVP — operators edit narrative in report sections, never finding rows |
| `report_sections` | `id`, `run_id`, `section_key`, `position`, `generated_md`, `edited_md`, `state`, `created_at`, `updated_at` | Unique `(run_id, section_key)`; `edited_md` always wins |
| `run_events` | `id`, `run_id`, `job_id`, `level`, `event_type`, `message`, `metadata_json`, `created_at` | Append-only; index `(run_id, created_at)` |
| `resonance_studies` (M17, migration 0008) | `id`, `project_id`, `name`, `state`, `construct`, `anchor_set_version`, `panel_personas_json`, `baseline_stimulus_id`, `conditioned`, `approved_at`, `created_at`, `updated_at` | FK `project_id`; `state` per this file; `construct` = `purchase_intent` in v1; `anchor_set_version` pinned at approval, loader refuses unknown versions (C-4-for-anchors); `panel_personas_json` entries: `{key,label,age,incomeBand,location,behavioralProfile}` — age/income are the paper-validated axes; location/behavioralProfile are prompt context, never presented as validated segmentation (C-14, D-066) |
| `resonance_stimuli` (M17; M34A migrations 0014/0015) | `id`, `study_id`, `label`, `stimulus_kind`, `body_md`, `evidence_response_ids_json`, `framing_evidence_snapshot_id`, `position`, `created_at` | FK `study_id`; `stimulus_kind` in `measured_ai`, `corrected`, `repositioned`, `custom`; unique `(study_id, position)`; B2B `measured_ai` requires >=1 same-project response id (C-13); new consumer `measured_ai` requires a same-project valid v2 snapshot and byte-equal copied raw response (C-15); a database trigger blocks insert/update/delete against approved-study stimuli except an explicit maintenance bypass |
| `framing_studies`, `framing_response_reviews`, `framing_annotations`, `framing_gap_classifications`, `framing_evidence_snapshots` (M34A, migrations 0014/0015) | Project/source-run workflow record; persisted discovery manifest + SHA/attestation; one review per denominator source job; accepted/rejected literal offsets; terminal gap outcome; gap-linked copied v1/v2 JSON evidence payload + SHA-256 | Consumer projects only; fixed representation protocol pinned; codebook locks after explicit metadata-masked discovery attestation and before reveal; all jobs remain in N including unavailable generations; accepted spans resolve uniquely against immutable raw text; v2 handoff requires `live_audit` + actionable gap; unique annotation×gap insertion is idempotent; database trigger makes snapshots append-only |

Migration 0008 also: `ALTER TYPE "public"."intent" ADD VALUE 'simulation'` (the `intent` column is a Postgres enum, not text — migration 0004's `provider_down` is the precedent; Postgres forbids USING a just-added enum value in the same transaction that adds it, which is fine because 0008 only adds the value and never inserts rows); `matrix_versions` gains `kind text not null default 'audit'` (`audit | resonance`) and nullable `resonance_study_id` FK; `prompt_cells` gains nullable `stimulus_id` FK and `panel_persona_key text`. `prompt_cells.persona_id`/`market_id` are ALREADY nullable in migration 0000 (verified 2026-07-05, D-066) — no relax needed; resonance cells leave them null, audit paths still always set them. SSR scores are NOT a new table: they are `extractions` rows discriminated by `extracted_json.kind = 'ssr'` — `schema_version` KEEPS its integer type (verified: `integer default 1 not null`; never write a string into it), `extraction_model` = embedding model (or `mock-fixture`), and `extracted_json = { kind:'ssr', ssrVersion:'ssr-v1', anchorSetVersion, pmf[5], perSetPmfs, meanScore }` — re-scoring creates the next `extraction_version` (C-3). Resonance metrics reuse `metrics` with scopes `resonance_variant` (scope_key = `<stimulusId>|<providerId>`), `resonance_variant_persona` (scope_key = `<stimulusId>|<panelPersonaKey>|<providerId>`), `resonance_delta` (scope_key = `<stimulusId>|<providerId>`, metadata carries baseline id) — the provider dimension was added by D-080 (M24), superseding D-067's single-provider-only key format: every metric computes strictly within one provider's own samples, so a resonance run may now select >=1 providers (generation mode still locked to exactly one) without pooling distinct synthetic populations. `ci_low`/`ci_high` stay null (D-023 — PMF means are point estimates; no invented intervals, no variance theater). Recompute dispatches on matrix `kind` — the C-12 wall. `delta_pi_mean` is a Likert-scale mean shift vs baseline (a survey construct), never presented as a purchase-probability change.

Migrations since 0008: migration 0009 (D-072) adds two Postgres CHECK constraints enforcing the audit/resonance cell-shape invariant (`matrix_versions` kind<->`resonance_study_id` consistency; `prompt_cells` simulation-vs-audit column shape). Migrations 0010/0011 (D-081, then a same-week hotfix D-083) add a `prompt_cells_freeze_trigger` — a `BEFORE UPDATE OR DELETE` Postgres trigger rejecting direct mutation of rows whose parent `matrix_versions.state` is `approved` or `superseded`; 0011 fixes its UPDATE return value. Migration 0012 (D-084, M27) adds Setup archive columns. M34A migration 0013 adds only the `representation` enum value; 0014 adds the five framing tables, snapshot FK, and representation cell shape. Because Drizzle batches pending migrations in one transaction on an upgrade, 0014's CHECK compares `intent::text` rather than directly resolving the just-added enum label; fresh and existing-database paths are both acceptance-tested (D-102). Forward-only migration 0015 (D-103) adds discovery/gap state, richer outcomes, gap-linked handoff uniqueness, and database freeze triggers; a permanent 0012→0015 test verifies data preservation and trigger installation.

## 3. Provider capability matrix

Provider details are implementation inputs, not marketing claims. Verify model IDs, pricing, and feature support against official docs on the implementation date.

| Provider | MVP role | API format | Default model | Grounded | Citations | JSON output | Credential source | Service config | Milestone |
|---|---|---|---|---|---|---|---|---|
| Mock | Permanent provider #0 | Local fixture adapter | `mock-fixture-v1` | Yes, synthetic | Yes, synthetic | Yes | none | none | M4 |
| DeepSeek | First live validation provider | OpenAI-compatible Chat Completions | `deepseek-v4-flash` | No until verified | No until verified | Yes, per official docs | Settings UI -> encrypted `provider_credentials` row | `DEEPSEEK_BASE_URL`, `DEEPSEEK_DEFAULT_MODEL`, optional `DEEPSEEK_DAILY_BUDGET_USD` | M8 |
| MiniMax | Candidate second validation provider | OpenAI-compatible or Anthropic-compatible, choose one before coding | `MiniMax-M3` | No until verified | No until verified | Verify before coding | Settings UI -> encrypted `provider_credentials` row | `MINIMAX_BASE_URL`, `MINIMAX_DEFAULT_MODEL`, optional `MINIMAX_DAILY_BUDGET_USD` | M9 candidate |
| OpenAI | Grounded audit provider | Responses API (`POST /v1/responses`, Bearer) | `gpt-5.5` | Yes — `web_search` tool | Yes — `url_citation` annotations (`url`, `title`) | Yes | Settings UI -> encrypted `provider_credentials` row | `OPENAI_BASE_URL`, `OPENAI_DEFAULT_MODEL`, optional `OPENAI_DAILY_BUDGET_USD` | M9 |
| Anthropic | Grounded audit provider | Messages API (`POST /v1/messages`, `x-api-key` + `anthropic-version: 2023-06-01`, `max_tokens` required) | `claude-sonnet-5` | Yes — `web_search_20250305` server tool | Yes — `web_search_result_location` citations on text blocks (`url`, `title`, `cited_text`) | Yes | Settings UI -> encrypted `provider_credentials` row | `ANTHROPIC_BASE_URL`, `ANTHROPIC_DEFAULT_MODEL`, optional `ANTHROPIC_DAILY_BUDGET_USD` | M9 |
| Google | Grounded audit provider | `POST /v1beta/models/{model}:generateContent`, `x-goog-api-key` header | `gemini-2.5-flash` | Yes — `google_search` tool | Yes — `groundingMetadata.groundingChunks[].web.{uri,title}` — see caveat below | Yes — `generationConfig.responseMimeType` | Settings UI -> encrypted `provider_credentials` row | `GOOGLE_BASE_URL`, `GOOGLE_DEFAULT_MODEL`, optional `GOOGLE_DAILY_BUDGET_USD` | M9 |
| Perplexity | Grounded audit provider, grounded-ONLY (every sonar call searches; ungrounded pairs are skipped per PV-5) | `POST /v1/sonar` (current docs' endpoint, not the older `/chat/completions`), Bearer | `sonar` | Always | Yes — `search_results[]` (`title`, `url`) + `citations[]` (bare URLs) | Yes — `response_format` json_schema | Settings UI -> encrypted `provider_credentials` row | `PERPLEXITY_BASE_URL`, `PERPLEXITY_DEFAULT_MODEL`, optional `PERPLEXITY_DAILY_BUDGET_USD` | M9 |

DeepSeek pricing baseline for M8 is read from official docs at implementation time. As of 2026-07-02, docs list `deepseek-v4-flash` and `deepseek-v4-pro`, OpenAI base URL `https://api.deepseek.com`, Anthropic base URL `https://api.deepseek.com/anthropic`, and pricing per 1M tokens. Do not hard-code those prices outside provider config.

M9 pricing verified against official docs 2026-07-03, stored in provider config only (PV-6): OpenAI gpt-5.5 $5/$30 per 1M + $10/1k web searches; Anthropic claude-sonnet-5 $2/$10 introductory through 2026-08-31 then $3/$15 (adapters carry the post-introductory rate so estimates stay conservative) + $10/1k searches; Gemini gemini-2.5-flash $0.30/$2.50 + $35/1k grounded prompts; Perplexity sonar $1/$1 + ~$8/1k request fee (medium search context).

GEMINI GROUNDING CAVEAT (PV-7, open until first live grounded validation run): Google's docs now foreground a new "Interactions API", and the `generateContent` grounding-response nesting could not be re-verified from the live pages on 2026-07-03. The adapter implements the documented stable schema (`candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}`, `webSearchQueries`) and parses defensively — an unexpected shape yields empty citations visibly, never a crash or silent mixing. Confirm against a real grounded validation run before any grounded audit-grade Gemini run.

D-041: the extraction engine is one configured provider for all live runs — `EXTRACTION_PROVIDER` env, default `deepseek`; its credential must be active for ANY live run to extract.

D-064 (M18+): the embedding engine is one configured provider for all live SSR scoring — `EMBEDDING_PROVIDER` env, default `openai`, model `text-embedding-3-small` (verify name/pricing against official docs at implementation date; the SSR paper's model). It is a SEPARATE `EmbeddingProvider` interface, not a widening of `LLMProvider`; resolved worker-side per the D-035 registry/resolver split. DeepSeek exposes no embeddings endpoint (as of 2026-07-05 — verify) and must not be the embedding engine. Embedding spend is attributed to the embedding provider in cost projection, the per-run cap, and daily budgets (C-2, D-022/D-044 pattern), and its credential must be active for any live resonance run to score. Mock runs and CI never call a live embedding engine (fixture-backed scoring).

## 4. Seeds and fixtures

Seed and fixture files are implementation contracts:

- `fixtures/demo-project.json`: one realistic project used by wizard, matrix, mock E2E, dashboard, and report tests.
- `fixtures/mock-responses/README.md`: manifest of required mock response archetypes.
- `fixtures/golden/README.md`: manifest for expected extractions and metric outputs.
- Prompt templates are seeded into `prompt_templates`; they are not hard-coded in JSX. Seed at least three variant phrasings per intent (`v1`, `v2`, `v3`); cells are intent x persona x market x variant, so variant depth is what lets the allocator reach its per-intent quotas.
- Demo sizing: the demo project must yield enough candidate cells for the default allocation and the cap boundary tests. With 2 personas x 2 markets x 3 variants x 5 intents = 60 candidates, the 40-cell default allocation (12 per intent maximum = 2 x 2 x 3) is exactly reachable and 51-cell rejection tests have headroom.

Resonance fixtures (M17+, D-064):

- `fixtures/ssr/anchor-sets.json`: versioned anchor statement sets — `{ version, construct, sets: [{ id, sentences[5] }] }`, >=4 sets, sentences[i] maps to Likert i+1. Editing sentences requires a new `version` string; the loader refuses unknown versions.
- `fixtures/ssr/fixture-pmfs.json`: hand-authored plausible PMFs keyed by mock-response fixture id — the fixture-backed scoring path for mock runs (D-022 discipline); loader errors loudly on an unmapped fixture.
- `fixtures/mock-responses/` gains a resonance archetype family (>=10 free-text buyer reactions across 5 intensity levels), selected by the same D-016 stable hash; manifest README updated.
- `pnpm demo:resonance` (M19) is idempotent like `demo:walkthrough` and must leave every resonance surface walkable at $0.

The seed script must be idempotent. Running it twice creates no duplicate projects, brands, templates, fixtures, or expectations.
