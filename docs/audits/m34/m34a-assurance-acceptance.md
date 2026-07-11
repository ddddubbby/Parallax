# M34A.1 Pre-Merge Assurance Acceptance

Date: 2026-07-11
Decision: D-103
Branch: `m34-baseline-framing`

## Result

PASS. The assurance patch closes the identified client-claim and enforcement gaps without adding semantic eligibility, clustering, medoids, confidence intervals, or M34B machinery.

## Boundaries proved

- Recurrence uses the complete sampled source-job denominator and distinguishes available responses from unavailable jobs.
- Recurrence is attributed only to the coded association; the selected full verbatim response is explicitly non-representative.
- Metadata-masked discovery is deterministic, persisted, SHA-verified, and attested at lock; prior external knowledge is disclosed as unknowable.
- Review supports explicit `other`, `entity_ambiguous`, and `insufficient_evidence` outcomes.
- Gap review terminates explicitly as actionable or no-action; only a missing, misframed, or unsupported actionable gap can hand off.
- New consumer handoffs require `live_audit`, use v2, and are idempotent by annotation × gap.
- Snapshot and approved-stimulus immutability is enforced in PostgreSQL, not only repositories.
- Simulation reads reverify exact baseline id, body, evidence id, SHA, and gap linkage.
- Persona and stimulus text is escaped inside the versioned untrusted JSON prompt envelope.
- Results and exports render immutable provenance plus model-implied, uncalibrated, comparative, model-draw-floor language.

## Permanent regression checks

- `src/db/migrations/upgrade-path.test.ts`: data-preserving 0012 → 0015 upgrade and trigger installation.
- `src/db/repositories/framing.test.ts`: manifest integrity, explicit attestation, complete denominator, exact spans, mock/live-validation rejection, concurrent idempotency, snapshot freeze, approved-stimulus freeze, and v2 Simulation read.
- `src/core/resonance.test.ts`: adversarial persona/stimulus containment in `resonance-panel.v2`.
- `e2e/operator-journey.spec.ts`: review → gap → handoff → Simulation snapshot selector.

## Verification

- `pnpm typecheck` — pass.
- `pnpm lint` — pass.
- `TEST_DATABASE_URL=… pnpm test` — 84 files passed, 2 intentionally skipped; 548 tests passed, 12 skipped.
- `DATABASE_URL=… pnpm test:mock-e2e` — 500/500 succeeded, retry and stale-lock reclaim observed, no duplicate responses, 24.1 seconds.
- `pnpm build` — pass.
- `pnpm test:e2e` — 4/4 pass: operator smoke, focused M34A workflow, axe, and mobile drawer.

## Failures found and fixed during acceptance

1. The v2 Simulation reader omitted `gap_classification_id` from a partial snapshot SELECT, causing valid v2 records to fail closed.
2. PostgreSQL JSONB key ordering changed the persisted discovery-manifest object order; parsing now reconstructs the versioned canonical shape before digest verification.
3. A raw SQL `coalesce` timestamp decoded as text; repository output now normalizes it to `Date`.
4. Existing tests fabricated approved studies before inserting stimuli; fixtures now follow draft → stimuli → approved, preserving the strict database freeze.
5. Shared `Field` captions were visual spans rather than accessible labels; the wrapper is now a semantic label and the browser workflow targets controls by name.
