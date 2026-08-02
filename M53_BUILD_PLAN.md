> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M53 operator-facing sample terminology and acceptance · TRACKER: STATUS.md

# M53 — Sample terminology clarity

## Outcome

Replace operator-facing statistical shorthand with names that explain the measurement without requiring a methods background:

- `n` → **Sample size**
- `k` / repetitions per cell → **Repeats per prompt**

## Rulings (D-123)

1. Audit dashboard, matrix planning, run configuration, generated findings, and generated reports use the named terms.
2. Internal identifiers, formulas, tests, and methodology notation may retain `n` and `k` where they are genuinely mathematical rather than operator-facing.
3. The meaning is unchanged: sample size remains the eligible-response count for a displayed measure; repeats per prompt remains the number of responses planned for each prompt and engine-mode.
4. No schema, calculation, threshold, provider, spend, or run-planning behavior changes.

## Acceptance

- No audit-facing `n=` or `k=` remains in the affected workflow.
- Dashboard and report copy make the number and its unit clear.
- Focused terminology tests plus lint, typecheck, docs check, unit tests, build, and e2e gates pass.
