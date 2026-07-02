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
| `projects` | `id`, `name`, `slug`, `category`, `job_to_be_done`, `status`, `intake_step`, `created_at`, `updated_at` | Unique `slug`, auto-generated from `name` at creation, not operator-edited in MVP; `status` in `draft`, `active`, `archived`; one client brand required before matrix generation |
| `brands` | `id`, `project_id`, `role`, `name`, `domain`, `description`, `aliases_json`, `priority`, `created_at`, `updated_at` | FK `project_id`; `role` in `client`, `competitor`; unique `(project_id, role, name)`; exactly one client per project |
| `fact_claims` | `id`, `project_id`, `type`, `statement`, `source_note`, `source_url`, `status`, `created_at`, `updated_at` | FK `project_id`; `type` per PRD; `status` in `active`, `archived`; used for claim matching |
| `attributes` | `id`, `project_id`, `name`, `priority`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, name)` after normalization |
| `personas` | `id`, `project_id`, `title`, `company_context`, `pain_points_json`, `buying_criteria_json`, `priority`, `created_at`, `updated_at` | FK `project_id`; priority controls allocation |
| `markets` | `id`, `project_id`, `name`, `priority`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, name)` |
| `prompt_templates` | `id`, `intent`, `template_text`, `variant_key`, `active`, `created_at`, `updated_at` | Seed data; unique `(intent, variant_key)` where `active` (partial unique index) |
| `matrix_versions` | `id`, `project_id`, `version`, `state`, `cell_count`, `approved_at`, `superseded_at`, `created_at`, `updated_at` | FK `project_id`; unique `(project_id, version)`; `cell_count <= 50`; approved rows immutable |
| `prompt_cells` | `id`, `matrix_version_id`, `intent`, `persona_id`, `market_id`, `variant_key`, `resolved_text`, `competitor_order_json`, `created_at` | FK `matrix_version_id`; no updates after parent approval; index `(matrix_version_id, intent)` |
| `audit_runs` | `id`, `project_id`, `matrix_version_id`, `run_mode`, `state`, `repetitions`, `selected_providers_json`, `selected_modes_json`, `planned_calls`, `cost_cap_usd`, `actual_cost_usd`, `failure_rate`, `started_at`, `completed_at`, `created_at`, `updated_at` | FK project/version; run mode per guidelines; state per this file; `repetitions = 5` for `live_audit`; "partial" is not a state or column — a run is displayed partial when it reaches a terminal state with any `dead_lettered` or `cancelled` jobs |
| `jobs` | `id`, `run_id`, `cell_id`, `provider_id`, `generation_mode`, `rep_index`, `state`, `attempt_count`, `locked_by`, `locked_at`, `last_error_type`, `last_error_message`, `next_attempt_at`, `created_at`, `updated_at` | FK run/cell; unique `(run_id, cell_id, provider_id, generation_mode, rep_index)`; index `(state, next_attempt_at)` |
| `responses` | `id`, `job_id`, `run_id`, `cell_id`, `provider_id`, `generation_mode`, `model_version`, `raw_text`, `citations_json`, `tokens_in`, `tokens_out`, `cost_usd`, `latency_ms`, `created_at` | Immutable; unique `job_id`; a response row is written only when the job succeeds, so retries never collide with it (D-011); every metric trace starts here |
| `extractions` | `id`, `response_id`, `extraction_version`, `state`, `schema_version`, `extraction_model`, `extracted_json`, `validation_error`, `qa_status`, `qa_notes`, `created_at`, `updated_at` | FK response; unique `(response_id, extraction_version)`; only latest valid version feeds metrics |
| `brand_mentions` | `id`, `extraction_id`, `brand_id`, `observed_name`, `position`, `recommended`, `recommendation_strength`, `sentiment`, `attributes_json`, `evidence_quote`, `created_at` | Derived from valid extraction; rebuilt on re-extraction; index `(brand_id, recommended)` |
| `claims_found` | `id`, `extraction_id`, `brand_id`, `fact_claim_id`, `claim_text`, `claim_type`, `extracted_verdict`, `extracted_severity`, `operator_verdict`, `operator_severity`, `review_state`, `evidence_quote`, `created_at`, `updated_at` | FK extraction; operator fields override extracted fields for reporting |
| `metrics` | `id`, `run_id`, `scope_type`, `scope_key`, `metric_key`, `n`, `value`, `ci_low`, `ci_high`, `metadata_json`, `computed_at` | Disposable; unique `(run_id, scope_type, scope_key, metric_key)`; recompute deletes by `run_id` first |
| `findings` | `id`, `run_id`, `finding_type`, `severity`, `title`, `body_md`, `evidence_json`, `created_at`, `updated_at` | Derived; rows are regenerate-only in MVP — operators edit narrative in report sections, never finding rows |
| `report_sections` | `id`, `run_id`, `section_key`, `position`, `generated_md`, `edited_md`, `state`, `created_at`, `updated_at` | Unique `(run_id, section_key)`; `edited_md` always wins |
| `run_events` | `id`, `run_id`, `job_id`, `level`, `event_type`, `message`, `metadata_json`, `created_at` | Append-only; index `(run_id, created_at)` |

## 3. Provider capability matrix

Provider details are implementation inputs, not marketing claims. Verify model IDs, pricing, and feature support against official docs on the implementation date.

| Provider | MVP role | API format | Default model | Grounded | Citations | JSON output | Env keys | Milestone |
|---|---|---|---|---|---|---|---|---|
| Mock | Permanent provider #0 | Local fixture adapter | `mock-fixture-v1` | Yes, synthetic | Yes, synthetic | Yes | none | M4 |
| DeepSeek | First live validation provider | OpenAI-compatible Chat Completions | `deepseek-v4-flash` | No until verified | No until verified | Yes, per official docs | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_DEFAULT_MODEL` | M8 |
| MiniMax | Candidate second validation provider | OpenAI-compatible or Anthropic-compatible, choose one before coding | `MiniMax-M3` | No until verified | No until verified | Verify before coding | `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_DEFAULT_MODEL` | M9 candidate |
| OpenAI | Later audit provider | Official OpenAI API | TBD at implementation | Verify | Verify | Verify | `OPENAI_API_KEY` | M9 |
| Anthropic | Later audit provider | Official Anthropic API | TBD at implementation | Verify | Verify | Verify | `ANTHROPIC_API_KEY` | M9 |
| Google | Later audit provider | Official Gemini API | TBD at implementation | Verify | Verify | Verify | `GOOGLE_API_KEY` | M9 |
| Perplexity | Later audit provider | Official Perplexity API | TBD at implementation | Expected | Expected | Verify | `PERPLEXITY_API_KEY` | M9 |

DeepSeek pricing baseline for M8 is read from official docs at implementation time. As of 2026-07-02, docs list `deepseek-v4-flash` and `deepseek-v4-pro`, OpenAI base URL `https://api.deepseek.com`, Anthropic base URL `https://api.deepseek.com/anthropic`, and pricing per 1M tokens. Do not hard-code those prices outside provider config.

## 4. Seeds and fixtures

Seed and fixture files are implementation contracts:

- `fixtures/demo-project.json`: one realistic project used by wizard, matrix, mock E2E, dashboard, and report tests.
- `fixtures/mock-responses/README.md`: manifest of required mock response archetypes.
- `fixtures/golden/README.md`: manifest for expected extractions and metric outputs.
- Prompt templates are seeded into `prompt_templates`; they are not hard-coded in JSX.

The seed script must be idempotent. Running it twice creates no duplicate projects, brands, templates, fixtures, or expectations.
