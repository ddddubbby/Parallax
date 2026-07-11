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
| UI | Tailwind + shadcn/ui + Recharts wrappers | Chrome desktop first; visual language, tokens, and guardrails live in `DESIGN_GUIDELINES.md` |
| DB | Postgres + Drizzle | Schema and migrations in git |
| Worker | Plain Node polling loop | Same repo and types as app |
| Validation | Zod everywhere | env, DTOs, provider results, extraction schema |
| Tests | Vitest | Unit, golden, integration scripts |
| Observability | `run_events` (wired); pino + Sentry (target, not yet a dependency — `src/observability.ts`'s `reportError` is the seam, D-076/D-081/D-092) | Operator-visible events in DB |
| Deploy | Render | Web service, worker, Postgres |

Env rules:

- Secrets live only in environment settings, never in git.
- `.env.example` must stay current.
- Processes fail fast on missing required env vars for the active mode.
- LLM provider API keys are not environment variables in this project. They are operator-entered through Settings, encrypted at rest, and read server-side only.
- No secret may use a `NEXT_PUBLIC_` prefix or cross a DTO boundary.

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
  repIndex?: number; // D-028: read only by MockProvider for D-016 fixture selection; real adapters ignore it
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
- Adding a provider means one adapter file, one registry entry, Settings credential metadata, typed errors, cost estimate, test fixture coverage, and a passing mini-audit.
- If `supportsGrounded` is false, run creation must block grounded jobs for that provider.
- Citation normalization happens inside provider adapters.
- Provider adapters receive decrypted credentials from a server-only credential service. They never read provider API keys directly from environment variables.

Embedding abstraction (M18+, D-064) — a SEPARATE interface, never a widening of `LLMProvider` (the static display registry must not carry a paid capability):

```ts
interface EmbeddingProvider {
  providerId: string; // "openai" first; "mock" for unit tests only
  embed(req: { texts: string[]; model?: string; signal?: AbortSignal }): Promise<{
    vectors: number[][];
    model: string;
    tokens: number;
    costUsd: number;
  }>;
}
```

Embedding rules: resolved worker-side via `resolveEmbeddingProvider()` (`EMBEDDING_PROVIDER` env, D-035 split); every call carries `AbortSignal.timeout` (D-039); spend attributed to the embedding provider across all C-2 guards (D-022/D-044 pattern); mock runs and CI never call a live embedding engine — scoring is fixture-backed (`fixtures/ssr/fixture-pmfs.json`).

### C3. Data invariants

- `responses` are immutable. Never update raw response text, model version, cost, citations, or token counts.
- Re-extraction writes a new `extractions` row with incremented `extraction_version`.
- Approved `matrix_versions` are frozen. Prompt cells store resolved text, intent, persona, market, variant, and competitor order.
- `metrics` are disposable. Recompute deletes and rebuilds metrics for a run.
- `report_sections.edited_md` wins over `generated_md`.
- Mock rows are flagged and never aggregate with live rows.
- Validation mini-runs are flagged and never presented as client-ready audit evidence.
- Simulated rows never aggregate with measured rows (C-12): `matrix_versions.kind` discriminates; metrics recompute dispatches on kind; `resonance_*` scopes never appear from an audit run and vice versa — wall tests required whenever either recompute path changes. SSR scores are `extractions` rows discriminated by `extracted_json.kind='ssr'` (`schema_version` keeps its integer type — D-066) and follow the same versioning invariant as re-extraction. Anchor sets are versioned fixtures; a study pins its version at approval and re-scoring an old study must load the pinned version or fail loudly.

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
- Run cap gates the start button and powers the live meter. Projected and actual run cost include extraction calls, not just generation (D-022).
- Provider daily budget env vars backstop usage. Daily budgets reset at 00:00 UTC; a provider's daily spend is the sum of generation and extraction costs attributed to it on that UTC day.
- DeepSeek and MiniMax prices must be treated as config, not constants hidden in UI.
- Any current provider model/pricing assumptions must be verified against official docs before live implementation.

Provider env variables:

- `CREDENTIALS_ENCRYPTION_KEY` — 32-byte secret used by the server and worker to encrypt/decrypt website-entered provider credentials
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_DEFAULT_MODEL`
- `MINIMAX_BASE_URL`
- `MINIMAX_DEFAULT_MODEL`
- `PROVIDER_DAILY_BUDGET_USD` — global default daily budget applied to any provider without an override
- `<PROVIDER>_DAILY_BUDGET_USD` (e.g. `DEEPSEEK_DAILY_BUDGET_USD`) — optional per-provider override; this pair satisfies C-2's per-provider daily budget requirement (D-012)

Provider credential handling:

- The Settings UI posts provider API keys to a server action or route handler over HTTPS.
- The server encrypts the raw key before database persistence and stores only ciphertext, last four characters, and a non-reversible fingerprint.
- Crypto is pinned (D-021): AES-256-GCM with a fresh random nonce per row; the fingerprint is SHA-256 of the raw key; every row records `key_version` so a future KEK rotation can re-encrypt incrementally.
- Decrypt failure marks the credential `invalid` and surfaces re-entry in Settings. It never crashes the worker or the request.
- The raw key is never logged, returned to the browser, stored in `run_events`, written to fixtures, or placed in Render environment variables.
- The worker decrypts credentials just in time for a provider call and keeps them in memory only for that request.
- Credential verification calls must redact keys in thrown errors and logs.

## E. Extraction and metrics

### E1. Extraction contract

The PRD owns the canonical extraction shape. Implementation should put the corresponding Zod schema in `/src/core/extraction.ts` and test it against fixtures.

The extraction engine (D-022) is the Settings-configured provider+model that turns raw text into `ExtractedResponse` JSON. It resolves through the same provider registry and credential service as generation — no separate key path. Extraction call costs are recorded against the run's actual cost and count toward the extraction provider's daily budget; run planning includes one estimated extraction call per planned generation call. Mock runs and CI never call a live extraction engine: extraction there is fixture-backed, returning the expected outputs from the golden manifest.

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
- Interval methods are per metric (D-023). Wilson intervals apply only to per-sample proportions: Mention Rate, Recommendation Rate, Accuracy Rate. Share of Voice, Citation Share, Avg First Position, and Stability Index are count ratios or means where Wilson is invalid — in MVP they ship as point estimates explicitly labeled as having no interval (`ci_low`/`ci_high` null); bootstrap intervals are a post-MVP addition.
- The Wilson implementation lives once in `/src/core` and is used by every metric that qualifies for it.
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
| Playwright smoke + axe | Critical operator journey floor (`pnpm test:e2e`, D-092) | CI required check; before UI milestone Done |
| Manual checklist | Wizard, matrix, run, dashboard, report | Milestone merge (UI milestones: evidenced walk in `BUILD_NOTES.md` before Done, D-092) |

Milestone acceptance commands:

- M0: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, local `/health` smoke check.
- M1: `pnpm db:migrate`, `pnpm db:seed`, run seed twice, verify no duplicate seed rows.
- M3: allocator unit tests, direct API attempt at 51 cells, approval immutability test.
- M4: `pnpm test:mock-e2e`, worker kill/restart check, failure injection check.
- M5: `pnpm test:golden`, extraction retry/dead-letter tests, metric recompute idempotency test.
- M8: `pnpm audit:deepseek-mini`, 5 cells x k=2 under `$2`, validation labels visible.
- M16-M20: per-milestone QA gates in `RESONANCE_BUILD_PLAN.md` are the acceptance contract — including the M16 recompute-invariance check, M17/M18 C-12 wall tests plus audit `test:mock-e2e` regression, golden SSR math tests (hand-computed PMFs; must fail if min-subtraction or the (1+cos)/2 rescale is skipped), and the M19 `pnpm demo:resonance` $0 walkthrough. Gate outputs are pasted into `BUILD_NOTES.md`.
- M33+: `pnpm lint --max-warnings 0`, `pnpm test:e2e` (Playwright smoke + axe). Under `CI=true`, ephemeral Postgres startup failure is fatal (D-092); local `pnpm test` still fail-to-skips (D-078).
- M34A harness: `pnpm framing:m34a:collect` only with an explicit `--project`, `--provider`, `--run-id`, and capped live spend; then `pnpm framing:m34a:workflow` through blind packet → locked codebook → recurrence matrix → C-15 snapshot, plus `pnpm framing:m34a:report`. Verify the pure workflow contract with `vitest run src/core/framing-evidence.test.ts`. No command may implement semantic eligibility, clustering, medoid selection, or a production approval bypass (D-099).

Standing rules:

- Every discovered bug gets a regression test or checklist line.
- Dead-lettered items are visible and counted.
- Migrations are applied to a scratch DB in CI before production use.
- Migrations are additive-first: new columns/tables land before code depends on them; destructive changes ship in a later deploy, because the web service migrates in pre-deploy while the worker may still run older code.
- Production destructive migrations require `pg_dump` first.
- After each delivered audit, export the EX-3 evidence pack and take a redacted database snapshot stored off-Render before closing the engagement (D-024). The evidence archive excludes server-only provider credentials; managed-Postgres backup retention is not the evidence archive.
- CI lint must pass with zero warnings (`pnpm lint --max-warnings 0`, D-092).

Manual checklist seeds:

- Wizard: refresh mid-step keeps data; browser back safe; draft resumes; alias overlap fires.
- Matrix: default <=50 for extreme inputs; 51st blocked UI and API; approved version immutable.
- Run: projected cost shown; cancel works; worker kill/restart exact counts; MOCK and validation labels visible.
- Dashboard: three figures spot-checked against SQL; drill-down <=2 clicks; insufficient-data guard works; Simulation view never shares audit selectors/charts (C-12) and is not a sixth pillar tab.
- Report: edit section A, regenerate section B, A intact; export opens; every number traceable.

## G. Workflow

- One active session, one branch per milestone.
- Commit at every green-test / phase-green state (D-092), not only at milestone close.
- Any schema plan must say migration.
- Interface, table, dependency, provider capability, or invariant changed? Log it in `MASTER_CONTEXT.md` section 9.
- Handoff ritual (also in `MASTER_CONTEXT.md` §8): `BUILD_NOTES.md` session entry; Decision Log row when durable; `PROTECTED_REGISTER.md` append when a new decision protects a surface from delete/rename/merge (D-086); PRD tracker + progress note; update `README.md` / this file's command tables when scripts or acceptance gates change; update `DESIGN_GUIDELINES.md` only when a visual rule changes.
- Any proposal to delete, merge, rename, or "simplify away" an existing surface must check `PROTECTED_REGISTER.md` first (D-086).
- A UI-touching milestone cannot be marked Done until its interactive verification ran and is evidenced in `BUILD_NOTES.md` (D-092).
