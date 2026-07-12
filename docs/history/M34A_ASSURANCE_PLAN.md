> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M34A.1 pre-merge assurance plan (D-103) · DISPOSITION: EXECUTED

# M34A.1 Pre-Merge Assurance Plan

> **IMPLEMENTED AND VERIFIED — 2026-07-11 (D-103).** Corrects client-facing
> evidence semantics and hardens the implemented M34A workflow. It does not
> reopen M34B, clustering, medoids, eligibility thresholds, or calibration.

## Outcome

M34A may merge as client-ready only after it:

1. labels its complete denominator as sampled source jobs/answer attempts;
2. distinguishes recurrence of a selected association from representativeness
   of the full verbatim baseline response;
3. contains untrusted stimulus text before sending it to a Simulation model;
4. permits Simulation handoff only from a `live_audit` with a recorded
   actionable gap;
5. makes snapshots and approved stimuli database-frozen and idempotent;
6. preserves non-editable provenance on every result and export surface; and
7. restores auditable discovery, abstention, upgrade, and browser checks.

## Fixed decisions

- Mock and `live_validation` framing studies remain useful for workflow QA but
  are permanently labeled and cannot create new Simulation handoffs.
- Gap review ends explicitly as `actionable_gap_identified` or
  `no_actionable_gap_identified`. Only missing, misframed, or unsupported gaps
  can be handed to Simulation.
- New handoffs use `m34a-simulation-evidence.v2`; v1 remains historical and
  readable but cannot approve a new study.
- Discovery is described as metadata-masked, not proof of cognitive blinding.
- Visible Simulation copy says model-implied, uncalibrated, and comparative;
  the n>=30 mechanism is a model-draw floor, never aggregate-grade evidence.

## Build sequence

1. Forward migration 0015: discovery/gap state, richer review outcomes,
   gap-linked handoff uniqueness, snapshot freeze, approved-stimulus freeze.
2. Persisted ten-item discovery manifest, disclosure/attestation, complete
   review outcome distribution, terminal gap outcome, and full-response
   handoff preview.
3. V2 snapshot payload with source-run, association, gap, scope, and SHA
   provenance; live-audit/actionable-gap admission; fail-closed reads.
4. Versioned untrusted-data Simulation prompt envelope and corrected
   model-signal language.
5. Full evidence export, immutable report provenance, migration-upgrade and
   browser regression gates, and retired-research command guards.

## Acceptance

Fresh and 0012-upgrade migrations, direct-SQL freeze checks, concurrent
handoff idempotency, denominator/association-claim tests, mock/validation and
gap admission tests, adversarial prompt fixtures, edited-report provenance,
focused Playwright framing-to-Simulation coverage, lint, typecheck, full
Vitest, golden, mock E2E, Playwright, and build must all pass.
