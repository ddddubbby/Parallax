# M56 audit register (disposable at close — AUDIT_METHODOLOGY §8)

Labels: Delete · Merge · Archive/Relabel · Keep — Protected (D-nnn) · Keep · Owner decision. Every Delete cleared the Pass-3 non-import checklist (Next file-convention routes, package.json scripts, ops-doc command contracts, hash/id-keyed fixtures, Drizzle meta, render.yaml, CI) and has no PROTECTED_REGISTER match.

## Repo noise

| ID | Surface | Label | Evidence | Commit |
|---|---|---|---|---|
| RN-01 | worktrees `/private/tmp/Parallax-m55`, `/private/tmp/Parallax-purge-apple-design` | Delete (`git worktree prune`) | `git worktree list` marked both prunable; dirs empty | P-1 |
| RN-02 | `.claude/worktrees/strange-carson-2839bc` + branch `claude/strange-carson-2839bc` | Delete | 1 commit (27564c1, 3 `loading.tsx` restyles), 152 behind main; `git grep animate-pulse main -- src/app` = 0 → already delivered by M43/M47 | P1 |
| RN-03 | branch `chore/purge-apple-design-skill` | Delete | main 997956e already deleted `.agents/`; branch's second commit is a handoff note only | P1 |
| RN-04 | `resonance-pages-direct-upload.zip` (untracked) | Delete | 2026-08-02 upload; `motion.js` md5-identical to m54, html/css older than the m54 source now on main | P1 |
| RN-05 | `public/.gitkeep` | Delete | `public/brand/` non-empty since 2026-07-10 | P1 |
| RN-06 | `.pnpm-store-link/` (untracked, empty) | Delete | zero references | P1 |
| RN-07 | `site/.vercel/` (untracked) | Keep | operator's Vercel project link; ignored by `site/.gitignore` since the m54 merge | — |
| RN-08 | `docs/audits/m34/` (15 tracked .md) | Keep — Protected (D-099) | cited by D-095/D-098/PRD; §8 disposability wording does not cover research evidence | — |
| RN-09 | `public/brand/*-concept.png` ×4 (3.9 MB) | Keep (owner: operator) | brand source assets referenced by BRAND_SITE_GUIDE | — |
| RN-10 | `.env.example` missing `EMBEDDING_PROVIDER`, `OPENAI_EMBEDDING_MODEL`; `APP_URL` unread by code | Update in place | `src/modules/runner/provider-ids.ts`, `src/providers/openai/embeddings.ts`; `render.yaml:70,92` | P1 |
| RN-11 | fully merged local branches `m33-ci-e2e-locale-hotfix m34-baseline-framing m44 m45 m46 m47 m48 m49 m50 m51-ui-ux-roadmap m52 m54 m55` | Owner decision | `git branch --merged main`; excluded `m35`–`m40`, `geo-agent-v1` (D-116) | — |
| RN-12 | branch `m53` | Keep (operator) | D-123 pending merge; recorded in STATUS | — |

## Dead code (DC)

| ID | Surface | Label | rg evidence (refs outside definition) | Tests |
|---|---|---|---|---|
| DC-01 | `src/core/runner.ts` `decideExtractionRetry` | Delete | 0 | `src/core/runner.test.ts` `src/modules/extraction/pipeline.test.ts` |
| DC-02 | `src/core/resonance.ts` `formatPanelPersonaLines` | Delete | 0 | `src/core/resonance.test.ts` `src/modules/resonance/service.test.ts` |
| DC-03 | `src/core/constants.ts` `VALIDATION_REPETITIONS` | Delete | 0 (DEVELOPMENT_GUIDELINES §D bullet removed) | `src/core/runner.test.ts` |
| DC-04 | `src/core/constants.ts` `DEFAULT_PROVIDER_CONCURRENCY` | Delete | 0 (same) | `src/modules/runner/budget.test.ts` |
| DC-05 | `src/core/ssr-anchors.ts` `SSR_TARGET_ANCHOR_SET_COUNT` (+ local `TARGET_ANCHOR_SETS`) | Delete | 0 | `src/core/ssr-anchors.test.ts` |
| DC-06..12 | `src/modules/resonance/actions.ts` seven `*FormAction` wrappers + private `unwrap` + `redirect` import | Delete | 0 (`rg FormAction src e2e` hits only the D-114 framing one) | `src/modules/resonance/actions.test.ts`, `e2e/operator-journey.spec.ts` |
| DC-13 | `src/modules/resonance/actions.ts` `fetchActiveFramingBatchProgressAction` | Delete | 0 | same |
| DC-14/15 | `src/modules/extraction/actions.ts` `fetchDeadLettersForRun`, `fetchDeadLetteredExtractions` | Delete | 0 | `src/modules/extraction/actions.test.ts`, `e2e/settings-debug.spec.ts` |
| DC-16 | `src/modules/runner/actions.ts` `getRunSummary` | Delete | 0 | `src/modules/runner/actions.test.ts` |
| DC-17/18 | `src/db/repositories/debug.ts` `getCellResolvedText`, `listRecentRuns` | Delete | 0 | typecheck, `e2e/settings-debug.spec.ts` |
| DC-19 | `src/db/repositories/extraction.ts` `getLatestExtractionVersion` | Delete | 0 | `pnpm vitest run src/modules/extraction` |
| DC-20 | `src/db/repositories/report.ts` `getSection` | Delete | 0 | `src/modules/report/service.test.ts` |
| DC-21 | `src/db/repositories/resonance.ts` `listAuditEvidenceResponses` | Delete | 0 | `pnpm vitest run src/modules/resonance src/db/repositories` |
| DC-22 | `src/db/repositories/framing-observations.ts` `listActiveFramingBatchIds` | Delete | 0 | `pnpm vitest run src/db/repositories` |
| DC-23 | `src/components/semantic/pillar.tsx` `PillarChip` | Delete (PRD VS-2 annotated) | 0 in src; PRD VS-2 + D-055 prose | typecheck, `e2e/operator-journey.spec.ts` |
| DC-24 | `scripts/framing-feasibility/_probe-projects.ts` | Delete | 0; self-declared scratch | — |

Keep rulings (investigated, not deleted): see `PROTECTED_REGISTER.md` M56 section.

## Grep gates

- G1 `rg -n "Simulation Layer" README.md MASTER_CONTEXT.md DEVELOPMENT_GUIDELINES.md ENGINEERING_SPEC.md RELEASE_CHECKLIST.md RENDER_DEPLOYMENT.md BRAND_PLAYBOOK.md BRAND_SITE_GUIDE.md` → 0
- G2 `PRD.md` "Simulation Layer" only on lines annotated "(superseded by D-119)", §11 tracker/progress rows, §12 history line
- G3 `rg -n "synthetic consumer research|We are not a GEO|AI visibility tool / GEO|Run a pilot study" BRAND_PLAYBOOK.md BRAND_SITE_GUIDE.md README.md MASTER_CONTEXT.md PRD.md` → only the playbook §11 version log
- G4 `rg -n "five (prompt )?intents|five intent types|Five providers" README.md MASTER_CONTEXT.md PRD.md DEVELOPMENT_GUIDELINES.md ENGINEERING_SPEC.md` → 0
- G5 `rg -n "\bParallax\b" README.md RENDER_DEPLOYMENT.md BRAND_PLAYBOOK.md BRAND_SITE_GUIDE.md site/*.html` → 0
- G6 `rg -n "Render Static Site|STATUS: proposal|venture investors|wave\.svg|bezel\.png" BRAND_SITE_GUIDE.md` → 0
- G7 `rg -n "—" site/*.html` → 0; `rg -in "marriott|__SITE_URL__" site` → 0; playbook §5.3 banned vocabulary over `site/*.html` → 0
- G8 `rg -n "MASTER_CONTEXT.md. (§|section )9" README.md BUILD_NOTES.md DEVELOPMENT_GUIDELINES.md RELEASE_CHECKLIST.md PRD.md` → 0
- G9 each DC symbol over `src scripts e2e fixtures` and the four guideline docs → 0; `PillarChip` only on the annotated PRD VS-2 line
- G10 three `AGENT_*` first lines contain `LIFECYCLE: PARKED`
- G11 `ls M*_BUILD_PLAN.md` → `M56_BUILD_PLAN.md` only; every plan path cited by MASTER_CONTEXT/PRD exists
- G12 `rg -n "^## S-" BUILD_NOTES.md` → M56 entries, three new stubs, two old stubs, S-084, S-086..S-095, the template line
