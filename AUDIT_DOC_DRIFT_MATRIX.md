# AUDIT_DOC_DRIFT_MATRIX.md — M30 Cleanup Audit, Passes 1 + 5

> Canonical Truth Pass (doc claims vs. running code/DB and vs. `MASTER_CONTEXT.md`'s own Decision Log) combined with the Documentation Drift Pass (stale-vocabulary search), per `AUDIT_METHODOLOGY.md` §2. Every finding below was checked against the document-class taxonomy (§4) before being called drift: **current-state** docs get "update in place" fixes; **append-only history** (BUILD_NOTES entries, PRD progress notes, Decision Log rows) is never rewritten, only D-025-truncated; **proposals/plans** get a status header, never a body rewrite. This document does not edit any doc — it identifies and recommends, per the task's review-first scope.

Read against: `README.md`, `MASTER_CONTEXT.md` §1–8/§12, `PRD.md` requirements/tracker, `DEVELOPMENT_GUIDELINES.md`, `ENGINEERING_SPEC.md`, `RELEASE_CHECKLIST.md`, `RENDER_DEPLOYMENT.md` (Pass 1 doc set), plus a repo-wide vocabulary sweep (Pass 5) covering `src/`, `scripts/`, and every root-level doc including `DESIGN_GUIDELINES.md`, `RESONANCE_BUILD_PLAN.md`, `M21_M26_BUILD_PLAN.md`, `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md`, `CALIBRATION_PROTOCOL.md`, and `BUILD_NOTES.md`.

---

## 1. Document-class assignment (per §4)

| Doc | Class | Current status |
|---|---|---|
| `README.md` | Current-state | Drift found (DD-1, DD-2) |
| `MASTER_CONTEXT.md` §1–8, §12 | Current-state | Drift found (DD-3 through DD-7) |
| `MASTER_CONTEXT.md` §9 (Decision Log) | Append-only history | Never rewrite; correctly historical throughout |
| `PRD.md` requirements/tracker rows (§§1–11, tracker table) | Current-state | Drift found (DD-8 through DD-14) |
| `PRD.md` progress notes (bulleted list under §11), §12 roadmap prose that merely narrates past sequencing | Append-only-history-adjacent | See DD-13 nuance below — §12 itself makes a present-tense current-stage claim, which is current-state, not history |
| `DEVELOPMENT_GUIDELINES.md` | Current-state | Checked in full; no material drift found (see §4 below) |
| `ENGINEERING_SPEC.md` | Current-state | Drift found (DD-15, DD-16) |
| `RELEASE_CHECKLIST.md` | Current-state | Checked in full; no drift — open gates are genuinely still open |
| `RENDER_DEPLOYMENT.md` | Current-state | Checked in full; no drift |
| `DESIGN_GUIDELINES.md` | Current-state | Spot-checked for Pass-5 vocabulary only (out of Pass 1's named doc set); no drift found in the terms checked |
| `BUILD_NOTES.md` entries | Append-only history | Never rewrite; D-025 truncation candidate (DD-20) |
| `RESONANCE_BUILD_PLAN.md` | Proposal/plan | Status-header drift (DD-17) |
| `M21_M26_BUILD_PLAN.md` | Proposal/plan | Status-header drift, self-description factually false (DD-18) |
| `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md` | Proposal/plan | Status-header drift, self-description factually false (DD-19) |
| `CALIBRATION_PROTOCOL.md` | Proposal/plan (describes future work by design) | Checked; no drift — its "nothing flips this flag yet" framing is still accurate |
| `AUDIT_METHODOLOGY.md` | Proposal/plan (this audit's own plan artifact) | Self-status line stale by one pass (noted, not actionable now — see §6) |

---

## 2. Current-state doc drift (Pass 1)

### DD-1 — README.md:14 — milestone status severely stale (HIGH)

**Claim:** "Current state: M11 through M15 are complete; M10 (the pilot audit) is in progress ... M16-M20 (funnel presentation layer + lower-funnel synthetic panel + value-add template packs) are specified and ready for execution (PRD 8.19-8.22, `RESONANCE_BUILD_PLAN.md`)."

**Reality:** Per `PRD.md` §11's tracker (the canonical status home per `MASTER_CONTEXT.md` §10), M16 through M28 are all `Done` (`PRD.md:408-420`); M29 (pause-observability hotfix, D-083-pattern) shipped without a tracker row by the project's own established convention for comparably-sized hotfixes (S-055/S-058 precedent — not itself a defect). M10's own status text ("in progress ... DeepSeek gate closed ... deploy and grounded-provider gates open") is still accurate and matches `PRD.md:402` and `RELEASE_CHECKLIST.md` Part 1's unchecked boxes — only the M16-M20 sentence is wrong.

**Fix:** Rewrite the second sentence to reflect M16 through M28 shipped (M21 layer-identity rename, M22 test-DB isolation + GENERIC kill, M23 coverage contract, M24 multi-provider resonance, M25 hardening residue, M26 calibration protocol, M27 Setup editing, M28 buyer-voice guard), with M10's deploy/grounded-provider gates still the open item. Cite D-063 through D-085 as the source, not a specific one — this is a whole-narrative update, not a single-D fix.

### DD-2 — README.md:51-58 — "Useful scripts" list missing three current scripts (MED)

**Claim:** Lists `pnpm test:mock-e2e`, `pnpm demo:walkthrough`, `pnpm audit:deepseek-mini`, `pnpm archive:evidence` as "useful scripts."

**Reality:** `package.json`'s `scripts` block (verified directly) also defines `pnpm demo:resonance` (M19, RR-5), `pnpm test:db` (D-078, foreground ephemeral-DB command mirroring `pnpm db:dev`), and `pnpm recompute:resonance` (D-080, the permanent dev-DB sweep script). None of the three appear in README's list.

**Fix:** Add the three missing scripts with one-line descriptions matching their Decision Log purpose.

### DD-3 — MASTER_CONTEXT.md:57 — C-13 constraint row describes pre-D-078 behavior (HIGH, previously flagged)

**Claim:** "Simulations are evidence-conditioned by default: a study's `measured_ai` stimulus must cite stored raw response ids from the same project. Unconditioned studies require an explicit operator toggle and are labeled GENERIC on every surface and export."

**Reality:** D-078 (`MASTER_CONTEXT.md:213`, M22) removed the operator toggle at approval entirely — `approveAndCompileResonanceStudy`'s guard "no longer consults `genericUnconditioned` at all... with no flag able to bypass it." The GENERIC label now renders only on historical rows created before M22; no current workflow can produce a new one.

**Fix:** Reword C-13's row to state the current hard rule (evidence-conditioning is mandatory at approval, no toggle exists) and note GENERIC as a historical-only render state for pre-D-078 rows, citing D-078. Per methodology §5, a hard-constraint row edit must cite the superseding D-number in the edit itself.

### DD-4 — MASTER_CONTEXT.md:17 (§1) — leads with the vocabulary D-077 retired (HIGH)

**Claim:** "Resonance is the product umbrella ... an internal, operator-facing web tool organized as a marketing funnel ... The funnel (Upper = Presence, Mid = Position + Perception, Proof = trust rail, Lower = simulation) is a presentation layer over the existing pillar/intent taxonomy."

**Reality:** D-077 (`MASTER_CONTEXT.md:212`, M21) exists specifically because "a first-time client met three competing vocabularies (pillars, funnel stages, pipeline terms)" and resolved it by making **Evidence Layer** (audit) / **Simulation Layer** (resonance) the product-facing terms — "funnel stage" wording was named in D-077's own rejected-alternatives column as "jargon redundant with the Four P pillars." Section 1 is the first substantive thing any session reads (per `MASTER_CONTEXT.md` §0's own boot instruction) and it still teaches the pre-M21 mental model with zero mention of "Evidence Layer" or "Simulation Layer." The underlying funnel *structure* is not wrong (D-077 kept `FunnelStage`'s internal upper/mid/lower values, per `PROTECTED_REGISTER.md`'s D-077 row) — only the doc's choice to lead with it as the primary description is stale.

**Fix:** Rewrite §1's second paragraph to lead with Evidence Layer / Simulation Layer as the current product-facing framing, demoting "funnel" to the internal/structural detail D-077 confirms it now is. Cite D-077.

### DD-5 — MASTER_CONTEXT.md:80-92 (§6 repo map) — 4 of 11 `/src/modules` directories missing (MED)

**Claim:** Repo map lists exactly seven `/src/modules/*` lines: `intake`, `matrix`, `runner`, `extraction`, `analysis`, `resonance`, `report`.

**Reality:** `find src -maxdepth 2 -type d` shows eleven `/src/modules/*` directories on disk: the seven listed plus `auth` (M8 login/session), `settings` (M8 credentials UI), `dashboard` (M6), and `setup` (M27, D-084). All four are real, multi-file, actively-referenced modules, not stubs.

**Fix:** Add the four missing module lines to the repo map table.

### DD-6 — MASTER_CONTEXT.md:97-111 (§7 documents index) — 3 adopted canon docs not listed (MED)

**Claim:** The documents index table names ten files plus `fixtures/` as the complete doc set.

**Reality:** `M21_M26_BUILD_PLAN.md` and `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md` were both "adopted as planning canon alongside this entry (§7 split-file precedent)" per D-077's own text (`MASTER_CONTEXT.md:212`), and `CALIBRATION_PROTOCOL.md` was "committed" per D-082 (`MASTER_CONTEXT.md:222`). None of the three appear in §7's table. (`AUDIT_METHODOLOGY.md` and `PROTECTED_REGISTER.md` are this in-flight audit's own artifacts and are reasonably left out until the audit closes — not counted as drift here.)

**Fix:** Add rows for the three docs, matching the table's existing "Owns" column style.

### DD-7 — MASTER_CONTEXT.md:243 (§12 glossary, "funnel stage") — D-077's own redefinition claim doesn't match the current text (MED-HIGH)

**Claim (D-077's decision text, `MASTER_CONTEXT.md:212`):** "The glossary's `\"funnel stage\"` term is redefined around the two-layer split."

**Reality:** The current glossary entry at line 243 reads: *"funnel stage: the presentation-layer grouping (upper/mid/lower) mapped from pillars (D-063); Proof is the trust rail, never a stage."* This text contains no reference to "Evidence Layer," "Simulation Layer," or the two-layer split D-077 describes having introduced. A repo-wide grep for `Evidence Layer` / `Simulation Layer` in `MASTER_CONTEXT.md` returns exactly one hit — the D-077 Decision Log row itself. Either D-077's own claim about what shipped is inaccurate, or the glossary entry regressed since; either way, the current text is the actionable fact, and it doesn't teach the vocabulary the rest of the product now uses.

**Fix:** Add "Evidence Layer" / "Simulation Layer" / "Trust Rail" as defined glossary terms (or fold the definition into the existing "funnel stage" entry, noting funnel stage is now internal-only per the Protected Register's D-077 row), citing D-077. Flagged **REVIEW** on the narrow historical question of whether D-077's own claim was ever true — the fix itself (add the missing terms) is not in question.

### DD-8 — PRD.md:9,13 (§1 Vision) — same pre-D-077 funnel framing as DD-4 (HIGH)

**Claim:** "It is organized as a marketing funnel — Upper Funnel (awareness & reach: Presence), Mid Funnel (consideration & education: Position + Perception, with Proof as the trust rail), Lower Funnel (simulated buyer action: the synthetic panel)."

**Reality:** Same D-077 gap as DD-4 — PRD's own Vision section (the first thing a reader of "what to build" sees) never received the M21 terminology update. `PRD.md:13` also still says "Scope through M20 is an internal tool," compounding DD-1's staleness inside the same document.

**Fix:** Same as DD-4, applied to PRD's Vision section; also drop "through M20" in favor of current scope language. Cite D-077 and D-063.

### DD-9 — PRD.md:341,353 (§8.20/8.21 section headers) — "Lower funnel" titles never renamed (LOW, cross-references DD-8)

**Claim:** Section headers read "### 8.20 Lower funnel: resonance studies and synthetic panel runs (M17-M18)" and "### 8.21 Lower funnel: results, report, exports, demo (M19)."

**Reality:** Consistent with DD-8 — these are the same retired vocabulary, just as section titles rather than prose. Low severity on its own since section numbers/anchors are stable and the content beneath is correct; bundling this with DD-8's fix avoids a second edit pass through the same document.

**Fix:** Rename to "Simulation Layer: ..." framing when DD-8 is applied. Do not renumber the sections (8.20/8.21 are stable references elsewhere in this file and in `RESONANCE_BUILD_PLAN.md`).

### DD-10 — PRD.md:68-78 (§7 routes list) — missing `/projects/[id]/setup` (MED)

**Claim:** The routes list enumerates `/projects`, `/projects/new`, `/projects/[id]/matrix`, `/projects/[id]/runs[/[runId]]`, `/projects/[id]/dashboard`, `/projects/[id]/report`, `/projects/[id]/resonance[/[studyId]]`, `/settings`, `/debug` as the complete route set.

**Reality:** `/projects/[id]/setup` (M27, D-084) is a real, subnav-linked, first-tab route (`src/app/projects/[id]/setup/page.tsx` exists per the repo structure) and is absent from this list.

**Fix:** Add the route with a one-line description matching D-084's framing (row-level post-intake editing, archive-not-delete).

### DD-11 — PRD.md:344 (RS-2) — pre-D-078 GENERIC toggle language (HIGH, previously flagged)

**Claim:** "`measured_ai` stimuli must cite stored raw response ids from the same project (C-13); studies may be explicitly marked unconditioned and are then labeled GENERIC on every surface."

**Reality:** Same D-078 gap as DD-3 — "may be explicitly marked unconditioned" describes a toggle that no longer exists for new studies.

**Fix:** Reword to state evidence-conditioning is now mandatory at approval (no toggle), GENERIC renders only on pre-M22 historical rows. Cite D-078.

### DD-12 — PRD.md:346 (RS-4) — states a restriction D-080 explicitly lifted (HIGH)

**Claim:** "EXCEPTION (D-067): a resonance run selects exactly ONE generation engine-mode — each model is a distinct synthetic population ... so multi-provider selection is rejected server-side at resonance run creation and the run form renders a single-choice control for resonance matrices."

**Reality:** D-080 (`MASTER_CONTEXT.md:216`, M24) explicitly supersedes D-067's provider count restriction: "A Resonance run now accepts >=1 providers (mode stays locked to exactly 1...)." `PROTECTED_REGISTER.md`'s own "Superseded / stale-language decisions" table (lines 53-56) flags this exact D-067 language as something "a cleanup pass might misread" for *code* purposes — but the PRD requirement text itself is genuinely wrong today and is not covered by that register entry's protection (the register protects the *code* from being wrongly simplified back to single-provider; it does not claim the PRD prose is correct).

**Fix:** Rewrite RS-4's exception clause: mode stays single-choice, providers are now multi-select (>=1), each engine scored as its own population with composite `<stimulusId>|<providerId>` scope keys. Cite D-080, supersedes D-067.

### DD-13 — PRD.md:45 and PRD.md:518 (§5 scope note + §12 roadmap) — internal self-contradiction against §11's own tracker (MED-HIGH)

**Claim (§5, line 45):** "The funnel presentation layer and the lower-funnel simulation product are specified in sections 8.19-8.22 and tracked as M16-M20; nothing below is retracted by them."
**Claim (§12, line 518):** "Current stage (specified, D-063): M16 funnel presentation layer -> M17 resonance data layer + mock panel runs -> M18 SSR scoring + metrics -> M19 lower-funnel surfaces + demo -> M20 value-add packs + hardening."

**Reality:** `PRD.md`'s own §11 tracker (lines 408-412, same document) shows M16 through M20 as `Done` — §12 literally calls this the "current stage (specified)" as if it were still upcoming, four sections after the tracker proves it shipped. §5's "tracked as M16-M20" wording is weaker drift (still technically true — those sections exist and are so tracked) but sits beside the much sharper §12 contradiction.

**Fix:** §12's roadmap paragraph needs a present-tense update: M16-M20 (and M21-M28) are complete; the "current stage" is whatever is actually next after M29's hotfix (at minimum, this M30 audit itself). §5 is lower priority — consider softening "tracked as M16-M20" to acknowledge those milestones' completion, or leave as a scope-definition pointer since it doesn't itself assert a status.

### DD-14 — PRD.md §8 — no requirement-level sections for M21-M29 durable features (REVIEW, LOW severity as drift, editorial in nature)

**Observation:** PRD's Feature Requirements run §8.1 through §8.22, ending at M20's value-add packs. M21-M29 shipped several requirement-shaped, durable features — Setup editing (M27: view/edit/archive competitors, personas, markets, fact sheet post-intake), the coverage contract (M23: pack-to-aspect mapping, activation control), multi-provider resonance (M24), and the buyer-voice guard (M28) — none of which have a PRD requirement ID (no "SU-1," no extension to 8.16, etc.). This is not a false claim (PRD never says these features don't exist), so it does not fit the strict "drift = stale claim" definition as cleanly as DD-1 through DD-13. It is a coverage gap in the "what to build" document against what has, in fact, been built and is now load-bearing.

**REVIEW — lead input needed:** whether to retroactively backfill requirement IDs for shipped M21-M29 work (matching the existing 8.1-8.22 style) is a documentation-investment decision, not a mechanical fix. Noted for lead judgment rather than assigned a fix recommendation.

### DD-15 — ENGINEERING_SPEC.md §2 schema table (lines ~73-96) — missing migrations 0009 through 0012 (MED-HIGH)

**Claim:** The schema table (the file's own stated purpose: "source of truth for M0.5 execution readiness" and detailed schema) documents columns through migration 0008 only.

**Reality:** Four more migrations have landed since: 0009 (D-072, two CHECK constraints enforcing the audit/resonance cell-shape invariant), 0010/0011 (D-081/D-083, the `prompt_cells` freeze trigger and its `TG_OP`-branching bugfix), and 0012 (D-084, nullable `archived_at` on `brands`/`personas`/`markets` and nullable `setup_updated_at` on `projects`). None of these are reflected in the `brands`, `personas`, `markets`, or `projects` rows of the schema table, nor is the freeze trigger or the CHECK constraints mentioned anywhere in §1's lifecycle-state-machine section or §2's prose. A session starting schema work from this file alone (per its own stated audience) would not learn these columns or guards exist.

**Fix:** Add `archived_at`/`setup_updated_at` to the relevant table rows, and a short paragraph after the "Migration 0008 also:" paragraph summarizing 0009 (CHECK constraints), 0010/0011 (freeze trigger, corrected return-value bug), and 0012 (Setup archive columns). Cite D-072, D-081, D-083, D-084.

### DD-16 — ENGINEERING_SPEC.md:96 — resonance metric scope-key format predates D-080 (MED-HIGH)

**Claim:** "Resonance metrics reuse `metrics` with scopes `resonance_variant` (scope_key = stimulus id), `resonance_variant_persona` (`<stimulusId>|<panelPersonaKey>`), `resonance_delta` (scope_key = stimulus id, metadata carries baseline id)."

**Reality:** D-080 (M24, `MASTER_CONTEXT.md:216`) changed all three scope-key shapes to carry a provider dimension: "`resonance_variant`/`resonance_delta` = `<stimulusId>|<providerId>`, `resonance_variant_persona` = `<stimulusId>|<personaKey>|<providerId>`." The line as currently written describes the pre-M24, single-provider-only key format and would mislead anyone querying `metrics` rows directly for a resonance run.

**Fix:** Update the scope-key descriptions to the current composite format, cite D-080 supersedes D-067 (matching `PROTECTED_REGISTER.md`'s own superseded-language table).

---

## 3. Verified clean — no drift found (shown for completeness, per the pass's own diligence expectation)

| Doc / claim checked | Verification | Result |
|---|---|---|
| `MASTER_CONTEXT.md` §4, C-14 row (persona axes) | Checked against D-066/D-080 | Current, accurate — age/income validated axes, location/behavioral prompt-context-only language matches |
| `MASTER_CONTEXT.md` §5 stack table, `pnpm test`/`pnpm test:db` rows | Checked against D-078 | Current — already describes the ephemeral-DB isolation correctly |
| `DEVELOPMENT_GUIDELINES.md` C2 (`ProviderId` union), C3 (data invariants incl. C-12/SSR), C4 (`Intent` 5-value list) | Checked against current code and D-068's protected `Intent`/`CellIntent` split | Current — `Intent`'s 5-value list correctly excludes `simulation` per the protected D-068 design, not drift |
| `DEVELOPMENT_GUIDELINES.md` §F acceptance-command table, M16-M20 row | Checked wording | Describes a still-true historical acceptance contract, not a currency claim — no update needed |
| `RELEASE_CHECKLIST.md` Part 1 unchecked gates, Part 2 empty archive log | Checked against README's own "no client-facing live audit has shipped yet" | Consistent — genuinely still open, not stale |
| `RENDER_DEPLOYMENT.md` (entire file) | Read in full | No claim contradicted by any Decision Log entry through D-085 |
| `DESIGN_GUIDELINES.md:101,128` — `GENERIC` badge description ("marks an unconditioned resonance study, C-13") | Checked against D-078 | Current — the badge still exists and still means this; D-078 killed the *creation* path, not historical rendering, so the design-system description of what the badge means is unaffected |
| `PRD.md` RS-8 (n>=30 gate, "6 personas x k=5 = 30 per variant") | Checked against D-080's per-provider grouping | Current — the per-provider default shape is still accurate as the base unit each provider group's gate applies to |

---

## 4. Pass 5 — stale-vocabulary sweep, classified by document class

Per methodology §2 Pass 5 and §4: every hit below was checked against its document class before being called drift.

### `GENERIC` / `unconditioned`

| Location | Class | Verdict |
|---|---|---|
| `MASTER_CONTEXT.md:57` (C-13 row) | Current-state | **Drift — DD-3** |
| `PRD.md:344` (RS-2) | Current-state | **Drift — DD-11** |
| `PRD.md:414` (M22 tracker row) | Current-state (tracker rows are current-state per §4) | Correctly current, no action — the row accurately describes the present-tense outcome ("C-13 approval guard is unconditional... while historical GENERIC rows still render truthfully"), verified true |
| `MASTER_CONTEXT.md:196,210,213` (D-065, D-075, D-078 rows) | Append-only history | Correctly historical, no action |
| `PRD.md:436,437` (M22 progress notes) | Append-only history | Correctly historical, no action |
| `DESIGN_GUIDELINES.md:101,128` (badge spec) | Current-state | Verified accurate — see §3 above, no action |
| `RESONANCE_BUILD_PLAN.md`, `M21_M26_BUILD_PLAN.md`, `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md` (22-31 hits each) | Proposal/plan | Correctly preserved as the historical plan record per §4 ("content body is never rewritten") — the actionable issue with these three docs is exclusively their status header, see DD-17 through DD-19, not their internal vocabulary |

### `Upper Funnel` / `Mid Funnel` / `Lower Funnel`

| Location | Class | Verdict |
|---|---|---|
| `MASTER_CONTEXT.md:17` (§1) | Current-state | **Drift — DD-4** |
| `PRD.md:9,13,30,41` (§1-4), `:341,353` (§8.20/21 headers), `:355` (RR-1) | Current-state | **Drift — DD-8, DD-9** |
| `README.md:14` | Current-state | Folded into DD-1 |
| `src/core/funnel.ts`, `funnel.test.ts`, `pipeline.ts`, `pipeline.test.ts`, `resonance.ts:101` (prompt text), `mock/mock.test.ts:57`, CSV route test fixture data | Code (non-doc) | **Correctly non-drift per `PROTECTED_REGISTER.md`'s D-077 row** — "these are non-rendered internals... churns non-rendered internals for zero gain." The `resonance.ts:101` and mock-test occurrences are LLM-facing/test-fixture strings, not operator or client-visible copy — same non-drift verdict |
| `PRD.md:438,442,443,452,518` (progress notes, roadmap-as-narration lines, D-063/D-066/D-071/D-069 rows), `MASTER_CONTEXT.md:194,195,200,202` (Decision Log rows) | Append-only history | Correctly historical, no action, EXCEPT `PRD.md:518` which is also counted as **DD-13** since §12 is phrased as a present-tense current-stage claim, not narration of the past |

### `single engine` / `singleEngine`

| Location | Class | Verdict |
|---|---|---|
| `src/` (all code) | — | **Verified clean — zero remaining hits.** D-080's rename of the run-form prop from `singleEngine` to `singleMode` is complete with no stragglers (confirmed via repo-wide grep, code + tests) |
| `PRD.md:430,446` (M24/M17 progress notes), `MASTER_CONTEXT.md:174,198,216` (D-044/D-067/D-080 rows) | Append-only history | Correctly historical, no action |

### `M16-M20`

| Location | Class | Verdict |
|---|---|---|
| `README.md:11,14` | Current-state | Folded into DD-1 (and DD-1's fix should also update the `README.md:11` "For M16-M20 work, read `RESONANCE_BUILD_PLAN.md`" pointer, since that plan is itself now fully executed — see DD-17) |
| `PRD.md:45` (§5) | Current-state | Folded into DD-13 |
| `DEVELOPMENT_GUIDELINES.md:321` | Current-state | Verified non-drift — see §3 above |
| `MASTER_CONTEXT.md:108` (§7 docs-index row for `RESONANCE_BUILD_PLAN.md`) | Current-state | Accurately describes what the plan document covers (not a currency claim); the real issue is the plan doc's own missing status header, DD-17 |
| `PRD.md:442`, `MASTER_CONTEXT.md:194,197` (D-063/D-066 rows) | Append-only history | Correctly historical, no action |

### `Parallax` on external (user-facing) surfaces

**Verified clean.** Repo-wide grep of `src/app/**` and `src/components/**` (excluding tests) found exactly two literal UI strings — `src/app/login/page.tsx:35` ("Parallax measurement engine · Operator access only") and `src/components/nav.tsx:27` ("Parallax measurement engine") — both rendered as a subtitle beneath a "Resonance" mark/h1, and `src/app/layout.tsx:21`'s page `title: "Resonance"`. This is exactly the D-063/D-077 exemption list ("the umbrella brand (`layout.tsx` title, `login` h1, `nav.tsx` mark) is explicitly untouched") and matches `PROTECTED_REGISTER.md`'s own entry for this surface. No other component or route renders "Parallax" as visible text. **No drift found.**

---

## 5. Proposal/plan status-header drift (Pass 5, §4 application)

Three of the four plan documents self-describe in a way that is now factually wrong about their own git status and/or execution state:

### DD-17 — RESONANCE_BUILD_PLAN.md — no status header, work fully executed (MED)

Opens with "Step-by-step build plan for the Resonance expansion..." and no status line at all. M16-M20, the entirety of what this plan covers, are `Done` per `PRD.md`'s tracker. Per §4, "a plan for work that has since been executed... Add a status header." Also re-cited by `README.md:11` and `MASTER_CONTEXT.md:108`'s docs-index row as if still the live execution guide for upcoming work.

**Fix:** Add `**Status: executed — M16-M20 all shipped, see D-063 through D-071 and PRD.md §11.**` beneath the title. Body untouched.

### DD-18 — M21_M26_BUILD_PLAN.md:2-3 — self-description is factually false (MED-HIGH)

**Claim:** "Proposal for operator review. **Untracked, uncommitted, NOT canon.**"

**Reality:** `git ls-files` confirms this file is tracked; `git log --follow` shows it was committed in `3794e99` ("M21: layer identity — Evidence/Simulation Layer naming"). D-077's own text (`MASTER_CONTEXT.md:212`) states "`M21_M26_BUILD_PLAN.md`... adopted as planning canon alongside this entry." The header contradicts both the file's actual git status and the Decision Log's own account of it. Additionally, M21 through M26 (everything this plan covers) are all `Done`.

**Fix:** Correct the header to reflect tracked/canon status, then add an executed-status line citing D-077 (adoption) and D-077 through D-082 (execution). Body untouched.

### DD-19 — LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md:2-3 — same false self-description (MED-HIGH)

**Claim:** "Proposal for operator review. NOT canon — untracked, uncommitted."

**Reality:** Same as DD-18 — tracked since commit `3794e99`, adopted as canon per D-077's own text. This document's two central proposals (the layer-identity rename, the coverage-contract idea) became D-077/M21 and D-079/M23 respectively, both `Done`.

**Fix:** Same treatment as DD-18, citing D-077 (adoption), D-077 (layer identity executed), D-079 (coverage contract executed).

### Checked, no action: CALIBRATION_PROTOCOL.md and AUDIT_METHODOLOGY.md

`CALIBRATION_PROTOCOL.md`'s header ("Describes how a future human-benchmark calibration run would work... Nothing in this document flips that flag") is still accurate — it describes deliberately-unexecuted future work by design (D-082's own stop-line), not a completed proposal. No fix needed.

`AUDIT_METHODOLOGY.md:3`'s "Status: plan artifact — Pass 0 not yet executed" is stale by exactly one pass (Pass 0 produced `PROTECTED_REGISTER.md` and is complete; Passes 1-5 are this document's own in-flight work). Not assigned a numbered finding since it is this audit's own self-referential status line and will naturally resolve per §7's stated plan ("one closing Decision Log entry for the whole audit") when M30 closes — noted for the lead, not a standalone fix task.

---

## 6. BUILD_NOTES.md truncation candidate (Pass 5, distinct from vocabulary fixes)

### DD-20 — BUILD_NOTES.md:29-538 — all 58 session entries are D-025-eligible for truncation

`BUILD_NOTES.md`'s own Rule 2 (line 8): "Disposable: when a milestone merges, delete its entries. Anything still worth keeping must graduate to a canonical doc first; if it can't, it wasn't worth keeping." Every milestone represented in the file's "Entries" section (S-001/M0 through S-058/M29-hotfix, lines 29-538, 510 lines, 212KB) has merged — there is no currently-open milestone in this file. Spot-checking confirms the durable facts have already graduated: S-057 (M28) → D-085, S-056 (M27) → D-084, S-054 (M26) → D-082, S-052 (M24) → D-080, S-051 (M23) → D-079, S-050 (M22) → D-078, S-049 (M21) → D-077 — each session's DONE summary is reproduced, at comparable or greater density, in its corresponding Decision Log row, and milestone-level status already lives in `PRD.md` §11's tracker and progress notes per `MASTER_CONTEXT.md` §10's single-home rule.

This is the "bigger, safer win" the methodology names in §4: a mechanical, rule-sanctioned deletion of already-graduated content, distinct from the judgment-calls above. It carries none of the interpretive risk of a vocabulary rewrite — the rule is unconditional ("when a milestone merges, delete its entries") and the precondition (durable facts graduated) is independently verifiable per-entry against the Decision Log.

**Recommendation:** Truncate the "Entries" section to empty (or to whatever trailing entries represent work not yet reflected in a merged milestone, which as of this audit is none). Practical note for the lead, not part of the rule itself: the boot ritual that kicked off this very audit asked to read "the last 5 entries... for recent session context," suggesting some retained value in the most recent few entries for a fresh session's situational awareness even after their milestone has merged — the lead may reasonably choose to keep S-054 through S-058 (or similar) as a standing exception rather than truncating to zero. Both a full truncation and a keep-last-N truncation are consistent with D-025; this audit does not decide between them.

---

## 7. Summary

| Category | Count |
|---|---|
| Current-state doc drift (DD-1–DD-16, excluding DD-14 REVIEW) | 15 |
| REVIEW — lead input needed | 1 (DD-14) |
| Proposal/plan status-header drift (DD-17–DD-19) | 3 |
| BUILD_NOTES truncation candidate | 1 (DD-20, 58 sessions / 510 lines) |
| Verified clean / correctly historical / correctly protected (shown, no action) | 8 doc-level confirmations + 5 vocabulary-category sweeps |
| **Total numbered findings** | **20** |

No doc content was edited by this pass — all fixes above are recommendations for the later cleanup dispatch.
