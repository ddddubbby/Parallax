# M34 Phase 0 — framing-protocol.v3 gate ruling

> 2026-07-11. Verdict: **NO-GO — v3 rejected, not frozen.** The stop occurs
> before the human-coded instrument check and before any Crocs/Xiaomi generation.

## What v3 repaired

The recovery harness implemented the six D-096 instrument requirements before new
scoring:

1. Exact, case-sensitive contiguous evidence quotes resolved to stored source offsets;
   unsupported frames are rejected individually.
2. Immutable generation and extraction manifests cover prompts, decoding, models,
   protocol versions and raw-text hashes; a mismatch cannot resume.
3. Every terminal response remains in the denominator, including `no_frame`,
   `uncertain`, `insufficient_evidence`, and `entity_ambiguous`.
4. Organic inputs require exactly one declared audit run and one standard-extraction
   version (implemented and test-locked; no v3 organic scoring was needed for this gate).
5. Synonym, distinct-concept, polysemy and over-merge controls traverse the same
   offset → complete-link clustering → blind mapping → profile-eligibility path.
6. Concept mapping is blind to counts, variants, cells, providers, prevalence and
   eligibility and locks before scoring.

The v3 model also separates concept identity from dimension tags, permits several
independently stable concepts, reports a per-concept dimension distribution, and
selects a deterministic profile medoid. It does not require a unique top concept.

## Controls

All four controls passed. The preregistered threshold-selection rule chose the highest
candidate passing every control: cosine **0.88** with complete-link clustering. Every
candidate from 0.78 through 0.88 passed, so the result was not a knife-edge threshold
fit.

| Control | Expected | Actual |
|---|---|---|
| Surface-synonym consolidation | one stable identity concept | eligible, one identity |
| Genuinely distinct concepts | abstain | `unstable_profile` |
| Cross-dimension polysemy | one concept, two-dimension distribution | eligible; category 18 / offering 12 |
| Over-merge | two strategically distinct identities | eligible, two identities |

The first control attempt exposed two harness/fixture defects before brand scoring:
cross-control labels were incorrectly pooled, then the positive fixture used the
broader phrase `clog footwear` rather than a true surface synonym. Both were corrected
before any development or held-out scoring. The immutable final positive set is
`foam clog | foam clog shoe | foam clog footwear`.

## Development ablation

The six admission prompts were run 5× on DeepSeek, ungrounded, for development-only
Insta360 under two manifest-isolated arms. v4/v5-style offering/audience prompts were
not admission prompts. A blind OpenAI mapper (`gpt-5.5-2026-04-23`) normalized labels
in ≤30-label chunks and consolidated chunk concepts without counts or outcomes.

| Arm | Terminal responses | Unsupported frames | Result | Strongest stable pattern |
|---|---:|---:|---|---|
| Without uncertainty clause | 29 `ok`, 1 `insufficient_evidence` | 81 | `unstable_profile` | best identity-like concept won 4/6 variants |
| With uncertainty clause | 30 `ok` | 39 | **eligible** | one identity concept won 5/6 variants; category/offering distribution 10/12 observations |

The preregistered rule retained the shared uncertainty sentence only if it reduced
`entity_ambiguous|uncertain|insufficient_evidence` by at least 10 percentage points
**and** left the stable-concept set identical (Jaccard = 1). It did neither: terminal
abstention improved only 3.3 points, and eligibility existed only with the clause.
Therefore the protocol selects the no-clause arm, which is unstable. Using the
clause-arm pass would enshrine prompt-induced stability and violate the registered
decision rule.

## Operational findings

- Exact offsets exposed substantial unsupported evidence: 81 frame observations in
  the no-clause arm and 39 in the clause arm were rejected rather than silently
  normalized or stitched.
- Blind mapping generated 112/123 unique labels from 30 responses. One-shot DeepSeek
  mapping failed twice at transport JSON; one-shot OpenAI mapping later exceeded the
  90-second deadline. Chunking made the path complete but produced 62/58 final groups.
- Final stored artifacts account for at least **$1.1185**: controls, two completed
  generation/extraction arms, final chunked mappings, and the abandoned clause
  generation artifact. Earlier overwritten mapper experiments and timed-out provider
  attempts are not fully attributable from response metadata, so provider-side billing
  reconciliation is required. This confirms mapping/review spend must enter C-2 guards.

## Gate disposition

- `framing-protocol.v3` is **rejected-not-frozen**.
- The human-coded gold set is not run: an earlier freeze condition already failed.
- Crocs and Xiaomi remain untouched held-outs. Running them now would spend validation
  data on a method known to be clause-sensitive.
- Migration 0013 and production Phases 1–6 remain blocked.
- No threshold was loosened, no post-score merge was applied, and the passing clause
  arm was not promoted.

## What would justify v4

Do not merely repeat v3. A v4 proposal needs a lower-variance coding instrument that
reduces exact-quote rejection and concept-label explosion without relying on a shared
elicitation clause to create recurrence. It must also replace the costly, timeout-prone
large blind-mapping step with a bounded review protocol whose reliability can be
human-checked before new held-outs are selected.
