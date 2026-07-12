> LIFECYCLE: ACTIVE · ROLE: CANON · OWNS: quick orientation and local setup pointer

# Parallax (product: Resonance)

Parallax is the measurement and simulation engine behind Resonance. It measures how AI assistants describe, rank, cite, and misrepresent brands, then tests candidate framing fixes on persona-conditioned synthetic buyer panels — two structurally separate epistemic layers, the Evidence Layer (audit) and the Simulation Layer (resonance studies), that never mix their data (D-077, C-12). Externally the product is one brand, Resonance, no exceptions (`BRAND_PLAYBOOK.md`); internally the repo, package, and code keep the Parallax name (D-063).

## Start here

1. Read `MASTER_CONTEXT.md`.
2. Read the relevant milestone in `PRD.md`.
3. Read `DEVELOPMENT_GUIDELINES.md` section A before implementation.
4. Read `ENGINEERING_SPEC.md` before schema, provider, worker, seed, or fixture work.
5. Read `RENDER_DEPLOYMENT.md` before touching deploy configuration.
6. Writing external-facing copy, the deck, or the marketing site? Read `BRAND_PLAYBOOK.md` first (canonical positioning, voice, and claims law) — see also `BRAND_SITE_GUIDE.md` and `site/`.

## Features

- **End-to-end audit pipeline** — intake wizard, budget-aware prompt matrix with versioned approval, a mock run pipeline, structured extraction with claim verification, deterministic metrics with Wilson intervals, a dashboard with ≤2-click drill-down to raw answers, a findings engine, and an editable report builder with Markdown/print/JSON/CSV export.
- **Five providers, one interface** — DeepSeek (ungrounded validation) plus OpenAI, Anthropic, Gemini, and Perplexity (grounded, with normalized citations); a provider that dies mid-run degrades gracefully instead of failing the whole run.
- **The Four P's** — every prompt, metric, and report chapter answers one client question: Presence, Position, Perception, Proof. The prompt-frame rule keeps metrics from counting a signal the prompt itself planted (D-054).
- **Per-competitor spectrum** — the dashboard ranks the client against each tracked competitor, not "rest of the field."
- **Trust and provenance** — report claims carry n, provider, mode, and date; every dashboard figure drills to the eligible raw responses behind it.
- **Simulation Layer (M16+)** — persona-conditioned synthetic panels react to measured AI framing and candidate fixes, scored with Semantic Similarity Rating; results are always comparative (ΔPI, never a purchase-probability claim) and carry a SIMULATED badge, structurally walled off from audit data.
- **Live infrastructure** — shared-password auth, encrypted-credential Settings, per-provider daily budgets, and one configured extraction engine.

For milestone-by-milestone status, see `PRD.md` §11. For architecture decisions and their rationale, see the Decision Log in `MASTER_CONTEXT.md` §9.

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
pnpm test:e2e                 # Playwright smoke + axe (D-092); optional locally, required in CI
pnpm dev:all                 # app + polling worker together (what you usually want)
```

Node is pinned in `.node-version`; pnpm via `packageManager`.

`pnpm dev:all` runs the Next app and the background worker in one command, so a run
started in the UI actually executes. On Render these are two always-on services, so
production behaves the same way. If you only want the UI (no run processing), use
`pnpm dev` and `pnpm worker` in separate terminals instead — the worker is required
to process any run. A run started with no worker running shows a WORKER OFFLINE
banner on its run page.

`pnpm db:migrate` needs a running Postgres at `DATABASE_URL` and applies the tracked migrations in `src/db/migrations`.

Useful scripts:

- `pnpm test:e2e` — Playwright critical-journey smoke + axe floor (D-092); boots ephemeral Postgres + Next on :3100.
- `pnpm test:mock-e2e` — the full mock pipeline end to end (500-job run, worker kill/restart, failure injection).
- `pnpm demo:walkthrough` — populates the seeded demo project with a completed mock audit run at $0 so every view is walkable.
- `pnpm demo:resonance` — populates the seeded demo project with a completed mock resonance study at $0.
- `pnpm audit:deepseek-mini` — the first paid step: a small DeepSeek validation run (needs a key in Settings).
- `pnpm archive:evidence <runId>` — writes an off-Render evidence pack for a delivered audit or resonance run.
- `pnpm test:db` — boots the same ephemeral test-DB instance standalone in the foreground for manual poking (D-078).
- `pnpm recompute:resonance` — one-shot dev-DB sweep migrating existing resonance runs' metric rows to the current composite scope-key format (D-080).
- `pnpm research:m34a:collect` — bounded, explicitly capped M34A development collection using the adopted bare prompts; retains raw provenance and treats offset-span extraction as optional human-review assistance.
- `pnpm research:m34a:workflow` / `pnpm research:m34a:report` — local research harness commands for the historical development workflow. Retired pre-M34A commands now fail behind an explicit guard under `research:retired:m34:*`. See `docs/audits/m34/m34a-harness.md`.

The canonical per-milestone acceptance command list lives in `DEVELOPMENT_GUIDELINES.md` section F.

## Secrets

Do not put DeepSeek, OpenAI, Anthropic, Gemini, or Perplexity API keys in source files, `.env.example`, or `render.yaml`.

Provider API keys are entered after login in the Settings UI. The server encrypts them in Postgres using `CREDENTIALS_ENCRYPTION_KEY`; only server-side provider code and the worker may decrypt them.

Render still needs app-level secrets such as `APP_PASSWORD`, `SESSION_SECRET`, and `CREDENTIALS_ENCRYPTION_KEY`.

## Render

The first deploy contract is in `RENDER_DEPLOYMENT.md`; the Blueprint is `render.yaml`.
