> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M49 Resonance Message Lift implementation and acceptance · TRACKER: STATUS.md

# M49 — Resonance Message Lift Tests

## Outcome

Compare the Current message with one New message and measure the lift through either Buyer response or AI recommendation. Both types use the same transparent A/B workflow and retain the mandatory `SIMULATED` disclosure.

## Implementation phases

1. **Governance and schema**
   - Branch from post-M48 `main`.
   - Append D-119 and update active canon for Resonance-only branding.
   - Migration 0023 adds test type, frozen recommendation scenarios, and prompt protocol version.
2. **Protocols and processing**
   - Buyer response v3 and AI recommendation v1 render `CompiledPromptDisclosure`.
   - Enforce message-only parity, exactly two messages, one model, ungrounded mode, and k=5.
   - Dispatch Buyer response to response scoring and AI recommendation to deterministic parsing with no secondary provider.
3. **Metrics**
   - Compute model-separated, scenario-weighted inclusion, top-choice, reciprocal-rank, and lift metrics.
   - Seed scenario-cluster bootstrap intervals from run ID.
4. **Operator experience**
   - Message Lift library, test-type choice, Current/New messages, buyer profiles or auto-selected shopping situations.
   - Draft/Frozen Prompts view with representative and complete exact A/B pairs.
   - Plain-language type-specific results.
5. **Reports and evidence**
   - “How this was tested” report section with messages, parity, protocol, model, valid count, limitations, and representative prompts.
   - Evidence JSON includes complete exact provider requests, raw responses, extractions, and metrics.
6. **Compatibility and verification**
   - Preserve historical buyer-response/multi-message records and `/resonance` URLs.
   - Fresh/forward migration, lint, typecheck, docs, Vitest, build, mock E2E, Playwright, and interactive walkthrough.

## Stop lines

- No search-ranking, sales, ROI, or real-buyer prediction claims.
- No web search/grounding for Message Lift.
- No fuzzy or LLM brand matching.
- No retry or silent replacement of malformed recommendation output.
- No pooling AI models or combining test types.
- No compatibility-sensitive internal identifier migration.

## Acceptance

Complete on branch `m49`: migration and compatibility checks pass; both Message Lift types pass mock generation through results; lint, typecheck, governed-doc checks, 869 Vitest tests, production build, and all 18 Playwright journeys are green. The branch is ready for pull-request review.
