> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M45 execution — durable brand-name resolution (compact matching, containment, collision guard, re-resolve, resolution health) · TRACKER: STATUS.md

# M45_BUILD_PLAN.md — Durable brand resolution

> Governing decision: D-115. Root cause on record: the Insta 360 audit (run `a45cbc1e`) lost 97.7% of client mentions because `resolveBrandId` requires exact normalized equality and the operator registered "Insta 360" while every AI engine writes "Insta360". Aliases were the manual patch (S-repair, 2026-07-19); this milestone makes the class of error structurally impossible to miss. This file is deliberately small — it exists because D-112's branch control plane requires a tracker plan, not because the milestone clears D-090's size bar.

## Design — deterministic layers + a feedback loop

1. **Compact-key equality** (`src/core/brand-matching.ts`): after today's normalization, strip all non-alphanumerics. `Insta 360` ≡ `Insta360` ≡ `insta-360`. Exact-normalized match keeps precedence; compact is the fallback. SM-4's determinism is preserved — no LLM opinion enters resolution.
2. **Unique tokenized containment**: an observed name resolves to a brand iff exactly one tracked brand has a term matching a contiguous token window of the observed name on compact comparison (`Insta360 X4` → `[insta360][x4]` → window `insta360` ≡ brand). Two-brand hits stay unresolved — fail closed, never guess.
3. **PM-9 upgrade**: `findBrandTerms` adopts the same matcher, closing the mirror-image integrity hole (a prompt containing "Insta360" currently passes the unbranded scan when the brand is registered "Insta 360"). Attribute matching is untouched.
4. **Collision guard**: brand save paths reject two tracked brands sharing a compact key (the one configuration compact matching cannot disambiguate).
5. **Re-resolve as a product operation** ($0): re-run resolution over stored latest-valid extractions, writing NEW extraction versions (C-3 versioning, zero cost, claims copied) + derived mention rows, then `recomputeMetrics`. Idempotent — unchanged resolutions create no new version.
6. **Resolution health**: dashboard data-quality card listing top unresolved `observed_name`s with counts, a loud warning when any single unresolved name exceeds 5% of tracked mentions, and per-row "add as alias → re-resolve" one-click adoption.

## Phases

| Phase | Scope | Acceptance |
|---|---|---|
| P0 | Governance: D-115/D-116, STATUS, this plan | docs:check green |
| P1 | `brand-matching.ts` core + `resolveBrandId`/`findBrandTerms` rewire | unit tests incl. Insta360/GoPro regression fixtures; golden suite green (updated expectations reviewed, not rubber-stamped) |
| P2 | Re-resolve service (new extraction versions + claims copy + recompute) | DB-backed tests: version bump, idempotency, metrics change |
| P3 | Collision guard + resolution-health panel + add-alias action | unit + e2e touch + axe on the new card |
| P4 | Full gates + interactive verification + handoff | lint 0-warn, typecheck, full Vitest, e2e, build; BUILD_NOTES evidence |

## Stop lines

- Resolution stays deterministic — no fuzzy scores, no LLM canonicalization (SM-4).
- Containment resolves only on a UNIQUE brand hit; ambiguity is unresolved, never a guess.
- No changes to metric math, frames (D-054), or agent surfaces. `site/**` untouched.
- Any schema change says the word **migration** (none anticipated — new extraction rows use the existing versioning).
