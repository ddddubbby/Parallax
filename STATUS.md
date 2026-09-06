> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M57 pivot milestone, phase state, next action, and integration target · TRACKER: M57_BUILD_PLAN.md

# STATUS.md — M57 control plane

| Field | Value |
|---|---|
| **Active product** | Windtunnel operator web product (external name per D-128; internal identifiers unchanged) — M57 pivot, site compliance (D-127), SEO page architecture; no product behavior change |
| **Product contract** | [PRD.md](PRD.md) (requirements unchanged; drift annotations only) |
| **Build plan** | [M57_BUILD_PLAN.md](M57_BUILD_PLAN.md) |
| **Branch** | `m57`, cut from `main@c478231` (PR #17 merge) |
| **Current milestone** | M57 — pivot to Windtunnel, site compliance, SEO page architecture |
| **Milestone state** | P0 done on `m57` (governance); P1a next |
| **Next action** | P1a — Windtunnel on every visible surface: `site/` copy to the D-127 lexicon, og/mark assets, `set-site-domain.sh` stamping to `https://windtunnel.observer`, `vercel.json` www→apex 301, root-docs name sweep; commit `M57 P1a: …` |
| **Blocked on** | Nothing for P0–P2a. Operator-gated, non-blocking for code: domain purchase + Vercel attach (default `windtunnel.observer` assumed; a different final domain is one idempotent re-stamp), `hello@` mailbox (P1 keeps `resonance.research@pm.me`), profile URLs for `sameAs`, form endpoint (P3), trademark search, Search Console/Bing submission |
| **Integration order** | `m57` merges to `main` after P3 closeout |
| **Pending merge** | `m53` (D-123 sampling terminology, 343ab62, 8 behind main) stays unmerged by operator decision; trunk `PRD.md` has no §8.41 and `DECISIONS.md` no D-123 until it lands |
| **Parked product** | Resonance GEO agent (historical name) remains parked (D-116); `AGENT_*` headers read PARKED from M56 P2 |

## M57 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Governance: D-128 + register edges, M56 plan archived (byte-frozen), `M57_BUILD_PLAN.md`, STATUS/PRD/MASTER_CONTEXT sync, S-130 truncation + S-131, §G gotcha | Done |
| P1a | External surfaces: site pages, og/mark assets, brand-kit, domain stamping script, www→apex redirect, root-docs name sweep | Pending |
| P1b | `src/` user-visible strings via `PRODUCT_NAME`; copy-test updates; `ui-contracts` guard | Pending |
| P2a | SEO page architecture: studies hub, per-study page, method/methodology pages, JSON-LD, robots AI-bot groups, sitemap, llms.txt | Pending |
| P2b | Hotel + Leica study pages, dev-DB-verified (D-127) — absorbs the two M56 open follow-ups: run `cffd5856` date confirmation, and the hotel and Leica study pages | Pending |
| P3 | Contact form via operator endpoint; CSP `form-action`; two CTA intents | Pending |
| P3 closeout | Gates, STATUS/PRD/BUILD_NOTES handoff, PR `m57` → `main` | Pending |

## Baseline evidence (main@c478231)

- M56 P5 closeout gates (9dd5a23, merged via PR #17): lint 0 warnings, typecheck, docs:check (20 governed root docs, 19 historical), Vitest 915 passed / 12 skipped / 0 failed, `test:e2e` 18/18, `test:e2e:forecast` 4 passed, build green (proxy bypass), `git diff --check` clean.

## Open follow-ups (not M57 scope)

- Duplicate-helper merges and UI "Simulation runs/study pack" wording are recorded in D-126 as a future proposal.
