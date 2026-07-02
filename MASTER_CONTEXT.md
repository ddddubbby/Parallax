# MASTER_CONTEXT.md - Parallax

> The single canonical context file for this repository. Every AI coding session and every human contributor starts here. It contains project identity, non-negotiable constraints, durable decisions, and session rituals. Product scope lives in `PRD.md`; implementation rules live in `DEVELOPMENT_GUIDELINES.md`.

---

## 0. How to use this file

1. Read this file fully at session start. Then read the document relevant to the task.
2. Docs beat chat memory. If a conversation contradicts these documents, the documents win until the change is explicitly agreed and written into the Decision Log.
3. One fact, one home. Identity, constraints, decisions, and rituals live here. What to build lives in `PRD.md`. How to build lives in `DEVELOPMENT_GUIDELINES.md`.

---

## 1. What Parallax is

Parallax is an internal, operator-facing web tool that audits how AI systems describe, rank, recommend, cite, and misrepresent brands. It runs a curated prompt matrix across LLM provider APIs with repeated sampling, extracts structured metrics from stored raw answers, verifies AI claims against a client fact sheet, and generates an editable audit report.

It is used by one operator, usually a consultant, to produce paid client audits. It is not a SaaS product: no client logins, no billing, no marketing pages, and no white-label theming in MVP. The end client only receives exported reports and evidence packs.

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
- Metrics: Mention Rate, Recommendation Rate, Share of Voice, Avg First Position, sentiment, attribute-association matrix, citation share, accuracy rate, and Stability Index.
- Checkable claims about the client brand are matched against the client fact sheet and reviewed in the misinformation register.
- Aggregate findings and metric claims render only where n >= 30 eligible samples. Cell-level findings (for example lost-shortlist) are exempt from the threshold but always carry a directional-only label, as do low-stability clusters. Eligible samples are defined in `DEVELOPMENT_GUIDELINES.md` E2.

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

## 5. Stack snapshot

Hosting target: Render-only, with one `render.yaml` defining a Next.js web service, a background worker, and Postgres. Sanctioned fallback if DB cost matters: Render compute plus Supabase free Postgres.

Stack: Next.js 15 + TypeScript + Tailwind + shadcn/ui, Drizzle ORM, Zod, Vitest, pino, `run_events`, and Sentry.

| Command | Does |
|---|---|
| `pnpm dev` | Run the Next.js app locally |
| `pnpm worker` | Run the polling worker locally |
| `pnpm test` | Run Vitest, including golden dataset tests |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:studio` | Inspect data with Drizzle Studio |

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
/src/modules/report      Report section generation and export helpers
/src/providers           LLMProvider interface, mock, live provider adapters
/src/db                  Drizzle schema, migrations, repositories
/src/worker              Polling worker entrypoint
/fixtures                Mock responses and golden expectations
/scripts                 Local verification and seed scripts
```

## 7. Documents index

| File | Owns |
|---|---|
| `MASTER_CONTEXT.md` | Identity, constraints, decisions, rituals |
| `PRD.md` | Product scope, user journey, requirements, milestones |
| `DEVELOPMENT_GUIDELINES.md` | Architecture, provider contracts, schemas, tests, workflow |
| `DESIGN_GUIDELINES.md` | Visual language: tokens, typography, surfaces, motion, component rules, visual guardrails |
| `ENGINEERING_SPEC.md` | Detailed schema, lifecycle states, provider matrix, seeds, acceptance commands |
| `RENDER_DEPLOYMENT.md` | Render Blueprint assumptions, secret model, first-deploy checklist |
| `BUILD_NOTES.md` | Disposable per-session working memory for agent handoff; truncated at milestone merge |
| `README.md` | Quick orientation and local setup pointer |
| `fixtures/` | Demo project, mock response manifest, golden expectation manifest |

Split a section into a separate file only when it exceeds roughly 300 lines or changes at a clearly different cadence. Record the split in the Decision Log.

## 8. Session rituals

Boot ritual for implementation sessions:

> Read `MASTER_CONTEXT.md`, then the section for milestone M<N> in `PRD.md`, then `DEVELOPMENT_GUIDELINES.md` section A, then the active milestone's entries in `BUILD_NOTES.md`. For UI-facing milestones (M2, M3, M6, M7), also read `DESIGN_GUIDELINES.md`. Summarize the plan in <=10 bullets and list expected files to touch. Wait for confirmation before editing.

Handoff ritual:

> Append a session entry to `BUILD_NOTES.md` (template inside that file). Append decisions made this session to `MASTER_CONTEXT.md` section 9. Append a 3-line progress note to the current milestone in `PRD.md`. Give the commit message. If stopping mid-task or blocked, write the `BUILD_NOTES.md` entry immediately, even without the rest of the ritual.

Session rules: one active session at a time, one branch per milestone, plan before any multi-file edit, and any schema-change plan must say the word migration.

## 9. Decision Log

| ID | Date | Decision | Why | Alternatives rejected |
|---|---|---|---|---|
| D-001 | 2026-07 | Single TypeScript codebase, two entrypoints: app and worker | One mental model; shared Zod/Drizzle types | FastAPI/Python backend |
| D-002 | 2026-07 | Mock-first at exactly one boundary: the `LLMProvider` interface | Zero-cost E2E validation; mock remains permanent test/demo mode | Mocking DB; live-first development |
| D-003 | 2026-07 | 50-cell cap per run; k=5 protected for audit-grade runs; default 40 cells bottom-funnel weighted | Bounded cost and runtime; repetitions carry statistical validity | Cutting k; uncapped matrices |
| D-004 | 2026-07 | Render-only hosting for app, worker, and Postgres | One vendor/dashboard/bill | Vercel + Railway + Supabase as default |
| D-005 | 2026-07 | Consolidate the original plan into three canonical docs | Solo builder; fewer files stay maintained | Seven-file doc set |
| D-006 | 2026-07 | Adopt the four Karpathy coding principles as project law | Reduces plausible-but-wrong AI implementation drift | Ad-hoc style guidance |
| D-007 | 2026-07-02 | First live validation provider is DeepSeek; MiniMax is the second candidate; Western audit providers come later | DeepSeek and MiniMax expose compatible API paths and are cheaper for dry-run validation | Starting live work with four expensive providers |
| D-008 | 2026-07-02 | Grounded capability is provider-declared and enforced by run planning | Avoids mixing cheap ungrounded validation with grounded audit claims | Treating all provider output as equivalent |
| D-009 | 2026-07-02 | Add an M0.5 execution-readiness gate before product coding | Engineering teams need schema, states, provider capabilities, seeds, and acceptance commands before implementation | Starting M1 from high-level product docs only |
| D-010 | 2026-07-02 | Split execution contract into `ENGINEERING_SPEC.md` | Detailed schema and provider specs exceed the intended size/cadence of general development guidelines | Keeping all details in `DEVELOPMENT_GUIDELINES.md` |
| D-011 | 2026-07-02 | Malformed-output layering: any usable text a provider returns is stored as an immutable response and the job succeeds; content-level malformedness is handled at the extraction layer (partial-but-extractable sets `malformed: true`, unusable text dead-letters). The `malformed_output` job error is reserved for transport-level failures where nothing is stored | PRD treated malformed output as a retryable job error while guidelines dead-lettered it at extraction; with unique `job_id` on responses, a stored-then-retried job would collide. One layer must own content problems | Retrying jobs on content-level malformedness; relaxing response immutability/uniqueness |
| D-012 | 2026-07-02 | Daily budgets: global `PROVIDER_DAILY_BUDGET_USD` default plus optional `<PROVIDER>_DAILY_BUDGET_USD` overrides | C-2 requires per-provider budgets but only a single env var was specified; global-with-override keeps one knob while satisfying the constraint | One global budget only; mandatory per-provider vars |
| D-013 | 2026-07-02 | No exports table or state machine in MVP; Markdown, print-HTML, and CSV/JSON exports are synchronous downloads | The spec defined export states with no backing table; synchronous rendering is simpler and sufficient at MVP scale | Async export queue with `exports` table |
| D-014 | 2026-07-02 | Eligible sample = stored response whose latest extraction is valid (or QA-reviewed) with `refusal: false`; refusals and dead-letters are excluded from all metric denominators and reported separately | "Eligible samples" appeared in every rate metric but was never defined; metrics are pure functions so the definition is the implementation | Counting refusals in denominators; per-metric ad-hoc eligibility |
| D-015 | 2026-07-02 | The n >= 30 threshold applies to aggregate claims only; cell-level findings (lost-shortlist) render at any n with a mandatory directional-only label | A cell yields only k x engine-modes samples, so required cell-level findings were mathematically unreachable under a blanket n >= 30 rule | Blanket threshold; raising k |
| D-016 | 2026-07-02 | Mock fixture selection is keyed by a stable hash of `(resolved_text, provider_id, rep_index)`, never row UUIDs | UUID-keyed selection is not reproducible across re-seeds or fresh clones, undermining golden dataset guarantees in CI | Seeding by `cell_id` UUID; fixed hard-coded UUIDs in seeds |
| D-017 | 2026-07-02 | Provider credentials are website-entered settings encrypted in Postgres, not provider API-key environment variables | The operator does not want DeepSeek or other LLM API keys exposed through the codebase or deploy config; Settings UI is the intended control point | Provider API keys in `.env.example`, Render env, or hard-coded config |
| D-018 | 2026-07-02 | Add a Render Blueprint skeleton with web, worker, and Postgres but no LLM API keys | First deploy should be reproducible from the repo while keeping provider credentials operator-entered after login | Manual Render setup only; putting provider keys in Render env |
| D-019 | 2026-07-02 | Adopt the "machine-age evidence dossier" visual language in `DESIGN_GUIDELINES.md`: ink/paper dual surface, one signal-orange accent, mono-first typography, dossier metadata framing, silk-smooth motion budgets, and visual guardrails V-1 to V-12 | Operator taste (cyberpunk-refined, Bitcoin-native, visually smooth) codified once so UI sessions do not drift; badge and CI visibility rules get design-level enforcement | Ad-hoc styling per session; neon cyberpunk theme; global dark-only theme |
| D-020 | 2026-07-02 | Provider service config precedence: env vars (`<PROVIDER>_BASE_URL`, `<PROVIDER>_DEFAULT_MODEL`) are defaults; a non-null `base_url`/`default_model` on the provider's `provider_credentials` row overrides them. At most one `active` credential per provider, enforced by a partial unique index | The same fact lived in two homes with no precedence, and `(provider_id, label)` uniqueness allowed several active keys with no selection rule for the runner | DB-only config; multiple active credentials with precedence logic |
| D-021 | 2026-07-02 | Credential crypto and KEK lifecycle: AES-256-GCM with per-row nonce; fingerprint is SHA-256 of the raw key; rows carry `key_version` for future KEK rotation; decrypt failure marks the row `invalid` and prompts re-entry in Settings, never crashes the worker; the Render env group holding `CREDENTIALS_ENCRYPTION_KEY` must never be deleted/recreated — recovery from KEK loss is re-entering keys | Unpinned crypto invites per-session improvisation; a regenerated KEK silently orphans every stored credential | Unversioned ciphertext; crashing on decrypt failure; external KMS in MVP |
| D-022 | 2026-07-02 | The "diagnostic engine" term is retired; the extraction engine is a Settings-configured provider+model resolved through the same provider registry and credential service as generation. Extraction calls are counted in projected run cost, the per-run cap, and daily budgets. Mock runs and CI use fixture-backed extraction, never a live extraction engine | Extraction is a second layer of paid LLM calls that was invisible to every cost guard, and golden tests require deterministic extraction | Uncapped extraction spend; live extraction calls in CI; leaving "diagnostic engine" undefined |
| D-023 | 2026-07-02 | Confidence-interval methods are per metric: Wilson only for per-sample proportions (Mention Rate, Recommendation Rate, Accuracy Rate). Share of Voice, Citation Share, Avg First Position, and Stability Index ship in MVP as point estimates explicitly labeled as having no interval; bootstrap intervals are post-MVP | Wilson is statistically invalid for count ratios and means; shipping wrong intervals contradicts the statistical-honesty differentiator | Wilson everywhere; blocking MVP on bootstrap implementation |
| D-024 | 2026-07-02 | MVP production-hardening set: rate-limited login with constant-time password comparison and session expiry; worker heartbeat with staleness surfaced in Debug; post-audit evidence archive (EX-3 export plus database dump stored off-Render); additive-first migration discipline; `claims_found.reviewed_at` for the evidence chain | The shared password now guards spendable API credentials; Render workers have no health checks; managed-Postgres backup retention is thinner than the C-3 evidence promise | Deferring all hardening past the pilot; retrofitting review timestamps after M1 |
| D-025 | 2026-07-02 | Add `BUILD_NOTES.md`: append-only per-session working memory (goal, verified/unverified work, rejected approaches, exact next action, gotchas), written as step one of the handoff ritual and read in the boot ritual. Entries are disposable — deleted at milestone merge after anything durable graduates to a canonical doc | Commits and the PRD tracker capture milestone-level state but not mid-milestone dead ends, unverified work, or the next action — the expensive things for a fresh agent to re-discover | A broad ways-of-working/SOP handbook; putting session state in the PRD tracker; relying on git history alone |

## 10. Current state

Milestone status has exactly one home: the milestone tracker and progress notes in `PRD.md` section 11. Do not record status here.

## 11. Cross-platform wiring

This file stays canonical and tool-agnostic. Tool-specific files are thin pointers only:

- `CLAUDE.md`: import/pointer to this file.
- `AGENTS.md`: one-line instruction to read this file.
- `.cursor/rules/parallax.mdc`: always-on pointer to this file.

Verify each tool's current instruction-file behavior in official docs before relying on it.

## 12. Glossary

cell: one resolved prompt. engine-mode: provider plus grounding mode. rep: one repeated sample. run: execution of an approved matrix across selected engine-modes and repetitions. extraction: structured record parsed from one raw response. dead-letter: a failed job or extraction stored for review. golden dataset: hand-labeled fixtures with exact expected extractions and metrics. mock mode: seeded fixture-backed provider mode. stability index: mean pairwise Jaccard of top-5 brand sets across reps. lost-shortlist cell: high-intent cell where a competitor appears in >=60% of samples and the client appears in <=20%. fact sheet: operator-entered ground truth. matrix version: immutable approved prompt-cell snapshot.

"Validation" is overloaded; always qualify it: validation (intent) is one of the five prompt intents; validation run (`live_validation`, "validation-only") is a cheap k=2 pipeline dry-run that is never client-ready evidence; schema validation is Zod input/output checking. The provider id `google` is the Gemini provider — prose says Gemini, code says `google`.
