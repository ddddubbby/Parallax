# Mock Response Manifest

M4 requires 30-50 fixture responses. Each fixture should include:

- `id`
- `archetype`
- `text`
- `citations`
- expected tracked brands present
- expected failure mode, if any

Required archetypes:

- ranked list with client first
- ranked list with competitor first
- prose comparison
- hedged recommendation
- no tracked brands
- cited answer with multiple domains
- wrong pricing claim
- wrong feature claim
- unsupported security claim
- refusal
- truncated output
- malformed output
- low-stability variant set

Fixture selection is seeded by a stable hash of `(resolved_text, provider_id, rep_index)` — never by row UUIDs — so selection is reproducible across re-seeds and fresh clones (D-016).
