# M34A production acceptance audit

Date: 2026-07-11  
Decision: D-102  
Scope: FE-1–FE-12, C-15, and `M34A_PRODUCTION_PLAN.md`

## Verdict

PASS. M34A is production-integrated as human-reviewed descriptive framing evidence. M34B remains deferred. No semantic eligibility, clustering, medoid, confidence-interval, independence, or automated-stability claim shipped.

## Requirement audit

| Requirement | Result | Production evidence |
|---|---|---|
| FE-1 | Pass | Five bare `representation-prompts.v4` templates are pinned and appended to consumer matrices; reports print their wording verbatim while headline surfaces show prompt spread. |
| FE-2 | Pass | Reviews retain immutable response text plus prompt/provider/model/mode/date provenance; accepted annotations require unique server-resolved literal offsets. |
| FE-3 | Pass with explicit boundary | Production framing uses the primary `neutral_elicited` lane only. Optional organic evidence is not admitted to this workflow, so it cannot be silently pooled. Forbidden bias-free/unbiased/vanilla language remains absent from client copy. |
| FE-4 | Pass | Blind packet selection is content-independent and exposes raw text without response id, prompt variant, provider, frequency, positioning, fact sheet, or Simulation candidate. |
| FE-5 | Pass | Codebook JSON/id/version and lock timestamp freeze before positioning/fact-sheet reveal; reveal order and digests are recorded. |
| FE-6 | Pass | Every denominator job gets a terminal review outcome; coded observations require accepted/rejected human decisions and literal spans; ambiguity/entity ambiguity/none/unavailable remain first-class. |
| FE-7 | Pass with conservative product boundary | Production v1 permits only `single_analyst` and reports it plainly. Intra-rater, machine-discrepancy, and inter-rater modes are unavailable until structured supporting records exist, preventing unsupported reliability claims. |
| FE-8 | Pass | Recurrence is descriptive n/N with complete job denominators, prompt spread, model/mode scope, and human-review status; no CI, respondent count, threshold, or independence claim. |
| FE-9 | Pass | Reinforced/missing/misframed/unsupported/non-actionable decisions are stored after reveal with rationale and optional snapshotted fact references; standalone report leads with the actionable gap. |
| FE-10 | Pass | Handoff snapshots codebook/review/reveal/recurrence/prompt/model provenance and the full verbatim response; low recurrence renders `SINGLE OBSERVED INSTANCE`; provenance appears across Simulation and exports. |
| FE-11 | Pass | Repository/RPC gates cover source existence, exact span, complete denominator, lock/reveal order, identity/method, version pins, hash/linkage, same project, body equality, and evidence ids. No semantic eligibility code exists. |
| FE-12 | Pass | Codebooks, reviews, spans, decisions, gaps, and snapshots are structurally project-scoped. No cross-project reuse or training path was added; M34B remains deferred behind the D-099 consent/governance conditions. |
| C-15 | Pass | Consumer measured-AI creation requires a reviewed snapshot and copies its full raw response; approval re-verifies hash/project/body/evidence linkage. Custom variants cannot bypass the measured baseline. B2B keeps C-13 evidence ids. Historical consumer records render `LEGACY BASELINE` or `PRE-M34 BASELINE`. |

## Verification evidence

- Existing database migration passed twice after the enum upgrade fix; fresh isolated migration also passed. Seed inserted missing rows once, then zero on repeat.
- Typecheck and lint clean.
- Vitest: 545 passed, 12 skipped; no failures.
- Golden extraction: 36 passed.
- Mock E2E: 500 jobs, 499 succeeded/1 intentional dead letter, retry and stale-lock recovery observed, no duplicate responses.
- Playwright smoke/axe/mobile drawer: 3 passed.
- Interactive browser at 1280px and 390px completed representation audit → blind lock/reveal → 25/25 review → gap/report/export route → immutable snapshot → consumer Simulation approval/run/results/generated report. Provenance rendered `SINGLE OBSERVED INSTANCE`, 1/25 responses, 1/5 prompts, model/mode, single analyst, codebook v1, and snapshot id. Browser console errors: none.

The interactive fixture used mock provider text and is UI verification only, not client evidence or a methodology validation dataset.
