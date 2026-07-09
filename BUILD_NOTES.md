# BUILD_NOTES.md - Session Working Memory

> Disposable mid-milestone state for agent handoff. This file answers "what was the last session doing?" — nothing else. Durable facts do not live here: decisions go to the `MASTER_CONTEXT.md` Decision Log, status goes to the `PRD.md` tracker, schema/contract facts go to the spec docs.

## Rules

1. **Append one entry per session**, as step one of the handoff ritual — or immediately whenever stopping mid-task or blocked.
2. **Disposable:** when a milestone merges, delete its entries. Anything still worth keeping must graduate to a canonical doc first; if it can't, it wasn't worth keeping.
3. **No restating:** never duplicate what a commit message, the PRD tracker, or the Decision Log already says. The unique value here is dead ends, unverified work, and the exact next action.

## Template

```
## S-<NNN> / <YYYY-MM-DD> / M<N>
GOAL: <one line: what this session set out to do>
DONE: <verified work, each with the command or check that proved it>
UNVERIFIED: <built but not yet proven; say what proof is missing>
REJECTED: <approach tried and abandoned + why, one line each>
NEXT: <the exact first action for the next session — command or file-level>
GOTCHAS: <environment quirks, surprising behavior, anything that cost >10 minutes>
```

Session numbers increment forever and never reset; omit empty fields except NEXT, which is mandatory.

---

## Entries

## S-059 / 2026-07-09 / M30: whole-repo cleanup audit
GOAL: Run the M30 whole-repo cleanup audit end to end: research/classify first (Passes 0-5), then execute the findings as separately-committed batches, per `AUDIT_METHODOLOGY.md`.
DONE: (1) Plan artifact `AUDIT_METHODOLOGY.md` written — four-tier action label (`Delete`/`Merge`/`Archive-Relabel`/`Keep — Protected`) and the document-class taxonomy (current-state / append-only history / proposals-plans, §4) that governs every later fix. (2) Pass 0: `PROTECTED_REGISTER.md` — 29 protected surfaces across 85 Decision Log entries (D-001..D-085), each a thing that looks dead/redundant but was explicitly argued into existing; consulted before every later `Delete`/`Merge` proposal. (3) Killed the pre-D-077 "marketing funnel / Upper-Mid-Lower Funnel" framing that MASTER_CONTEXT §1, PRD §1 Vision, README's opening line, and the glossary's "funnel stage" entry still led with, rewriting to the Evidence Layer / Simulation Layer framing D-077 actually established; backfilled PRD.md §§8.23-8.30 with requirement IDs for the M21-M28 work that had shipped with only Decision Log + tracker coverage (commit `ef04ffb`). (4) Passes 1-5 produced `AUDIT_DOC_DRIFT_MATRIX.md` (20 numbered findings), `AUDIT_REGISTER.md` (94 exports across the 7 largest files reviewed, exactly one dead export found), `AUDIT_REPO_INVENTORY.md` (repo-root classification + the vestigial-`.gitkeep` finding), `AUDIT_STRUCTURE_MAP.md` (C-7 boundary re-check, clean; 7 structural-split proposals, none executed). (5) Executed the findings as 6 ordered commits on `m30-repo-cleanup-audit`: Commit 1 (`b3f0252`) synced the remaining current-state doc drift (DD-1/2/3/5/6/10/11/12/15/16 — DD-4/7/8/9/13/14 were already fixed by `ef04ffb` and skipped after re-verification); Commit 2 (`55bdb82`) added status headers to the three executed proposal/plan docs (DD-17/18/19), correcting `M21_M26_BUILD_PLAN.md`/`LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md`'s factually-false "untracked, uncommitted, NOT canon" self-descriptions; Commit 3 (`fd65dcb`) removed 18 of 19 tracked `.gitkeep` files whose directories already held other tracked content, keeping `public/.gitkeep` (the one directory with no other tracked content, since `public/brand/` is untracked operator WIP); Commit 4 (`be836f7`) deleted the one confirmed-dead export, `listRuns` (superseded by `listRunsWithProgress`, D-048); Commit 5 (`6a30fe2`) committed the 4 audit docs for the trail and added a docs/audits disposability convention to `AUDIT_METHODOLOGY.md` §8.
VERIFIED: Per-commit gates as specified — Commit 1: `tsc --noEmit` clean, grep-verified no remaining stale phrases in every edited section. Commit 4: `rg "listRuns\("` re-confirmed exactly one hit (its own definition) before deleting; `tsc --noEmit` clean; runner-related tests 43/43; full suite 488 passed / 12 skipped (73 files) — matches the M29 baseline exactly. Commit 6 (this close-out): see the PRD.md M30 tracker row and progress note for the final full-gate results (tsc, lint, full test suite, build-or-skipped).
NEXT: Nothing pending from this milestone. M10's own close-out (deploy, remaining live providers, Gemini grounding caveat) remains the only open parallel ops track, unaffected by this audit.
GOTCHAS: `AUDIT_STRUCTURE_MAP.md`'s 7 structural-split proposals (one per Pass-3 hotspot file, confidence ranging high for `setup-client.tsx`/`report-templates.ts`/`metrics.ts` to low for `worker/index.ts`) are deliberately NOT executed by this audit — they are graduated into D-086's text as named future proposals before the working doc is deleted in this same close-out commit, per the methodology's "pure-move-only, separate PR" rule for structural splits.
