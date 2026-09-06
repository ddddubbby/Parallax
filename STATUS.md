> LIFECYCLE: ACTIVE · ROLE: RECORD · OWNS: the branch-local M57 pivot milestone, phase state, next action, and integration target · TRACKER: M57_BUILD_PLAN.md

# STATUS.md — M57 control plane

| Field | Value |
|---|---|
| **Active product** | Windtunnel operator web product (external name per D-128; internal identifiers unchanged) — M57 pivot, site compliance (D-127), SEO page architecture; no product behavior change |
| **Product contract** | [PRD.md](PRD.md) (requirements unchanged; drift annotations only) |
| **Build plan** | [M57_BUILD_PLAN.md](M57_BUILD_PLAN.md) |
| **Branch** | `m57`, cut from `main@c478231` (PR #17 merge) |
| **Current milestone** | M57 — pivot to Windtunnel, site compliance, SEO page architecture |
| **Milestone state** | P0–P2b done on `m57`; P3 contact form blocked on the operator's form endpoint; closeout gates green |
| **Next action** | Operator: buy + attach `windtunnel.observer` (and `www.`) in Vercel, keep `resonance.observer` 301ing for ≥12 months, provision `hello@`, Search Console + Bing submission, `sameAs` profile URLs. Engineering (when the endpoint exists): P3 contact form commit `M57 P3: …` — form + `thanks.html` + CSP `form-action` widened in the same commit, then push `m57` and open the PR to `main` |
| **Blocked on** | P3 form needs the operator's form endpoint (Formspree-class plain-HTML POST). Push/PR need GitHub credentials on this machine (no `gh`; credential helper points at a deleted temp binary — same as M56) |
| **Integration order** | `m57` merges to `main` after P3 closeout |
| **Pending merge** | `m53` (D-123 sampling terminology, 343ab62, 8 behind main) stays unmerged by operator decision; trunk `PRD.md` has no §8.41 and `DECISIONS.md` no D-123 until it lands |
| **Parked product** | Resonance GEO agent (historical name) remains parked (D-116); `AGENT_*` headers read PARKED from M56 P2 |

## M57 phase ledger

| Phase | Scope | State |
|---|---|---|
| P0 | Governance: D-128 + register edges, M56 plan archived (byte-frozen), `M57_BUILD_PLAN.md`, STATUS/PRD/MASTER_CONTEXT sync, S-130 truncation + S-131, §G gotcha | Done |
| P1a | External surfaces: site pages, og/mark assets, brand-kit, domain stamping script, www→apex redirect, root-docs name sweep | Done |
| P1b | `src/` user-visible strings via `PRODUCT_NAME`; copy-test updates; `ui-contracts` guard | Done |
| P2a | SEO page architecture: studies hub, per-study page, method/methodology pages, JSON-LD, robots AI-bot groups, sitemap, llms.txt | Done |
| P2b | Hotel + Leica study pages, dev-DB-verified (D-127) — absorbs the two M56 open follow-ups: run `cffd5856` date confirmation, and the hotel and Leica study pages | Done |
| P3 | Contact form via operator endpoint; CSP `form-action`; two CTA intents | Blocked on operator endpoint |
| P3 closeout | Gates, STATUS/PRD/BUILD_NOTES handoff, PR `m57` → `main` | Done (push/PR operator-gated) |

## Baseline evidence (main@c478231)

- M56 P5 closeout gates (9dd5a23, merged via PR #17): lint 0 warnings, typecheck, docs:check (20 governed root docs, 19 historical), Vitest 915 passed / 12 skipped / 0 failed, `test:e2e` 18/18, `test:e2e:forecast` 4 passed, build green (proxy bypass), `git diff --check` clean.

## Open follow-ups (not M57 scope)

- Duplicate-helper merges and UI "Simulation runs/study pack" wording are recorded in D-126 as a future proposal.
