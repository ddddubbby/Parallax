# DEVELOPMENT_GUIDELINES.md - Parallax

> How to build. Constraints and decisions live in `MASTER_CONTEXT.md`; product scope lives in `PRD.md`.

---

## A. Development principles

Bias: caution over speed. The recurring failure mode these prevent is plausible code that does more than was asked.

### A1. Think Before Coding

Do not assume. Surface tradeoffs before implementation.

- State assumptions explicitly.
- If a request has multiple interpretations, present them.
- If a simpler approach exists, say so.
- If something is confusing, stop and name it.

For implementation sessions, the boot ritual in `MASTER_CONTEXT.md` section 8 operationalizes this rule.

### A2. Simplicity First

Write the minimum code that solves today's problem.

- No abstractions for single-use code.
- No speculative configurability.
- No multi-tenant scaffolding in MVP.
- No provider strategy factory; use a plain registry map until a real second mechanism exists.
- No queue vendor unless the jobs table and polling worker demonstrably fail.

### A3. Surgical Changes

Touch only what serves the task.

- Do not reformat unrelated files.
- Do not rename or refactor adjacent code while fixing something else.
- Remove imports or variables orphaned by your change.
- Any diff touching `/src/db/schema` must include a migration.
- Any diff touching `/src/core` metric math must include relevant unit or golden test changes.

### A4. Goal-Driven Execution

Define verification before writing code.

Examples:

1. Add unique job key -> verify duplicate insert fails.
2. Add worker claim transition -> verify kill/restart produces exact row counts.
3. Add circuit breaker -> verify failure injection pauses run and logs an event.

Definition of done: relevant test or acceptance criterion passes, diff is surgical, docs update if facts changed, and handoff ritual is complete.

## B. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js 15 App Router + TypeScript | Node runtime, `output: "standalone"` for Render |
| UI | Tailwind + shadcn/ui + Recharts wrappers | Chrome desktop first |
| DB | Postgres + Drizzle | Schema and migrations in git |
| Worker | Plain Node polling loop | Same repo and types as app |
| Validation | Zod everywhere | env, DTOs, provider results, extraction schema |
| Tests | Vitest | Unit, golden, integration scripts |
| Observability | pino + `run_events` + Sentry | Operator-visible events in DB |
| Deploy | Render | Web service, worker, Postgres |

Env rules:

- Secrets live only in environment settings, never in git.
- `.env.example` must stay current.
- Processes fail fast on missing required env vars for the active mode.

## C. Modularity setup

### C1. Layout rules

1. Modules communicate through database rows and typed interfaces, not each other's internals.
2. `/src/core` is pure. It imports no project layer and contains constants, domain types, Zod schemas, and pure math/rules.
3. UI never imports `/src/providers`.
4. UI data crosses DTO boundaries through server actions or route handlers.
5. Components format data; they do not calculate metrics.
6. Charts are wrapped as local components such as `<SoVChart data />`.

### C2. Provider abstraction

```ts
type ProviderId =
  | "mock"
  | "deepseek"
  | "minimax"
  | "openai"
  | "anthropic"
  | "google"
  | "perplexity";

type GenerationMode = "grounded" | "ungrounded";

interface GenerationRequest {
  promptText: string;
  mode: GenerationMode;
  maxOutputTokens?: number;
  temperature?: number;
}

interface Citation {
  url: string;
  domain: string;
  title?: string;
}

interface GenerationResult {
  text: string;
  citations: Citation[];
  modelVersion: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
}

interface LLMProvider {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
  defaultModel: string;
  concurrency: number;
  generate(req: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>;
  estimateCostUsd(req: GenerationRequest): number;
}
```

Provider rules:

- Mock is provider #0 and is always available.
- DeepSeek is the first live validation provider. Initial capability: ungrounded generation.
- MiniMax is a candidate second live provider. Do not implement until API-key mode and selected API format are confirmed.
- OpenAI, Anthropic, Gemini, and Perplexity are later adapters.
- Adding a provider means one adapter file, one registry entry, env keys, typed errors, cost estimate, test fixture coverage, and a passing mini-audit.
- If `supportsGrounded` is false, run creation must block grounded jobs for that provider.
- Citation normalization happens inside provider adapters.

### C3. Data invariants

- `responses` are immutable. Never update raw response text, model version, cost, citations, or token counts.
- Re-extraction writes a new `extractions` row with incremented `extraction_version`.
- Approved `matrix_versions` are frozen. Prompt cells store resolved text, intent, persona, market, variant, and competitor order.
- `metrics` are disposable. Recompute deletes and rebuilds metrics for a run.
- `report_sections.edited_md` wins over `generated_md`.
- Mock rows are flagged and never aggregate with live rows.
- Validation mini-runs are flagged and never presented as client-ready audit evidence.

### C4. Canonical value sets

Run mode:

- `mock`
- `live_validation`
- `live_audit`

Generation mode:

- `grounded`
- `ungrounded`

Intent:

- `discovery`
- `consideration`
- `comparison`
- `validation`
- `objection`

Provider error type:

- `rate_limit`
- `timeout`
- `server_error`
- `auth_error`
- `malformed_output`
- `unsupported_mode`
- `unknown`

Claim verdict:

- `supported`: model claim matches a fact-sheet claim.
- `contradicted`: model claim conflicts with a fact-sheet claim.
- `outdated`: model claim was previously true or plausibly historical but not current.
- `unsupported`: model claim is checkable but no fact-sheet support exists.
- `ambiguous`: wording is too vague for deterministic matching.
- `not_checked`: claim is out of scope or awaiting operator review.

Claim severity:

- `none`: supported or not actionable.
- `low`: minor wording or weak unsupported claim.
- `medium`: commercially relevant misinformation.
- `high`: pricing, security, compliance, availability, or legal-sensitive misinformation.

Detailed lifecycle states, table specs, provider capability matrix, and seed contracts live in `ENGINEERING_SPEC.md`. That file is the source of truth for M0.5 execution readiness.

## D. Cost and safety guardrails

Defaults:

- `MAX_CELLS_PER_RUN = 50`
- `DEFAULT_MATRIX_CELLS = 40`
- `AUDIT_REPETITIONS = 5`
- `VALIDATION_REPETITIONS = 2`
- `DEFAULT_VALIDATION_RUN_CAP_USD = 2`
- `DEFAULT_AUDIT_RUN_CAP_USD = 25`
- `DEFAULT_PROVIDER_CONCURRENCY = 3`
- `MAX_JOB_ATTEMPTS = 3`
- `EXTRACTION_ATTEMPTS = 2`
- `FAILURE_CIRCUIT_BREAKER_RATE = 0.20`

Budgeting:

- Structural cap limits calls before provider selection.
- Run cap gates the start button and powers the live meter.
- Provider daily budget env vars backstop usage.
- DeepSeek and MiniMax prices must be treated as config, not constants hidden in UI.
- Any current provider model/pricing assumptions must be verified against official docs before live implementation.

Provider env variables:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_DEFAULT_MODEL`
- `MINIMAX_API_KEY`
- `MINIMAX_BASE_URL`
- `MINIMAX_DEFAULT_MODEL`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `PERPLEXITY_API_KEY`
- `PROVIDER_DAILY_BUDGET_USD` — global default daily budget applied to any provider without an override
- `<PROVIDER>_DAILY_BUDGET_USD` (e.g. `DEEPSEEK_DAILY_BUDGET_USD`) — optional per-provider override; this pair satisfies C-2's per-provider daily budget requirement (D-012)

## E. Extraction and metrics

### E1. Extraction contract

The PRD owns the canonical extraction shape. Implementation should put the corresponding Zod schema in `/src/core/extraction.ts` and test it against fixtures.

Extraction prompt requirements:

- Return JSON only.
- Preserve short evidence quotes for every mention and claim.
- Do not infer citations when the provider did not return citations.
- Use `canonical_brand_id: null` when the observed brand cannot be matched.
- Do not mark a brand recommended unless the answer explicitly endorses, shortlists, ranks favorably, or says it is a good fit.
- Evidence quotes must be <=240 characters. If the relevant passage is longer, use the shortest exact excerpt that supports the extraction.
- Empty arrays are valid for brands, citations, and claims.
- Duplicate observed mentions of the same canonical brand collapse into one brand record using the earliest position and strongest recommendation.
- Unranked prose uses `position: null`; ranked or ordered lists use 1-based position.
- Refusals set `refusal: true` and still extract any visible brand claims if present.
- Malformed-output layering (D-011): if the provider call returns any usable text, the job succeeds and the text is stored as an immutable response — content problems are the extraction layer's concern. The `malformed_output` job error is reserved for transport-level failures where no usable text was received and no response row is stored. At the extraction layer, `malformed: true` marks a response that is truncated or garbled but still partially extractable; raw text that is unusable for extraction dead-letters (`pending -> dead_lettered`) — do not fabricate a partial extraction.
- Extraction confidence is intentionally excluded for MVP. Evidence quotes plus QA sampling are the auditability mechanism.
- Operator claim overrides are stored alongside extracted values, never by overwriting extracted values.

### E2. Metric rules

- All metrics are pure functions over validated extractions.
- Eligible sample (D-014): a stored response whose latest extraction is `valid` (or `qa_reviewed`) with `refusal: false`. Refusals, dead-lettered extractions, and responses with no valid extraction are excluded from every metric denominator. Refusal count is reported separately as a diagnostic, never inside a rate.
- All rate metrics (Mention Rate, Recommendation Rate, Share of Voice, Citation Share, Accuracy Rate) use eligible samples in scope as the denominator basis. "In scope" means the eligible samples matching the metric row's scope (overall, provider, mode, intent, market, persona, or cell cluster).
- Wilson intervals use the same implementation everywhere.
- Small-n threshold is n >= 30 eligible samples for aggregate client-facing claims. Cell-level findings such as lost-shortlist are exempt (D-015): they may render at any n but always carry a "directional only" label.
- Validation mini-runs may display values with a validation-only badge and no client-ready claims.
- Mock and live data never mix.
- Grounded and ungrounded data are split by default; explicit comparison views may show them side by side.

## F. Testing and QA

| Test | Scope | Runs |
|---|---|---|
| Golden dataset | Fixtures -> exact extraction -> exact metrics | Every commit |
| Unit | `/src/core` allocation, metrics, alias matching, findings | Every commit |
| Integration | Project -> matrix -> run -> extract -> metrics -> report | Before milestone merge |
| Failure injection | Mock timeout, 429, 500, malformed output, restart | From M4 onward |
| Live validation | 5 cells x k=2 against DeepSeek under $2 | M8 |
| Manual checklist | Wizard, matrix, run, dashboard, report | Milestone merge |

Milestone acceptance commands:

- M0: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, local `/health` smoke check.
- M1: `pnpm db:migrate`, `pnpm db:seed`, run seed twice, verify no duplicate seed rows.
- M3: allocator unit tests, direct API attempt at 51 cells, approval immutability test.
- M4: `pnpm test:mock-e2e`, worker kill/restart check, failure injection check.
- M5: `pnpm test:golden`, extraction retry/dead-letter tests, metric recompute idempotency test.
- M8: `pnpm audit:deepseek-mini`, 5 cells x k=2 under `$2`, validation labels visible.

Standing rules:

- Every discovered bug gets a regression test or checklist line.
- Dead-lettered items are visible and counted.
- Migrations are applied to a scratch DB in CI before production use.
- Production destructive migrations require `pg_dump` first.

Manual checklist seeds:

- Wizard: refresh mid-step keeps data; browser back safe; draft resumes; alias overlap fires.
- Matrix: default <=50 for extreme inputs; 51st blocked UI and API; approved version immutable.
- Run: projected cost shown; cancel works; worker kill/restart exact counts; MOCK and validation labels visible.
- Dashboard: three figures spot-checked against SQL; drill-down <=2 clicks; insufficient-data guard works.
- Report: edit section A, regenerate section B, A intact; export opens; every number traceable.

## G. Workflow

- One active session, one branch per milestone.
- Commit at every green-test state.
- Any schema plan must say migration.
- Interface, table, dependency, provider capability, or invariant changed? Log it in `MASTER_CONTEXT.md` section 9.
- Handoff includes a 3-line milestone progress note in `PRD.md`.
