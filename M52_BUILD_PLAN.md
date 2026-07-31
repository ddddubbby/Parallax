> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M52 Run detail Diagnostics consolidation implementation and acceptance · TRACKER: STATUS.md

# M52 — Run detail Diagnostics consolidation

## Outcome

Consolidate the Run detail surface into one operator-facing activity narrative on Overview, with extraction/lifecycle remediation as a focused **Diagnostics** drill-down—not a competing top-level Events section. No migration; C-3 traceability unchanged.

## Rulings (D-122)

1. **Overview stays the narrative** — progress, forecast, controls, pause/offline, cost remain on Overview. A lightweight recent-activity summary (last ~5 events) links into Diagnostics.
2. **Diagnostics replaces Events + Extraction tabs** — canonical view token `diagnostics`. Combines lifecycle events, extraction/scoring status, dead-letter remediation, and re-extraction history (audit only).
3. **URL aliases** — `?view=events` and `?view=extraction` resolve to `diagnostics` (no hard redirect flash). Invalid views fall back to `overview`.
4. **Simulation truthfulness** — Diagnostics is available on Message Lift / resonance runs for lifecycle events only; never mount the audit ExtractionPanel.
5. **Metrics unchanged** — audit-only Metrics tab stays. No schema, worker, or spend-control change.

## Implementation phases

1. **Governance** — branch `m52` from `m51-ui-ux-roadmap@b34b164`; D-122 + supersession edge on D-088 Run-tab wording; STATUS/PRD/canon index; this plan.
2. **Views** — `RUN_DETAIL_VIEWS` + alias parser + unit tests.
3. **UI** — Run page tabs; Diagnostics shell; RunProgress overview recent-activity; drop Events-only view; ExtractionPanel subsection heading.
4. **Verification** — UI/route contracts, e2e smoke, lint/typecheck/docs/vitest/build/e2e gates; BUILD_NOTES evidence.

## Stop lines

- No migration; no deletion of extractions, events, or versions.
- No Metrics semantics change; no inventing audit extraction UI on simulation runs.
- PR stacks on M51 until M50/M51 land on `main`, then retarget.

## Acceptance

Filled at close in `STATUS.md` + `BUILD_NOTES.md` per D-092.
