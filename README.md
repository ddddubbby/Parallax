# Parallax

Internal operator-facing web tool for auditing how AI systems describe, recommend, cite, and misrepresent brands.

Start here:

1. Read `MASTER_CONTEXT.md`.
2. Read the relevant milestone in `PRD.md`.
3. Read `DEVELOPMENT_GUIDELINES.md` section A before implementation.
4. Read `ENGINEERING_SPEC.md` before schema, provider, worker, seed, or fixture work.
5. Read `RENDER_DEPLOYMENT.md` before touching deploy configuration.

Current state: M0 foundation in progress. The repo has canonical docs and folder structure, but package dependencies have not been installed yet.

## Execution Readiness

M0.5 documentation is complete when engineers can answer these before coding:

- What tables, states, and indexes exist?
- Which provider is implemented first and what capabilities are allowed?
- What seed/demo data drives local validation?
- What commands prove each milestone is done?

M0 runnable scaffold is still pending. After package setup, the fresh-clone path should be:

```sh
pnpm install
cp .env.example .env.local   # then set DATABASE_URL to a running Postgres
pnpm db:migrate
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm dev
```

The canonical per-milestone acceptance command list lives in `DEVELOPMENT_GUIDELINES.md` section F.

The app is not expected to run until `package.json`, Next.js config, Vitest config, Drizzle config, CI, Render skeleton, and `/health` are added.

## Secrets

Do not put DeepSeek, MiniMax, OpenAI, Anthropic, Gemini, or Perplexity API keys in source files, `.env.example`, or `render.yaml`.

Provider API keys are entered after login in the Settings UI. The server encrypts them in Postgres using `CREDENTIALS_ENCRYPTION_KEY`; only server-side provider code and the worker may decrypt them.

Render still needs app-level secrets such as `APP_PASSWORD`, `SESSION_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`.

## Render

The first deploy contract is in `RENDER_DEPLOYMENT.md`; the Blueprint is `render.yaml`.
