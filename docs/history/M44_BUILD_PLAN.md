> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M44 execution — D-114 methodology simplification, guided operator path, theme-organized baseline picker, framing-workflow retirement · DISPOSITION: EXECUTED (merged to main via M44; trunk reconciles under M46/D-117)

# M44_BUILD_PLAN.md — Simplified simulation methodology + guided operator path

> Governing decision: D-114 (see `DECISIONS.md`, including its supersession edges over D-099/D-102/D-103). Product contract: `PRD.md` §8.34. This plan earns a standalone file under D-090: multi-phase, per-phase acceptance, realistically multi-session.

## 1. Objective

Replace the codebook-era framing workflow with a four-step operator journey — **See → Pick → Rewrite → Test** — and make the entire product self-navigating: at every moment, every surface names the single next action. Nothing in the audit measurement path changes; C-12/C-14/C-9 walls are untouched.

## 2. Methodology (final form)

- **See**: existing audit (unbranded + representation intents, k=5). No changes.
- **Pick**: baseline = operator-selected **verbatim stored response**, browsed via machine-extracted framing themes. v1 themes: attribute-association-matrix grouping (zero new spend). v2 themes: blind framing extractor (raw text + brand name in, nothing else) + embedding clustering. Machine pre-selects the cluster-central response (deterministic tie-break); operator confirms/overrides. Auto-stamp: response id, engine, prompt, date, theme label, mechanical recurrence line (`n/N responses`, engine/prompt spread; descriptive counts only). Low-recurrence label: `SINGLE OBSERVED INSTANCE`.
- **Rewrite**: corrected/repositioned/custom variants against the named theme (existing wizard machinery).
- **Test**: SSR → PMFs → ΔPI vs baseline. C-14 comparative-only, D-023 no invented intervals, n≥30 variant gate — all unchanged.

Bright lines (test-enforced): themes are never the stimulus; the stimulus always resolves to a stored raw response id (C-13); clustering is never an admission gate; "recurring" never renders without its backing count.

## 3. Guided path — the "never wandering" contract

One pure function, one source of truth, rendered in three places.

**`deriveNextStep(projectState)` in `/src/core/guidance.ts`** — pure, exhaustive, unit-testable. Input: already-queryable project state (intake completeness, matrix state, run states, response counts, study states, baseline/variant presence, results presence). Output: `{ stage, title, hint, href, cta }`. The journey map:

| # | State | Next step shown |
|---|---|---|
| 1 | Intake incomplete | "Finish project setup" → resume exact intake step |
| 2 | No approved matrix | "Review and approve your prompt matrix" → matrix |
| 3 | Approved matrix, no run | "Start your first audit run" → new run |
| 4 | Run in flight | "Audit running — {done}/{planned} samples" → run progress |
| 5 | Run complete, no report viewed/built | "See how AI talks about you" → dashboard |
| 6 | Consumer project, no study | "Test a better framing" → new study |
| 7 | Study draft, no baseline | "Pick the framing to fight" → theme picker |
| 8 | Baseline set, no challengers | "Write challenger framings" → variants |
| 9 | Variants set, unapproved | "Approve and run the panel" → approval |
| 10 | Panel complete | "Read the results" → results (leads with top ΔPI) |
| 11 | Results read | "Export the client report" → report/export |

**Render points (exactly three, same copy source):**
1. Project hub header — a NEXT STEP card with one CTA.
2. Every empty state on every surface — sourced from the same map, never hand-written per page.
3. Projects library rows — compact hint ("next: approve matrix").

**Rules:** exactly one primary next action at any time; a surface that blocks must name its unblock and link to it (the C-15-dropdown dead end is the anti-pattern this kills); the SEE → PICK → REWRITE → TEST rail renders on all Simulation surfaces with current position; contract test asserts every guidance entry has a non-empty `href` (no dead ends by construction).

## 4. Phases

**P0 — Governance (this commit).** D-114 + register edges; MASTER_CONTEXT C-15/glossary/index; PROTECTED_REGISTER supersession pass; PRD header + §8.34; this plan; branch STATUS; BUILD_NOTES. *Acceptance:* `pnpm docs:check` green.

**P1 — Guided path over the existing flow.** `/src/core/guidance.ts` + unit tests; hub NEXT STEP card; empty-state wiring on projects/matrix/runs/dashboard/resonance surfaces; library row hints; journey rail component. Ships before any methodology code so the product stops stranding users immediately. *Acceptance:* guidance unit tests exhaustive over the map; e2e fresh-project walk asserting each stage's next step; axe on new surfaces; no-dead-end contract test.

**P2 — Baseline picker v1 (attribute themes).** Response browser grouped by attribute-association themes with `n/N` counts; "Use as baseline" one-click; provenance auto-stamp on `resonance_stimuli` (if new columns are needed this is a **migration** — 0019, additive, no backfill); approval gate in the resonance repository drops the snapshot requirement and requires stored-response linkage (C-13 path); C-12 wall tests updated; stamp renders on results/report/export. *Acceptance:* wall tests green; e2e See→Pick→Rewrite→Test on seeded mock data; historical studies still render their old labels.

**P3 — Framing workflow retirement.** Framing routes become read-only historical surfaces (view stored studies, no new study creation); nav de-emphasized; guidance map never points into them; no table drops, no row deletion (C-3). *Acceptance:* e2e historical render; docs:check; PROTECTED_REGISTER cites verified.

**P4 — Blind extractor + clustering (themes v2).** Extraction prompt + state machine mirroring the standard extractor's retry/dead-letter/budget discipline (C-2 covers spend); golden fixtures incl. adversarial; embedding clustering + machine-generated labels (marked); picker upgrades from attribute themes to framing themes. *Acceptance:* golden dataset tests; budget-guard tests; deterministic clustering fixture test.

**P5 — Report integration + verification.** ΔPI-vs-named-theme report section; forbidden-phrase tests updated (RB-5 pattern: "recurring" requires backing count; no "certified"/"validated coding" vocabulary); full gate list (`lint --max-warnings 0`, `typecheck`, `test`, `test:golden`, `test:e2e`, `build`) + interactive verification evidenced in BUILD_NOTES per D-092. *Acceptance:* all gates green; interactive walkthrough recorded.

## 5. Stop lines

- No audit-measurement, metric, extraction-schema, or cost-guard change beyond the enumerated scope.
- C-12/C-14/C-9 walls and the agent product (`src/modules/agent`, AGENT_PRD surfaces) untouched — D-113 ownership boundary.
- Any schema change says the word **migration** and ships as one.
- No free-text baseline entry, no theme-as-stimulus, no clustering-as-gate — automatic reject, cite D-114.
- `site/**` untouched.

## 6. Merge

PR `m44` → `main` at phase-green boundaries (D-113); this plan archives to `docs/history/` in the final merge commit with M44's BUILD_NOTES pruned (D-025), and `PROTECTED_REGISTER`/`MASTER_CONTEXT` land already-consistent.
