> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M51 operator UI honesty, guidance, remediation, and acceptance · TRACKER: STATUS.md

# M51 — Operator UI honesty and remediation

## Outcome

Close the reviewed operator-journey gaps without changing methodology, evidence walls, schema, routes, or visual language. M51 makes irreversible actions informed, empty and recovery states actionable, audit findings fresh without blocking delivery, and evidence/remediation available where the operator is already working.

## Product ruling

D-121 governs findings, dead-letter remediation, calibration copy, and confirmation details. M50/D-120 remains unchanged: only `ready` renders a p10–p90 forecast range; `calibrating` receives non-estimate status copy.

## Phases

### P0 — Governance

- Retarget branch-local `STATUS.md`, PRD, the canonical document index, and BUILD_NOTES.
- Keep M51 stacked on `m50@d352994`; integrate M50 before M51.
- No migration.

Acceptance: `STATUS.md` names M51 and this plan; `pnpm docs:check` passes.

### P1 — Evidence-honesty parity

- Gate run-detail overall metrics with the same sufficient-n formatting used by the dashboard.
- Preserve D-023 point-estimate treatment for competitive spectrum.

Acceptance: insufficient overall metrics do not render value/CI claims on either surface.

### P2 — Informed irreversible actions

- Show deterministic, pillar-representative resolved prompts in matrix approval.
- Confirm live spend with mode, provider, generation mode, repetitions, planned calls, projected cost, and cap; keep known configuration visible when projection is unavailable.
- Block study approval while any message or study edit is unsaved.

Acceptance: matrix freeze and live spend require informed confirmation; unrelated dirty sources survive a study-field save.

### P3 — Guided path and empty states

- Finish intake at the project hub.
- Add one dossier-style `EmptyState` taxonomy on selected first-use, filtered-zero, unavailable, and completed-success surfaces.
- Add page-local next actions without duplicating the sidebar stage card.
- Hydrate generated report sections in state rather than reloading.
- Add Message Lift to project-hub sections; keep historical Framing out.

Acceptance: migrated empty states teach and offer one next action; no report-generation reload; hub navigation includes Message Lift.

### P4 — Findings, delivery, and recovery

- Compute audit findings through the canonical analysis service after metric self-heal on dashboard reads and before direct report advisory reads.
- Keep resonance runs outside audit findings (C-12).
- Show dashboard findings and an advisory-only pre-export checklist.
- Scope dead-letter listing and re-extraction to the current project/run with latest-dead-letter ownership checks.
- Keep remediation failure-safe and label synchronous completion accurately.
- Give failed/cancelled runs recovery actions.

Acceptance: findings are fresh on the next dashboard or report fetch; export remains available; remediation cannot cross project/run boundaries.

### P5 — Reserved stamp consistency

- Route active MOCK and VALIDATION-ONLY surfaces through `RunModeStamp`.
- Keep PARTIAL as a separate completeness stamp.
- Render Message Lift small-n state through `Stamp` without unifying intentionally different layer copy.

Acceptance: active mode stamps share one mapping and retain reserved semantics.

### P6 — Baseline access and calibration feedback

- Replace the 12-response client slice with server cursor paging and full-corpus theme counts.
- Restore a saved off-page baseline on reload and deduplicate it when later pages arrive.
- Show `Learning this run’s pace…` only for active, online `calibrating` runs.

Acceptance: every stored response is reachable; saved off-page selection stays visible; ready, recalibrating, paused, offline, and terminal states suppress calibration copy.

### P7 — Review hardening and closeout

- Use pillar-first deterministic prompt sampling.
- Keep findings orchestration in `src/modules/analysis`, not dashboard→report coupling.
- Add executed action tests for findings freshness, report advisory freshness, and dead-letter failures.
- Run lint, typecheck, docs, Vitest, production build, main Playwright, and forecast Playwright.

Acceptance: all gates green and BUILD_NOTES records exact evidence.

## Stop lines

- No schema or migration.
- No metric, evidence-eligibility, provider, retry, or spend-control change.
- No new route, toast system, form framework, data-table framework, animation dependency, or visual token.
- No Framing promotion on the project hub; no hard Generate/Export gate.
- No competitive-spectrum Wilson interval.
- No unification of audit “Insufficient data” with Message Lift “Early read.”
- Preserve unrelated operator files and the separate Apple-skill deletion.

## Verification

- Focused unit/action/DB tests for every changed correctness boundary.
- `pnpm lint --max-warnings 0`
- `pnpm typecheck`
- `pnpm docs:check`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`
- `pnpm test:e2e:forecast`

## Acceptance state

Met. Implementation commit `ecec3e7`. Evidence in `STATUS.md` and `BUILD_NOTES.md` S-122: lint, typecheck, docs, 900/12 Vitest, production build, main Playwright 18/18, and forecast Playwright 4/4.
