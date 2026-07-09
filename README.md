# Parallax (product: Resonance)

Internal operator-facing web tool for auditing how AI systems describe, recommend, cite, and misrepresent brands — and, from M16, simulating how buyer segments respond to that AI framing. The product umbrella is **Resonance**, organized around two named epistemic layers — the Evidence Layer (audit) and the Simulation Layer (resonance studies), D-077; Parallax is the measurement engine's name and stays the repo/package name (D-063).

Start here:

1. Read `MASTER_CONTEXT.md`.
2. Read the relevant milestone in `PRD.md`.
3. Read `DEVELOPMENT_GUIDELINES.md` section A before implementation.
4. Read `ENGINEERING_SPEC.md` before schema, provider, worker, seed, or fixture work.
5. For the M16-M20 execution history, read `RESONANCE_BUILD_PLAN.md` — the (now-executed) step-by-step playbook with QA gates.
6. Read `RENDER_DEPLOYMENT.md` before touching deploy configuration.

Current state: M11 through M28 are complete (M16-M20 shipped the Simulation Layer — resonance studies, SSR scoring, and value-add template packs, PRD 8.19-8.22; M21 renamed the product's epistemic layers, D-077; M22 isolated tests onto an ephemeral DB and closed the GENERIC evidence loophole, D-078; M23 added the coverage contract and price/promo templates, D-079; M24 added multi-provider resonance, D-080; M25 added the `prompt_cells` freeze-trigger DB backstop, D-081; M26 shipped the calibration protocol and comparison harness, D-082; M27 added post-intake Setup editing, D-084; M28 added the buyer-voice guard and JTBD field clarity, D-085); M29 was a pause/cancel observability hotfix. M10 (the pilot audit) is still in progress — the DeepSeek gate is closed (a real 115-job live run succeeded), with the deploy and grounded-provider gates still open (see `RELEASE_CHECKLIST.md`).

The pipeline is end to end: intake wizard, budget-aware matrix with versioned approval, a mock run pipeline, structured extraction with claim verification, deterministic metrics with Wilson intervals, a dashboard with ≤2-click drill-down to raw answers, a findings engine, and an editable report builder with Markdown/print/JSON/CSV export. All five providers run through one interface — DeepSeek (ungrounded validation) plus OpenAI, Anthropic, Gemini, and Perplexity (grounded, with normalized citations); a provider that dies mid-run degrades gracefully (its jobs skip, the run completes PARTIAL). Live infrastructure is in place: shared-password auth, encrypted-credential Settings, per-provider daily budgets, and one configured extraction engine.

The product layer added since M10 prep:

- **The Four P's** — every prompt, metric, and report chapter answers one client question: Presence (am I in AI's consideration set?), Position (when compared, do I win?), Perception (how does AI describe me?), Proof (is the story true and sourced?). The dashboard and matrix are organized into these numbered pillars.
- **The prompt-frame rule** — a metric never counts a signal the prompt itself planted, so branded prompts are excluded from visibility metrics (see `MASTER_CONTEXT.md` D-054).
- **Per-competitor spectrum** — the dashboard ranks the client against each tracked competitor (mention share, head-to-head win rate), not "rest of the field".
- **Trust and provenance** — report claims carry n, provider, mode, and date; every dashboard figure drills to the eligible raw responses behind it.
- **Explanatory layer** — the matrix explains each pillar's business value and shows a live per-pillar sample budget against the n≥30 gate.

No client-facing live audit has shipped yet: every provider needs its API key entered via Settings, and `pnpm audit:deepseek-mini` is the first paid step. Node is pinned in `.node-version`; pnpm by `packageManager`.

## Local setup

```sh
pnpm install
cp .env.example .env.local   # defaults match the local dev database below
pnpm db:dev                  # embedded Postgres 17 on :5432, foreground; Ctrl+C stops
pnpm db:migrate              # in a second terminal
pnpm db:seed
pnpm lint
pnpm typecheck
pnpm test
pnpm dev:all                 # app + polling worker together (what you usually want)
```

`pnpm dev:all` runs the Next app and the background worker in one command, so a run
started in the UI actually executes. On Render these are two always-on services, so
production behaves the same way. If you only want the UI (no run processing), use
`pnpm dev` and `pnpm worker` in separate terminals instead — the worker is required
to process any run. A run started with no worker running shows a WORKER OFFLINE
banner on its run page.

`pnpm db:migrate` needs a running Postgres at `DATABASE_URL` and applies the tracked migrations in `src/db/migrations`.

Useful scripts:

- `pnpm test:mock-e2e` — the full mock pipeline end to end (500-job run, worker kill/restart, failure injection).
- `pnpm demo:walkthrough` — populates the seeded demo project with a completed mock audit run at $0 so every view is walkable.
- `pnpm demo:resonance` — populates the seeded demo project with a completed mock resonance study at $0 (M19, RR-5).
- `pnpm audit:deepseek-mini` — the first paid step: a small DeepSeek validation run (needs a key in Settings).
- `pnpm archive:evidence <runId>` — writes an off-Render evidence pack for a delivered audit or resonance run.
- `pnpm test:db` — boots the same ephemeral test-DB instance standalone in the foreground for manual poking (D-078).
- `pnpm recompute:resonance` — one-shot dev-DB sweep migrating existing resonance runs' metric rows to the current composite scope-key format (D-080).

The canonical per-milestone acceptance command list lives in `DEVELOPMENT_GUIDELINES.md` section F.

## Secrets

Do not put DeepSeek, OpenAI, Anthropic, Gemini, or Perplexity API keys in source files, `.env.example`, or `render.yaml`.

Provider API keys are entered after login in the Settings UI. The server encrypts them in Postgres using `CREDENTIALS_ENCRYPTION_KEY`; only server-side provider code and the worker may decrypt them.

Render still needs app-level secrets such as `APP_PASSWORD`, `SESSION_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`.

## Render

The first deploy contract is in `RENDER_DEPLOYMENT.md`; the Blueprint is `render.yaml`.
