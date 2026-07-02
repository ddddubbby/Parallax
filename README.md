# Parallax

Internal operator-facing web tool for auditing how AI systems describe, recommend, cite, and misrepresent brands.

Start here:

1. Read `MASTER_CONTEXT.md`.
2. Read the relevant milestone in `PRD.md`.
3. Read `DEVELOPMENT_GUIDELINES.md` section A before implementation.
4. Read `ENGINEERING_SPEC.md` before schema, provider, worker, seed, or fixture work.
5. Read `RENDER_DEPLOYMENT.md` before touching deploy configuration.

Current state: M4 is complete. The app has the runnable foundation, full schema and seed, intake wizard, budget-aware matrix with versioned approval, and a mock run pipeline — MockProvider, job planning under cost guards, a polling worker with retries/backoff/circuit breaker, run creation/progress UI, and a Debug console. Next product milestone is M5, extraction + metrics + golden dataset. Node version is pinned in `.node-version`; pnpm is pinned by `packageManager`.

## Execution Readiness

M0.5 documentation is complete when engineers can answer these before coding:

- What tables, states, and indexes exist?
- Which provider is implemented first and what capabilities are allowed?
- What seed/demo data drives local validation?
- What commands prove each milestone is done?

Fresh-clone local setup:

```sh
pnpm install
cp .env.example .env.local   # defaults match the local dev database below
pnpm db:dev                  # embedded Postgres 17 on :5432, foreground; Ctrl+C stops
pnpm db:migrate              # in a second terminal
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm dev                     # app, in one terminal
pnpm worker                  # polling worker, in another — required to process any run
```

Run `pnpm test:mock-e2e` to exercise the full mock pipeline end to end (500-job run, worker kill/restart, failure injection) against the local dev database.

The canonical per-milestone acceptance command list lives in `DEVELOPMENT_GUIDELINES.md` section F.

`pnpm db:migrate` needs a running Postgres reachable at `DATABASE_URL` and applies the tracked migrations in `src/db/migrations`.

## Secrets

Do not put DeepSeek, MiniMax, OpenAI, Anthropic, Gemini, or Perplexity API keys in source files, `.env.example`, or `render.yaml`.

Provider API keys are entered after login in the Settings UI. The server encrypts them in Postgres using `CREDENTIALS_ENCRYPTION_KEY`; only server-side provider code and the worker may decrypt them.

Render still needs app-level secrets such as `APP_PASSWORD`, `SESSION_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`.

## Render

The first deploy contract is in `RENDER_DEPLOYMENT.md`; the Blueprint is `render.yaml`.
