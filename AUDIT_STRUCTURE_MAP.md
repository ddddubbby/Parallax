# AUDIT_STRUCTURE_MAP.md — M30 Cleanup Audit, Pass 4

> Boundary and Structure Pass per `AUDIT_METHODOLOGY.md` §2 Pass 4: C-7 boundary verification, review of the named architectural hotspots, and structural-split proposals for the Pass 3 hotspot files. Proposals are **named and reasoned, not executed** — every one is a pure-move-only recommendation for a later, separate PR per methodology §2 Pass 4's own rule ("file moves with zero logic edits in the same commit"). A split is proposed only where the resulting module would have a clear, stable domain owner — not as an arbitrary size cut.

---

## 1. C-7 boundary check: clean, no violations found

**Rule (C-7):** "Modules communicate only through the database and typed interfaces. The UI never imports providers. `/src/core` imports nothing from other project layers."

### 1a. `src/core` purity

```
grep -rlE "from [\"']@/(db|providers|modules|app)" src/core/     -> zero matches
grep -rnE "from [\"']\.\./(db|providers|modules|app)" src/core/  -> zero matches
```

Confirmed clean by direct search (both the `@/`-aliased and relative-path forms). `src/core/report-templates.ts` (one of the 7 hotspot files) was checked specifically: its only imports are `./findings`, `./md`, and `./semantic` — all sibling `src/core` modules. No violation.

### 1b. UI never imports providers

```
grep -rlE "from [\"']@/providers" src/app/ src/components/  -> zero matches
```

Confirmed clean by direct search, and additionally **lint-enforced**: `eslint.config.mjs` carries a `no-restricted-imports` rule scoped to `src/app/**/*.{ts,tsx}` and `src/components/**/*.{ts,tsx}` that errors on any `@/providers` import, with a message pointing authors at the correct pattern ("use a module action for metadata and `@/core/runner` for `ProviderId`/`GenerationMode` types"). This matches D-039's decision text ("C-7 'UI never imports providers' now lint-enforced") — verified still present and still wired to both directories.

**Conclusion: no C-7 violations found anywhere in the codebase.** Both halves of the constraint are enforced by construction (core has nothing to import from) and by tooling (the UI half is a lint error, not just a convention).

---

## 2. Named hotspot review

### 2a. Runner budget/provider resolution

Two-layer split, confirmed clean:

- **Repository layer** (`src/db/repositories/runner.ts`): raw queries — `getProviderSpendToday`, `getApprovedMatrixCellCount`, `getAverageCellTextLength`, etc. No provider-selection logic; purely data access.
- **Module layer** (`src/modules/runner/`): `budget.ts` (orchestrates spend-vs-cap checks), `provider-resolver.ts` (D-035 split — decrypts real credentials, only usable by the worker), `provider-ids.ts` (D-071 leaf module — `extractionProviderId`/`embeddingProviderId`/`secondaryProviderIdForKind`, explicitly commented as breaking a `budget.ts` ↔ `repositories/runner.ts` import cycle that previously existed), `degradation.ts` (provider-down detection, D-042).

`provider-ids.ts` is a well-formed leaf module: it imports only from `@/core/runner` (for `ProviderId`/`isProviderId`) and `process.env`, nothing else — confirmed via direct read. This is the correct shape for breaking the cycle its own comment describes, and matches the D-071 Decision Log account exactly. No boundary issue found; this hotspot is healthy.

### 2b. Extraction-to-resonance scoring handoff

`src/modules/extraction/service.ts` (342 lines) imports `scoreResponse, reScoreResponse` from `src/modules/resonance/scoring.ts` (283 lines) — the D-064/D-069 dispatch point where extraction routes a response to SSR scoring when its run's matrix `kind` is `resonance`. Both files import cleanly: `@/core/*` for pure logic (`ssr.ts`, `ssr-anchors.ts`, `worker-timing.ts`, `constants.ts`, `runner.ts`'s `validateDebugFailureInjection`, `intake.ts`'s `normalizePhrase`), `@/db/repositories/runner` for run/event access, `@/modules/runner/provider-resolver` and `@/modules/settings/crypto` for credential resolution, and `@/providers/*` for the actual generation/embedding/extraction calls. This is module-to-module and module-to-db traffic, which C-7 permits (only `src/core` and the UI carry import restrictions). No boundary violation. The handoff is a clean, single, well-named function pair (`scoreResponse`/`reScoreResponse`) rather than scattered kind-checks — a good pattern, not a hotspot risk.

### 2c. Report/export routes

The D-068 "shared UI plumbing" wall is intact: `reportSectionsForKind`/`csvDatasetsForKind` (`src/core/report-templates.ts`) are the single source of truth consumed by the in-app report page, the print route, and all three export routes (`markdown`, `json`, `csv/[dataset]`) — confirmed each of these five call sites imports the selector functions rather than re-deriving the kind-to-section/dataset mapping locally (verified via the caller lists in `AUDIT_REGISTER.md` §5). `getRunMatrixKind` (`runner.ts`, 51 callers) is the shared kind-resolution primitive underneath all of them. No duplicated kind-branching logic found outside these selectors.

### 2d. Dashboard drilldown paths

TP-4's "<=2 clicks to eligible raw responses" machinery is centralized in `dashboard.ts`'s three drilldown functions — `getResponsesForScope` (scope-filtered), `getResponsesForMetric` (metric-scoped, the D-062 word-boundary-`containsPhrase`-guarded attribute path lives here), and `getResponsesByIds` (explicit-id-list, e.g. cited-source domains) — plus `getResponseDetail` for the single-response case. All four share the same eligible-sample definition (D-014) rather than each reimplementing it. No duplication found; the three-mechanism split (scope/metric/id-list) is a deliberate, documented design (D-062's own account: "scope-filtered list... explicit response-id list... direct single-response" as the three drilldown mechanisms), not accidental sprawl.

### 2e. Setup archive-vs-active reads

The D-084 "two-reads trap" split is exactly as documented and confirmed structurally sound: `getMatrixInputs` (`src/db/repositories/matrix.ts`, not one of the 7 hotspot files but load-bearing to this review) filters `archived_at is null` and is the **only** generation-input read (feeding `generateMatrix`/`addCell`/`regenerateCell` and both PM-9 scan call sites); `getPersonaLabelsForProject`/`getMarketLabelsForProject` are archived-inclusive and feed only label-resolution call sites (matrix board display, `regenerateCell`'s own persona/market lookup). This is the exact split `PROTECTED_REGISTER.md` row 41 protects against being "corrected" back into one flag-threaded function. `src/db/repositories/setup.ts` (390 lines, not itself one of the 7 hotspot files) is a clean, uniform per-entity CRUD module (brand/persona/market/attribute/fact-claim, each with add/update/archive/unarchive following the identical pattern) — no structural issue found.

---

## 3. Structural split proposals (named, reasoned, not executed)

All seven Pass 3 hotspot files were reviewed for split candidates. Six have a clear-owner split available; `worker/index.ts` is deliberately given a narrower, lower-confidence recommendation because its current shape is the direct result of several hard-won correctness fixes (D-049, D-072) whose boundaries should not be disturbed casually.

### 3a. `src/components/setup/setup-client.tsx` (721 lines) — highest-confidence proposal

**Proposal:** Split into one presentational component per numbered dossier section, mirroring the six sections D-084 itself names: `src/components/setup/sections/basics.tsx`, `brands.tsx`, `personas.tsx`, `markets.tsx`, `attributes.tsx`, `fact-sheet.tsx`. `SetupClient` becomes a thin orchestrator that holds shared state (`useState`/`useTransition`) and renders the six section components in sequence, passing down the relevant slice of `SetupData` and the relevant server actions.

**Rationale:** This file already has the clearest possible owner boundary — the six sections are independently named in its own governing decision (D-084) and rendered via a repeated `SectionHeader` pattern (6 call sites, confirmed in `AUDIT_REGISTER.md` §7). It is the only one of the 7 hotspot files where the split boundary is already explicit in the product's own vocabulary rather than something this audit has to infer. `linesToList` (the one shared helper besides `SectionHeader`) would move to a small shared utility or stay in the orchestrator and be passed down/imported by each section file.

### 3b. `src/core/report-templates.ts` (605 lines) — second-highest confidence

**Proposal:** Split along the file's own existing internal seam into `src/core/report-templates-audit.ts` (the `REPORT_SECTIONS`/`SectionKey`/`AUDIT_CSV_DATASETS`/`ReportContext`/`generateSection` family) and `src/core/report-templates-resonance.ts` (the `RESONANCE_REPORT_SECTIONS`/`ResonanceSectionKey`/`RESONANCE_CSV_DATASETS`/`ResonanceReportContext`/`generateResonanceSection` family), with `reportSectionsForKind`/`csvDatasetsForKind` staying in a thin `report-templates.ts` that imports both and dispatches — preserving their "single source of truth" role.

**Rationale:** The file is already internally organized as two parallel, deliberately-never-merged families (audit vs. resonance) — the exact C-12 discipline the rest of the codebase expresses as separate files elsewhere (`resonance.ts` is its own repository file rather than folded into a general "results" file; the dashboard has separate `listCompletedRuns`/`listCompletedResonanceRuns`). A file split here would make that existing logical separation match the codebase's own established convention, giving each half a clear owner (whoever changes the audit report template set touches one file; whoever changes resonance report copy touches the other) without touching either family's behavior.

### 3c. `src/db/repositories/metrics.ts` (636 lines, only 4 exports) — different shape of problem, same fix direction

**Proposal:** The file's size is not from many unrelated exports (there are only 4) — it is concentrated almost entirely in one exported function, `recomputeMetrics` (lines 121-436, ~315 lines), plus one internal function, `recomputeResonanceMetrics` (lines 437-593, ~156 lines). The file already has the audit/resonance split as an internal function boundary; the proposal is to promote that existing boundary to a file boundary — `src/db/repositories/metrics-audit.ts` (the audit-kind metric-family computations currently inline in `recomputeMetrics`) and `src/db/repositories/metrics-resonance.ts` (the existing `recomputeResonanceMetrics`), with `metrics.ts` reduced to `recomputeMetrics`'s dispatch-on-kind logic, `areMetricsStale`, and `listMetrics`.

**Rationale:** Same C-12-shaped clear-owner boundary as 3b, and the split point is not a guess — it is the file's own existing internal function boundary, confirmed by direct inspection. This is the largest single function among all 7 hotspot files' internals and the one most likely to accumulate unrelated changes (a new audit metric family and a new resonance metric family are unrelated changes that currently must both touch the same 636-line file).

### 3d. `src/db/repositories/resonance.ts` (814 lines, 19 exports) — moderate confidence

**Proposal:** Split into `resonance-studies.ts` (study CRUD: `createResonanceStudy`, `createResonanceStudyFromTemplate`, `updateResonanceStudy`, `listResonanceStudies`, `getResonanceStudyExportLabel`, `getResonanceStudyAnchorSetVersion`, `approveAndCompileResonanceStudy`), `resonance-stimuli.ts` (`addResonanceStimulus`, `updateResonanceStimulus`, `deleteResonanceStimulus`, `listAuditEvidenceResponses`), and `resonance-results.ts` (`getResonanceStudyResults` and its full family of result/group interfaces).

**Rationale:** These three clusters map onto the study wizard's own steps (D-075: name/panel → stimuli → review-and-run) plus the separate read-side (results page). Moderate rather than high confidence because, unlike 3a/3b/3c, the boundary is this audit's inference from the export list rather than a boundary the product's own decisions already name explicitly — worth the lead's judgment on whether three files of ~270 lines each is actually easier to navigate than one 814-line file with clear internal comment banners.

### 3e. `src/db/repositories/dashboard.ts` (584 lines, 12 exports) — lower priority

**Proposal:** Could split into `dashboard-runs.ts` (`listCompletedRuns`, `getRunForDashboard`, `listCompletedResonanceRuns`), `dashboard-misinformation.ts` (`getMisinformationRegister`, `reviewClaim`), and `dashboard-drilldown.ts` (`getResponsesForScope`, `getResponsesForMetric`, `getResponsesByIds`, `getResponseDetail`, plus the supporting `getProjectBrandNames`/`getCitedSources`/`getProjectPersonasAndMarkets` lookups).

**Rationale:** Real clusters exist, but this file is the smallest of the DB-repository hotspots (584 lines) and its 12 exports are already fairly readable in one file with the DB-1 six-view structure as a mental map. Lower priority than 3b/3c/3d — flagged for completeness, not urged.

### 3f. `src/db/repositories/runner.ts` (1,013 lines, 43 exports) — largest file, most caution warranted

**Proposal:** The clearest internal clusters are job-claiming/worker-support (`claimJobs`, `reclaimStaleLocks`, `recordSuccess`, `recordCancelledProviderResult`, `recordRetry`, `recordDeadLetter`, `requeueJob`), lifecycle transitions (`pauseRun` and its variants, `resumeRun`, `cancelRun`, `completeRun`, `isRunFinished`), breaker/degradation counts (`getRunFailureCounts`, `getBreakerCounts`, `getProviderOutcomeCounts`, `skipRemainingJobsForProvider`), and cap/budget queries (`getApprovedMatrixCellCount`, `getRunMatrixCellCount`, `pauseActiveRunsExceedingCellCap`, `getAverageCellTextLength`, `getProviderSpendToday`) — mirroring the module-layer split that already exists one layer up (`src/modules/runner/budget.ts`, `degradation.ts` already exist; their repository-layer counterparts do not).

**Rationale, and why this is lower-confidence than 3a-3c:** This is the largest and most heavily-cross-referenced file in the register (`getRun`: 90 callers, `getRunMatrixKind`: 51, `appendRunEvent`: 35) — any split risks a large, hard-to-review mechanical diff even at "pure move" discipline, and several of its functions are the exact sites of past subtle correctness bugs (D-045's finish-before-breaker ordering, D-049's failure-domain split, D-072's `>=`-vs-`<=` resume fix) where a careless re-export or barrel-file mistake during a move is exactly the kind of thing that reintroduces a silent regression. **Recommend this split only as pure-move commits with the full existing test suite green before and after each move, one cluster at a time — not as a single large restructure.** Given the size, this is the one hotspot file where "leave it as one file, well-commented" is a legitimate alternative the lead might reasonably prefer over the churn/risk tradeoff.

### 3g. `src/worker/index.ts` (585 lines, 0 exports) — narrowest proposal, lowest confidence

**Proposal (modest):** `processJob` (the largest internal function, handling provider-call resolution, generation, result recording, and error classification for one job) could be extracted to `src/worker/process-job.ts`, taking `pauseIfSpendGuardAlreadyTripped` and `handleFailure` with it as its direct helpers, leaving `main`/`tick`/`getRunConfig`/`afterJobFinished` as the orchestration loop in `index.ts`.

**Rationale for low confidence:** Unlike every other file in this section, `worker/index.ts`'s current single-file shape is not incidental growth — it is the file where D-049 (split provider-call vs. persistence failure domains into two distinct try/catch blocks) and D-072 (pre-provider-call spend guard ordering) were fixed specifically because failure domains inside this control flow had previously been miscategorized by proximity/refactoring. A structural split here carries real risk of the same mistake recurring if a future move accidentally merges two functions' error handling back into a shared `catch`. **This proposal is offered for completeness per the task's instruction to review this specific hotspot, not urged** — of all seven, this is the one where the current single-file shape most plausibly IS the correct shape, given its history.

---

## 4. Other large files noticed (outside the required 7, informational only)

The repo-wide non-test file size scan surfaced several more files over 300 lines that were not in scope for this pass's required coverage but may be worth the lead's awareness for a future structural pass: `src/components/intake/step-forms.tsx` (485), `src/modules/runner/actions.ts` (460), `src/app/projects/[id]/resonance/page.tsx` (454), `src/components/matrix/board.tsx` (449), `src/components/resonance/study-wizard.tsx` (443), `src/components/runner/run-creation-form.tsx` (404), `src/db/repositories/extraction.ts` (396), `src/db/repositories/setup.ts` (390), `src/db/repositories/matrix.ts` (381), `src/core/matrix.ts` (351), `src/modules/extraction/service.ts` (342), `src/modules/matrix/actions.ts` (335). None were analyzed in this pass — listed only so the register of "what's large in this repo" is complete if the lead wants to extend structural review beyond the methodology's named 7.

---

## 5. Summary

| Check | Result |
|---|---|
| C-7 `src/core` purity | Clean — zero violations, verified by direct search |
| C-7 UI-never-imports-providers | Clean — zero violations, verified by direct search AND lint-enforced |
| Runner budget/provider resolution | Clean — well-formed leaf-module split (`provider-ids.ts`, D-071) |
| Extraction-to-resonance scoring handoff | Clean — single well-named dispatch pair, no boundary issue |
| Report/export routes | Clean — D-068 selector functions are the sole source of truth, no duplicated kind-branching |
| Dashboard drilldown paths | Clean — three deliberate mechanisms, shared eligibility definition, no duplication |
| Setup archive-vs-active reads | Clean — D-084's split-read design confirmed structurally sound |
| Structural split proposals | 7 (one per hotspot file), confidence ranging high (`setup-client.tsx`, `report-templates.ts`, `metrics.ts`) to low (`worker/index.ts`) — all pure-move-only, none executed |

No C-7 boundary violations were found anywhere in the codebase.
