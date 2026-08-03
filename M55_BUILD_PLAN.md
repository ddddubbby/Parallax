> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M55 market-context prompt guardrail and acceptance · TRACKER: STATUS.md

# M55 — Market Context Prompt Guardrail

## Outcome

Every newly approved market-scoped audit prompt begins with the exact `market-context.v1` instruction. Existing approved matrices remain frozen and runnable; representation and Message Lift prompts remain market-neutral.

## Phases

1. Add pure render/recognize/strip/validate helpers and wrap ordinary audit rendering.
2. Upgrade copied drafts and enforce exact current-market context at action and repository approval boundaries.
3. Prove generation/add/regeneration, manual-edit rejection, direct-approval rejection, copied-legacy upgrade, archived/renamed labels, representation isolation, and legacy-run compatibility.

## Acceptance

- Every non-representation cell approved after M55 has a resolvable `marketId` and the exact current-market guardrail.
- Manual edits remain unrestricted until approval; approval fails with an actionable cell/count error when context is missing or altered.
- Existing approved prompt text and run eligibility are unchanged (C-4).
- No schema, provider, worker, extraction, metric, or report behavior changes.
- Focused tests, lint, typecheck, docs check, full Vitest, build, and mock e2e pass.
