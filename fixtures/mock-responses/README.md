# Mock Response Manifest

The corpus lives in `fixtures.json`: 36 fixtures, each with `id`, `archetype`,
`text`, and `citations`. All 13 required archetypes are covered:

- ranked list with client first (`ranked_list_client_first`)
- ranked list with competitor first (`ranked_list_competitor_first`)
- prose comparison (`prose_comparison`)
- hedged recommendation (`hedged_recommendation`)
- no tracked brands (`no_tracked_brands`)
- cited answer with multiple domains (`cited_multi_domain`)
- wrong pricing claim (`wrong_pricing_claim`)
- wrong feature claim (`wrong_feature_claim`)
- unsupported security claim (`unsupported_security_claim`)
- refusal (`refusal`)
- truncated output (`truncated_output`)
- malformed output (`malformed_output`)
- low-stability variant set (`low_stability_variant`)

Fixture selection is seeded by a stable hash of `(resolved_text, provider_id, rep_index)`
— never by row UUIDs — so selection is reproducible across re-seeds and fresh
clones (D-016). `src/core/hash.ts` implements the hash; `src/providers/mock`
implements selection.

M4 archetypes (refusal, truncated, malformed) are content only — per D-011,
any text a provider returns is a successful job; extraction (M5) judges the
content. `expected tracked brands present` and other golden-labeling fields
are added when the M5 golden dataset is built (`fixtures/golden/`), keyed by
these same `id` values.
