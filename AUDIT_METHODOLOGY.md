# AUDIT_METHODOLOGY.md — Whole-Repo Cleanup Audit (M30)

> Planning canon for the M30 cleanup audit, per §7's split-file precedent. This revises the original review-first cleanup proposal with fixes from an independent review (recorded as this milestone's eventual Decision Log entry). Status: **plan artifact — Pass 0 not yet executed.**

---

## 0. Why this revision exists

The original plan (Delete / Merge / Archive taxonomy, review-first, no deletion without proof) was sound in spirit but had one structural blind spot dangerous enough to fix before any pass runs: **this repo's most dead-looking code is often deliberately dormant, protected by an explicit Decision Log entry.** A dead-code pass without a way to record "investigated, keep, here's why" will flag `genericUnconditioned` (D-078), the six `active:false` price/promo templates (D-079), the mock provider (C-9/D-002), and the freeze-bypass test helper (D-081) as cleanup candidates — each of which was *specifically argued into existing* by name in the Decision Log.

Four structural additions fix this and three classes of smaller risk. Everything else from the original plan (register-first, small PRs, never delete without proof, C-12/C-7 boundary discipline) is retained unchanged.

---

## 1. Summary (unchanged from original)

Run the audit as a review-first cleanup, not a refactor sprint. Produce a ranked cleanup register, then land small safe PRs for dead code, duplicate logic, stale docs, and repo-structure noise. Do not delete anything until it is proven unused by code search, typecheck/tests, and product-doc intent.

Primary outputs:
- **Protected Register** *(new, Pass 0)*: every surface the Decision Log explicitly argued into existing, with its D-number, so later passes cannot flag it as dead.
- **Audit Register**: every cleanup candidate with evidence, risk, owner decision, and test proof.
- **Doc Drift Matrix**: docs whose claims conflict with current code or newer decisions — split by document class (§4).
- **Structure Map**: files/modules to keep, split, archive, or move.
- **Cleanup PR Queue**: small batches ordered by risk.

---

## 2. Review passes

### Pass 0 — Protected Register *(new, run first, blocks Pass 3)*

Walk `MASTER_CONTEXT.md` section 9 (currently 85 entries, D-001 through D-085) and extract every decision whose *point* was to keep, preserve, or deliberately not remove something. For each, record: the surface (file/export/column/flag), the D-number, and a one-line reason quoted or paraphrased from the entry's own "alternatives rejected" column (that column is usually where the "we considered removing this" reasoning lives).

Known entries to seed the register with (found during the review that produced this doc; Pass 0 must still walk the full log — this list is a floor, not a ceiling):

| Surface | D-number | Why it looks dead but isn't |
|---|---|---|
| `genericUnconditioned` column + all render paths | D-078 | Approval-time bypass killed; historical-row rendering deliberately kept (dev DB holds one real approved GENERIC study) |
| Six `active:false` price/promo templates | D-079 | Structural opt-in mechanism, not abandoned work |
| Mock provider (`providerId: "mock"`) | C-9 / D-002 | Permanent test/demo mode, not a stub |
| `matrix.test-helpers.ts` freeze-bypass GUC | D-081 | Test-only by design; ~11 test files' teardown depends on it |
| `'discarded'` matrix_state value with no live code path | D-081 | Investigated and deliberately left unhandled — not a bug, a documented no-op |
| Embedding model precedence omitting D-020's per-credential override | D-072 | Investigated and confirmed correct, not a gap |
| Global rate-limit bucket (survives per-user login clears) | D-072 | Kept as a deliberate distributed-attack defense, not dead weight |

**Output:** `PROTECTED_REGISTER.md` (or a section of the Audit Register) — a table of surface → D-number → reason. Every later pass consults this before proposing `Delete` or `Merge`.

### Pass 1 — Canonical Truth Pass (unchanged)

- Treat `MASTER_CONTEXT.md`, latest Decision Log entries, and `PRD.md`'s tracker as the source hierarchy.
- Flag drift immediately found: README still claims M11–M15 complete and M16–M20 "specified and ready" (M29 has shipped); `MASTER_CONTEXT.md` §4's C-13 row and `PRD.md` RS-2 both still describe the pre-D-078 "explicit operator toggle" GENERIC behavior that no longer exists.
- Decide for each doc: canonical, historical/archive, or stale-and-updateable — using the document-class taxonomy in §4 below, not ad hoc judgment.

### Pass 2 — Repo Inventory Pass (revised)

- Classify all top-level files into: app source, canonical docs, historical docs, generated/cache, static marketing site, fixtures, scripts, tooling config.
- `.claude/` (launch.json, worktrees) is **tooling config — keep**, not noise.
- Review untracked work explicitly: `BRAND_PLAYBOOK.md`, `BRAND_SITE_GUIDE.md`, `site/`, `public/brand/`, `Taste skill/`. These are the operator's live, separate-session work — **not this audit's to decide.** The audit's job is to *record* an owner decision per item (which may legitimately be "leave untracked — operator WIP, revisit later"), never to unilaterally commit, move, or drop them.
- `.DS_Store`: already gitignored, zero tracked (verified) — **not a cleanup candidate**, drop from scope entirely.
- `.gitkeep` files are kept only where empty dirs are intentional.

### Pass 3 — Redundancy and Dead-Code Pass (revised — gated on Pass 0)

- **Consult the Protected Register first.** Any candidate matching a protected surface gets the `Keep — Protected` label immediately, no further analysis.
- Corrected hotspot list (measured by line count, largest first): `src/db/repositories/runner.ts` (1,013), `src/db/repositories/resonance.ts` (814), `src/components/setup/setup-client.tsx` (721), `src/db/repositories/metrics.ts` (636), `src/core/report-templates.ts` (605), `src/worker/index.ts` (585), `src/db/repositories/dashboard.ts` (584).
- For every exported function/type/component, record callers with `rg`, then classify: live API, test-only helper, historical compatibility, duplicate, or unused.
- **Before labeling anything `Delete`, clear this non-import reference checklist** — `rg`-for-callers has systematic blind spots for things referenced by mechanism rather than import:
  - Next.js file-convention routes (`page.tsx`, `route.ts`, `error.tsx`, `global-error.tsx`, `middleware.ts`) — never imported by name.
  - `package.json` scripts → `scripts/*.ts`, and ops docs (`RELEASE_CHECKLIST.md`, `RENDER_DEPLOYMENT.md`) that reference commands like `archive:evidence` as contracts, not code.
  - Fixtures keyed by content-hash (D-016) or `fixtureId` string, not import — mock response fixtures, `fixture-pmfs.json`, golden-dataset manifests.
  - Drizzle `meta/*.json` snapshots — look like generated cache, are actually hash-tracked canon (breaks migration integrity if deleted).
  - `render.yaml` and the CI workflow.
  - A candidate genuinely dead-per-this-checklist is a `Delete` (pending proof, §5).
- Deduplicate only when behavior is identical and invariants match. Do not merge audit and resonance paths if doing so weakens C-12 separation.

### Pass 4 — Boundary and Structure Pass (unchanged)

- Re-check C-7 boundaries: `src/core` must remain pure; UI must not import providers; module/provider/db coupling should be intentional.
- Review hotspots: runner budget/provider resolution, extraction-to-resonance scoring handoff, report/export routes, dashboard drilldown paths, setup archive-vs-active reads.
- Prefer splitting large files by stable domain behavior, not by arbitrary size.
- **Structural splits are pure-move commits**: file moves with zero logic edits in the same commit, so review diffs are trustworthy. A logic change riding along with a move is a separate PR.

### Pass 5 — Documentation Drift Pass (revised)

- Search for stale vocabulary and milestone claims: `GENERIC`, `unconditioned`, `Upper/Mid/Lower`, `single engine`, `M16-M20`, `Parallax` on external surfaces. (`45 templates` removed as a search target — see §4, every hit found during review was inside append-only history, which is correct as written.)
- **Apply the document-class taxonomy (§4) before editing anything.** The same string ("GENERIC unconditioned toggle", "45 templates") is correct in one document class and wrong in another — the fix is never "grep and replace everywhere."
- Specific current-state-doc targets confirmed stale: `README.md` (milestone status), `PRD.md` RS-2 (GENERIC toggle wording), `MASTER_CONTEXT.md` §4 C-13 row (same).
- Constraint-row edits (§4 hard-constraints table, glossary) must cite the superseding D-number in the edit itself or in this audit's own closing Decision Log entry — a constraint row is project law; changing its wording needs the same evidence trail a new constraint would.

---

## 3. Cleanup rules (revised)

Four-tier action label (was three):

- **`Delete`**: proven unused per the Pass 3 non-import checklist, no historical value, not in the Protected Register.
- **`Merge`**: duplicate logic with identical invariants and tests.
- **`Archive/Relabel`**: historically useful docs or plans that should not pretend to be current — gets a status header, content is never rewritten (§4).
- **`Keep — Protected`** *(new)*: matches a Decision Log entry in the Protected Register. Cite the D-number in the register; no further action.

Unchanged hard rules:
- Never edit applied migrations except by adding a new migration if schema actually changes.
- Do not rename stored DB fields like `job_to_be_done` for copy-only cleanup.
- Do not remove compatibility rendering for historical GENERIC rows unless product policy explicitly changes (it does not, per D-078).
- Keep cleanup PRs small: docs-only, repo-noise, pure dead code, structural split, then behavior-adjacent dedupe — in that order. **Sequence current-state doc fixes AFTER structural moves**, not before, so file-path references in docs are only edited once.

---

## 4. Document-class taxonomy *(new)*

Every doc in this repo belongs to exactly one of three classes. The class determines what "fixing drift" means — using the wrong treatment on the wrong class actively damages the repo.

| Class | Examples | What "drift" means | Correct fix |
|---|---|---|---|
| **Current-state** | `README.md`, `MASTER_CONTEXT.md` §1–8 and §12 (glossary), `PRD.md` requirements/tracker rows, `DEVELOPMENT_GUIDELINES.md`, `ENGINEERING_SPEC.md` | The doc claims something about the system that is no longer true | Update in place |
| **Append-only history** | `BUILD_NOTES.md` entries, `PRD.md` progress notes, the Decision Log rows themselves | A past entry describes something that was true *when written* | **Never rewrite.** This is the project's evidence chain — editing it is the same category of mistake as editing an applied migration. `45 templates` appearing in a 2026-07-04 BUILD_NOTES entry is not drift; it is a correct historical record. The one sanctioned cleanup here is D-025's own rule: BUILD_NOTES entries may be *truncated* (not rewritten) after their milestone merges and anything durable has graduated to a canonical doc — M21–M29 are merged, so S-001 through S-058 are eligible for truncation as a Pass 5 action, distinct from "fixing" them. |
| **Proposals/plans** | `RESONANCE_BUILD_PLAN.md`, `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md`, `M21_M26_BUILD_PLAN.md`, this document once M30 ships | A plan for work that has since been executed or superseded | Add a status header (`**Status: executed, see D-0XX**` / `**Status: superseded by D-0XX**`). Content body is never rewritten — it is the historical record of what was decided and why. |

---

## 5. Test and acceptance plan (revised)

- **Baseline before cleanup**, with counts recorded for post-cleanup comparison: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` (as of M29: 488 passed / 12 skipped, 73 files), `pnpm build` (only when no dev server is running on :3000 — the D-075 hazard; a cleanup audit runs long, on a machine where a dev server is often up, so check every time, not just once).
- For docs-only changes: grep checks for stale phrases (scoped per document class, §4) plus `pnpm test` only if tests assert docs/copy (e.g. the C-14 forbidden-phrase tests).
- For dead-code deletion: confirm `Delete` label cleared the Pass 3 checklist and is absent from the Protected Register, then `pnpm exec tsc --noEmit`, targeted tests for the affected module, then full `pnpm test`.
- For structural splits: pure-move commit (§2 Pass 4) plus targeted tests proving zero behavior change; where metrics/report code is touched, also run the idempotent-recompute check and existing C-12 wall tests.
- For behavior-adjacent dedupe (runner/worker/metrics): add `pnpm test:mock-e2e` as a gate. **Known issue, not this audit's to fix**: the "stale-lock reclaim" check in that script is flaky (reproduced on a clean branch with zero relevant diff, already tracked as a separate fix task) — 5/6 passing with only that check red is a pass for this audit's purposes; do not chase it or silently "fix" it as drive-by scope.
- **Final acceptance**: no untracked file lacks a recorded owner decision (not "no untracked files" — operator WIP staying untracked is a valid decision); no current-state doc contains a stale claim; no append-only history has been rewritten (only truncated per D-025, and only past-merge entries); no C-7/C-12 boundary regressions; every `Delete`/`Merge` has a register entry with proof; every `Keep — Protected` cites its D-number.

---

## 6. Assumptions (unchanged)

- Default stance is conservative cleanup: remove obvious dead/noise first, propose larger reorganizations separately.
- The marketing `site/` is standalone and should not be wired into the Next app during this audit.
- Historical build plans may be kept, but only if clearly labeled per the document-class taxonomy (§4) — not just "historical" as a vibe.

---

## 7. Handoff discipline for this audit

Per the project's own session rules: one branch (`m30-repo-cleanup-audit`), BUILD_NOTES entries per work session, and **one closing Decision Log entry** for the whole audit (not one per PR) recording the durable conventions this document introduces — the four-tier label, the document-class taxonomy, the Protected Register as a standing artifact, and the D-025 BUILD_NOTES-truncation execution. Cite this file (`AUDIT_METHODOLOGY.md`) as the plan artifact per §7's split-file precedent, the same way `RESONANCE_BUILD_PLAN.md` and `M21_M26_BUILD_PLAN.md` were adopted alongside their own closing entries.
