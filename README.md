# Parallax

Internal operator-facing web tool for auditing how AI systems describe, recommend, cite, and misrepresent brands.

Start here:

1. Read `MASTER_CONTEXT.md`.
2. Read the relevant milestone in `PRD.md`.
3. Read `DEVELOPMENT_GUIDELINES.md` section A before implementation.
4. Read `ENGINEERING_SPEC.md` before schema, provider, worker, seed, or fixture work.
5. Read `RENDER_DEPLOYMENT.md` before touching deploy configuration.

Current state: M2 is complete. The app has the runnable foundation, full schema and seed, and seven-step intake wizard with autosave, resume, review, and completion. Next product milestone is M3, the budget-aware prompt matrix. Node version is pinned in `.node-version`; pnpm is pinned by `packageManager`.

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
pnpm dev
```

The canonical per-milestone acceptance command list lives in `DEVELOPMENT_GUIDELINES.md` section F.

`pnpm db:migrate` needs a running Postgres reachable at `DATABASE_URL` and applies the tracked migrations in `src/db/migrations`.

## Secrets

Do not put DeepSeek, MiniMax, OpenAI, Anthropic, Gemini, or Perplexity API keys in source files, `.env.example`, or `render.yaml`.

Provider API keys are entered after login in the Settings UI. The server encrypts them in Postgres using `CREDENTIALS_ENCRYPTION_KEY`; only server-side provider code and the worker may decrypt them.

Render still needs app-level secrets such as `APP_PASSWORD`, `SESSION_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`.

## Render

The first deploy contract is in `RENDER_DEPLOYMENT.md`; the Blueprint is `render.yaml`.
