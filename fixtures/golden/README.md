# Golden Expectation Manifest

`golden.json` holds 28 hand-labeled entries keyed by `fixtureId`, matching ids
in `fixtures/mock-responses/fixtures.json`. Every one of the 13 MK-3
archetypes is covered at least once. Verdicts are written against the actual
LedgerFox demo fact sheet (`fixtures/demo-project.json`), so `wrong-pricing-*`
and `wrong-feature-*` fixtures genuinely contradict a fact claim, and
`unsupported-security-*` fixtures mix one `contradicted` claim (over-broad SSO
availability) with one `unsupported` claim (SOC 2, never mentioned in the
fact sheet).

Each entry's `expected` is a raw, engine-shaped `ExtractedResponse`:
`canonical_brand_id` is always `null` and `claims[].matched_fact_claim_id`
uses symbolic ids (`fact-pricing`, `fact-feature`, `fact-security`) rather
than real UUIDs — golden tests are DB-free (`src/modules/extraction/golden.test.ts`)
and run the real `resolveBrandId`/`collapseDuplicateBrandMentions` pipeline
against a small in-test brand list mirroring the demo project, so the test
exercises actual alias-resolution logic rather than asserting a hardcoded
pass-through.

Fixtures without a golden entry still extract via `src/providers/mock/extraction-engine.ts`'s
generic fallback (refusal/malformed flags inferred from `archetype`, brands
empty) — every one of the 38 mock-response fixtures produces a valid
extraction, but only golden-labeled ones get rich, asserted structure.

Golden tests fail if a fixture's text changes without updating the matching
`expected` entry in the same commit, since fixture selection (D-016) and
extraction lookup are both keyed by exact fixture id/text.
