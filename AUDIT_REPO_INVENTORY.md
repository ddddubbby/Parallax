# AUDIT_REPO_INVENTORY.md — M30 Cleanup Audit, Pass 2

> Full top-level file/directory classification per `AUDIT_METHODOLOGY.md` §2 Pass 2, plus the untracked-WIP owner-decision list. Classification categories: app source, canonical docs, historical docs, generated/cache, static marketing site, fixtures, scripts, tooling config. `.claude/` is tooling config (kept), not noise, per the methodology's explicit instruction. This document records classifications and one repo-noise observation (§4) — it does not delete, move, or rename anything.

---

## 1. Repo root classification

| Entry | Classification | Tracked? | Notes |
|---|---|---|---|
| `src/` | App source | Yes (267 files) | Next.js app, core, db, modules, providers, worker — see §2 for subdirectory detail |
| `scripts/` | Scripts | Yes (14 files + `lib/`) | Local verification, seed, demo, archive, and dev-DB scripts; all referenced by `package.json` or `.claude/launch.json` (see §5) |
| `fixtures/` | Fixtures | Yes (11 files across 4 subdirs) | `demo-project.json`, `mock-responses/`, `golden/`, `ssr/`, `calibration/` — matches `ENGINEERING_SPEC.md` §4's contract |
| `public/` | App source (static assets) | Partially — `public/.gitkeep` tracked, `public/brand/` untracked | See §3, untracked-WIP list |
| `MASTER_CONTEXT.md` | Canonical doc (current-state) | Yes | Identity, constraints, Decision Log, rituals |
| `PRD.md` | Canonical doc (current-state + append-only progress notes) | Yes | Product scope, requirements, milestone tracker |
| `DEVELOPMENT_GUIDELINES.md` | Canonical doc (current-state) | Yes | Architecture, provider contracts, testing |
| `ENGINEERING_SPEC.md` | Canonical doc (current-state) | Yes | Schema, lifecycle states, provider matrix, seeds |
| `DESIGN_GUIDELINES.md` | Canonical doc (current-state) | Yes | Visual language, tokens, guardrails |
| `RENDER_DEPLOYMENT.md` | Canonical doc (current-state) | Yes | Deploy contract, secret model |
| `RELEASE_CHECKLIST.md` | Canonical doc (current-state + append-only archive log) | Yes | Go-live gates, per-audit delivery record |
| `README.md` | Canonical doc (current-state) | Yes | Orientation, setup pointer |
| `CLAUDE.md` | Tooling config (thin pointer) | Yes | One-line import of `MASTER_CONTEXT.md` per §11's cross-platform wiring rule |
| `AGENTS.md` | Tooling config (thin pointer) | Yes | Same wiring rule, for Codex-family tools |
| `BUILD_NOTES.md` | Historical doc (append-only, disposable per D-025) | Yes | See `AUDIT_DOC_DRIFT_MATRIX.md` DD-20 — truncation candidate |
| `RESONANCE_BUILD_PLAN.md` | Historical doc (proposal/plan, executed) | Yes | See DD-17 — needs a status header, not currently misclassified as canon by this inventory |
| `M21_M26_BUILD_PLAN.md` | Historical doc (proposal/plan, executed) | Yes | See DD-18 — self-header says "untracked, uncommitted," which is false |
| `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md` | Historical doc (proposal/plan, executed) | Yes | See DD-19 — same false self-header |
| `CALIBRATION_PROTOCOL.md` | Canonical doc (describes not-yet-executed future work by design) | Yes | M26 deliverable; correctly labeled in its own header |
| `AUDIT_METHODOLOGY.md` | This audit's own plan artifact | Yes | Pass 0 output's sibling; produced before this session |
| `PROTECTED_REGISTER.md` | This audit's own Pass 0 output | Yes | Consulted throughout Passes 3-5, not re-analyzed |
| `AUDIT_DOC_DRIFT_MATRIX.md` | This audit's Pass 1+5 output | Yes (new, this session) | — |
| `AUDIT_REPO_INVENTORY.md` | This audit's Pass 2 output | Yes (new, this session — this file) | — |
| `AUDIT_REGISTER.md` | This audit's Pass 3 output | Yes (new, this session) | — |
| `AUDIT_STRUCTURE_MAP.md` | This audit's Pass 4 output | Yes (new, this session) | — |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.node-version` | Tooling config | Yes | Package/toolchain pins; `pnpm-workspace.yaml` carries the D-060/D-078 `allowBuilds` allowlist |
| `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `drizzle.config.ts`, `vitest.config.ts` | Tooling config | Yes | Framework/build/lint/test configuration |
| `render.yaml` | Tooling config | Yes | Render Blueprint (D-018, D-045) |
| `.env.example` | Tooling config | Yes | Non-secret defaults only, per C-11 |
| `.env.local` | Generated/local (secrets) | No (gitignored) | Real local dev secrets; correctly excluded |
| `.gitignore` | Tooling config | Yes | Covers `node_modules`, `.next`, `out`, `coverage`, `.env*.local`, `*.log`, `.DS_Store`, `*.tsbuildinfo`, `.pgdata`, `.pnpm-store` |
| `.github/workflows/ci.yml` | Tooling config | Yes | CI (lint, typecheck, test before deploy per `RENDER_DEPLOYMENT.md`) |
| `.claude/` (`launch.json`, `settings.local.json`, `worktrees/`) | Tooling config — **kept, not noise**, per methodology §2 | `launch.json`/`settings.local.json` tracked; `worktrees/` untracked-by-nature | See §5 — `launch.json` wires the Claude Preview harness to `scripts/dev-server.sh`, a real non-import reference |
| `.cursor/rules/parallax.mdc` | Tooling config | Yes | Cross-platform pointer per §11's wiring rule |
| `.next/`, `.pgdata/`, `.pnpm-store/`, `node_modules/`, `tsconfig.tsbuildinfo`, `.DS_Store` | Generated/cache | No (all gitignored) | Zero tracked files under any of these — confirmed via `git ls-files`; **`.DS_Store` explicitly out of scope per the methodology, not re-investigated beyond this confirmation** |
| `site/` | Static marketing site **+ untracked WIP** | No (untracked) | Standalone static site (`index.html`, `styles.css`, `motion.js`, `favicon.svg`, `assets/mark.svg`); not wired into the Next app, consistent with methodology §6's assumption. See §3 |
| `BRAND_PLAYBOOK.md`, `BRAND_SITE_GUIDE.md`, `public/brand/`, `Taste skill/` | Untracked WIP | No (untracked) | See §3 |

---

## 2. `src/` subdirectory map (app source detail)

Confirms and extends `MASTER_CONTEXT.md` §6's repo map (see `AUDIT_DOC_DRIFT_MATRIX.md` DD-5 for the doc-side gap this table exposes):

| Directory | Purpose | In MASTER_CONTEXT §6? |
|---|---|---|
| `src/app` | Next.js routes/pages (UI-only entrypoint) | Yes |
| `src/components` (+ `analysis`, `charts`, `dashboard`, `debug`, `intake`, `matrix`, `report`, `resonance`, `runner`, `semantic`, `settings`, `setup` subdirs) | Presentational components | Yes (top-level line only; subdirs not individually enumerated, which is fine — the map's own style doesn't enumerate `/src/app`'s route subtree either) |
| `src/core` | Domain types, Zod schemas, pure math/rules | Yes |
| `src/modules/intake` | Intake wizard + autosave | Yes |
| `src/modules/matrix` | Template rendering, allocation, approval | Yes |
| `src/modules/runner` | Run creation, job planning, cost guards | Yes |
| `src/modules/extraction` | Structured extraction, claim matching | Yes |
| `src/modules/analysis` | Metrics, findings, stability | Yes |
| `src/modules/resonance` | Lower-funnel studies: compile, SSR scoring, resonance metrics | Yes |
| `src/modules/report` | Report section generation, export helpers | Yes |
| `src/modules/auth` | Login/session (M8, D-034) | **No — missing, DD-5** |
| `src/modules/settings` | Credentials UI/service (M8, D-017/D-021) | **No — missing, DD-5** |
| `src/modules/dashboard` | Dashboard data assembly (M6) | **No — missing, DD-5** |
| `src/modules/setup` | Post-intake Setup editing (M27, D-084) | **No — missing, DD-5** |
| `src/providers` (+ `anthropic`, `deepseek`, `google`, `mock`, `openai`, `perplexity`) | `LLMProvider` interface + adapters | Yes (top-level line only) |
| `src/db` (+ `migrations`, `repositories`, `schema`) | Drizzle schema, migrations, repositories | Yes |
| `src/worker` | Polling worker entrypoint | Yes |

---

## 3. Untracked WIP — owner decision needed

Per the task's explicit instruction, this audit **records** that these items exist and need an owner decision; it does not recommend committing, gitignoring, or dropping any of them.

| Item | What it appears to be | Size | Owner decision needed |
|---|---|---|---|
| `BRAND_PLAYBOOK.md` | Brand strategy/voice document for the "Resonance" consumer-facing brand | 22KB | Commit to repo, move to a separate brand-assets location, or leave untracked indefinitely |
| `BRAND_SITE_GUIDE.md` | Site style guide (typography, layout, component rules for the marketing site) | 30KB | Same as above |
| `Taste skill/taste SKILL.md` | A custom Claude Code skill definition (design/taste guidance) — note the directory name contains a literal space | 1 file | Same as above; additionally whether this belongs under `.claude/skills/` as a proper plugin/skill location rather than a root-level directory with a space in its name |
| `public/brand/` (`brand-kit.html`, `resonance-logo-concept.png`, `resonance-logo-mark-concept.png`, `resonance-mark.svg`, `resonance-retro-wavelength-logo-concept.png`, `resonance-wavelength-logo-concept.png`) | Logo concept exploration + an HTML brand-kit viewer | 6 files | Same as above; also whether these belong under `public/` at all if the marketing site (`site/`) is meant to stay standalone from the Next app that `public/` serves |
| `site/` (`index.html`, `styles.css`, `motion.js`, `favicon.svg`, `assets/mark.svg`) | A standalone static marketing site prototype, separate from the Next.js app | 5 files | Same as above; per methodology §6's assumption this stays standalone and is not wired into the Next app during this audit — that assumption held (verified no import/reference from `src/` into `site/`) |

All five items are the operator's own live, separate-session work per the task's framing and `git status`'s snapshot at session start. This audit takes no position on disposition.

---

## 4. Repo-noise observation: vestigial `.gitkeep` files

Not part of the untracked-WIP list — these are tracked files, checked against the methodology's own note ("`.gitkeep` files are kept only where empty dirs are intentional").

**Finding:** All 19 tracked `.gitkeep` files in the repo sit in directories that also contain other tracked files, meaning every one of them is currently redundant (the directory would remain non-empty, and thus present in git, without it):

```
fixtures/golden/.gitkeep              (2 other tracked files in dir)
fixtures/mock-responses/.gitkeep      (3 other tracked files in dir)
public/.gitkeep                       (0 other tracked files — the ONE genuinely load-bearing .gitkeep, since public/brand/ is untracked WIP)
scripts/.gitkeep                      (13 other tracked files in dir)
src/app/.gitkeep                      (33 other tracked files in dir)
src/components/.gitkeep               (37 other tracked files in dir)
src/core/.gitkeep                     (53 other tracked files in dir)
src/db/migrations/.gitkeep            (25 other tracked files in dir)
src/db/repositories/.gitkeep          (19 other tracked files in dir)
src/db/schema/.gitkeep                (9 other tracked files in dir)
src/modules/analysis/.gitkeep         (2 other tracked files in dir)
src/modules/extraction/.gitkeep       (6 other tracked files in dir)
src/modules/intake/.gitkeep           (3 other tracked files in dir)
src/modules/matrix/.gitkeep           (3 other tracked files in dir)
src/modules/report/.gitkeep           (4 other tracked files in dir)
src/modules/runner/.gitkeep           (10 other tracked files in dir)
src/providers/deepseek/.gitkeep       (5 other tracked files in dir)
src/providers/mock/.gitkeep           (2 other tracked files in dir)
src/worker/.gitkeep                   (2 other tracked files in dir)
```

These were almost certainly added during M0 scaffolding (per `BUILD_NOTES.md` S-002's note about the initial directory structure) before each directory had real content, and were never cleaned up as files landed. This is a clean, low-risk "repo-noise" cleanup candidate (methodology §3's cleanup-PR ordering names "docs-only, repo-noise, pure dead code..." as the safe-first sequence) — 18 of the 19 could be deleted with zero effect; `public/.gitkeep` is the one exception and should be kept exactly because `public/brand/`'s contents are untracked (§3), so `public/` would otherwise have zero tracked files.

This observation is recorded here (Pass 2 inventory) rather than in `AUDIT_REGISTER.md` (Pass 3) because `.gitkeep` files are not code exports and fall outside the 7 named hotspot files' scope — but it is exactly the shape of finding Pass 3's register otherwise catalogs, so it is flagged explicitly rather than silently dropped.

---

## 5. Non-import reference notes relevant to Pass 2/3 (recorded here, applied in Pass 3)

- `scripts/dev-server.sh` is referenced by `.claude/launch.json`'s `parallax-web` configuration (used by the Claude Preview harness), not by any `package.json` script. This is a real, non-import, mechanism-level reference — confirmed live, not dead.
- `.claude/worktrees/` exists as an empty tooling-managed directory. The specific stray worktree repeatedly mentioned as a lint-noise source in `BUILD_NOTES.md` (S-055 through S-058, `optimistic-boyd-b78217`) no longer exists on disk and does not appear in `git worktree list` — it has already been cleaned up between those sessions and this audit. No action needed; noted so a reader of those BUILD_NOTES entries isn't left looking for a problem that's already resolved.

---

## 6. Summary

| Category | Count |
|---|---|
| App source (`src/`) | 267 tracked files across 11 `/src/modules`, 6 `/src/providers` adapters, `app`/`components`/`core`/`db`/`worker` |
| Canonical docs (current-state) | 9 (`MASTER_CONTEXT.md`, `PRD.md`, `DEVELOPMENT_GUIDELINES.md`, `ENGINEERING_SPEC.md`, `DESIGN_GUIDELINES.md`, `RENDER_DEPLOYMENT.md`, `RELEASE_CHECKLIST.md`, `README.md`, `CALIBRATION_PROTOCOL.md`) |
| Historical/plan docs | 4 (`BUILD_NOTES.md`, `RESONANCE_BUILD_PLAN.md`, `M21_M26_BUILD_PLAN.md`, `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md`) |
| This audit's own artifacts | 6 (`AUDIT_METHODOLOGY.md`, `PROTECTED_REGISTER.md` + 4 new outputs) |
| Fixtures | 11 files, 4 subdirs |
| Scripts | 14 files + `lib/` |
| Tooling config | `.claude/`, `.cursor/`, `.github/`, plus ~14 root config files |
| Generated/cache (gitignored, zero tracked) | 6 (`.next`, `.pgdata`, `.pnpm-store`, `node_modules`, `*.tsbuildinfo`, `.DS_Store`) |
| Static marketing site | 1 (`site/`, also untracked WIP) |
| Untracked WIP items needing an owner decision | 5 (`BRAND_PLAYBOOK.md`, `BRAND_SITE_GUIDE.md`, `Taste skill/`, `public/brand/`, `site/`) |
| Vestigial `.gitkeep` files (repo-noise, safe cleanup candidate) | 18 of 19 |
