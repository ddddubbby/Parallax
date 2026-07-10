# M34 Phase 0 — Framing feasibility

> Generated 2026-07-10T16:14:44.345Z
> **Verdict: NO-GO**

## Gate

| Check | Result |
|---|---|
| ≥1 real baseline eligible | FAIL |
| Unstable fixture abstains | PASS (status=recurring_only) |

**NO-GO.** Do not loosen thresholds automatically. Stop before C-15; write a protocol-reassessment note and escalate.

Instrument: `framing-protocol.v2` (blind extraction `blind-frame-extraction.v2`, clustering `frame-cluster.v2`). Eligibility thresholds are byte-identical to framing-protocol.v1; v1's run-1 NO-GO record is preserved untouched.

## Gate exclusions (diagnostic-only scopes)

- `organic|heytea-be18|deepseek|ungrounded` — Heytea is stored with category_archetype=b2b (the D-052 defect): its audit ran B2B-procurement prompt templates against a consumer tea brand, and BF-24 excludes B2B projects from framing baselines. Kept as instrument diagnostics; never gate evidence.

## Eligibility results

- `neutral|i-57a09303f357|deepseek|ungrounded` → **prompt_sensitive** (top: category::360 camera user)
  - diagnostics: `{"fullWins":{"category::360 camera user":2,"differentiator::invisible selfie stick shot":1},"topWins":2}`
- `neutral|i-57a09303f357|openai|ungrounded` → **volatile** (top: audience::action sport user)
  - diagnostics: `{"fullWins":{"audience::action sport user":1},"topWins":1}`
- `organic|heytea-be18|deepseek|ungrounded` *(GATE-EXCLUDED)* → **prompt_sensitive** (top: offering::cheese tea)
  - diagnostics: `{"winCounts":{"offering::cheese tea":1},"topWins":1}`
- `organic|i-57a09303f357|deepseek|ungrounded` → **sparse**
  - diagnostics: `{"qualifyingCellCount":0,"required":5,"label":"SPARSE ORGANIC EVIDENCE"}`

## Salvage (blind-frame-extraction.v2 per-frame validation)

- evidence quotes truncated to the 240-char cap: 1
- individually invalid frames dropped: 0
- whole-payload voiding removed: a response is now `malformed` only when its envelope is unparseable.

## Unstable fixture

- status: **recurring_only**
- diagnostics: `{"fullWins":{}}`

## Prevalence (descriptive only)

{
  "note": "Descriptive only — 6 prompt variants × N generations; no Wilson interval or independence claim",
  "neutralStructure": "6 variants × up to 5 generations",
  "organicMentionDensity": {
    "organic|heytea-be18|deepseek|ungrounded": {
      "responses": 43,
      "cells": 15,
      "frameHits": 191
    },
    "organic|i-57a09303f357|deepseek|ungrounded": {
      "responses": 1,
      "cells": 1,
      "frameHits": 5
    }
  }
}

## Costs (feasibility)

| Step | USD |
|---|---|
| Organic frame extraction | 0.0288 |
| Neutral frame extraction | 0.0639 |
| Embedding (clustering) | 0.0000 |

## Frozen artifacts

- `fixtures/framing/framing-protocol.v2.json`
- `fixtures/framing/representation-prompts.v1.json`
- `fixtures/framing/blind-frame-extraction.v2.json`
- `fixtures/framing/unstable-fixture.json`
- `fixtures/framing/framing-protocol.v1.json` (superseded — run-1 NO-GO record, untouched)

## Notes

- Heytea project is stored with `category_archetype=b2b` in the dev DB despite being a consumer tea brand; organic lane still used its discovery/consideration client-mention responses.
- Insta360 organic mention density is sparse (≤1 qualifying cell historically); neutral-elicited mini-run is the primary Insta360 evidence for Phase 0.
- Forbidden vocabulary ("bias-free" / "unbiased" / "vanilla") does not appear in this report.
