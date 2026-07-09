# AUDIT_REGISTER.md — M30 Cleanup Audit, Pass 3

> Redundancy and Dead-Code Pass, gated on `PROTECTED_REGISTER.md` (Pass 0) per `AUDIT_METHODOLOGY.md` §2 Pass 3. Every exported function/type/component in the 7 required hotspot files is reviewed below: caller counts via `rg`, classification (live API / test-only helper / historical compatibility / duplicate / unused), and an action label (`Delete` / `Merge` / `Archive/Relabel` / `Keep — Protected`). Every candidate was checked against `PROTECTED_REGISTER.md` before any `Delete`/`Merge` label; matches are cited by D-number and not re-analyzed. Every `Delete` candidate was additionally run through the Pass 3 non-import reference checklist (Next.js file-convention routes, `package.json` scripts, hash-keyed fixtures, Drizzle snapshots, `render.yaml`/CI) before being finalized.

**Headline finding:** this codebase is unusually clean. Across 94 exported symbols in the 7 largest files in the repo, exactly **one** function has zero callers anywhere (`listRuns`). Every other low-caller-count export resolved to one of two healthy patterns on inspection: (a) a narrowly-scoped but genuinely live single-call-site function, or (b) an exported type/constant consumed only *structurally* (object literals, return-value shape, or a selector function) rather than by name import — not dead code, just correctly encapsulated. Caller counts below exclude the defining file itself; counts include test-file references (`vi.mock`/`vi.fn` sites), which is why some legitimately-narrow exports show 2 rather than 1.

---

## 1. `src/db/repositories/runner.ts` (1,013 lines, 43 exports)

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `DebugFailureInjection` | interface | 2 | Live API — internal param type | Keep — Protected (D-027/D-029) | TS shape of the protected `debug_failure_injection_json` column (`PROTECTED_REGISTER.md` row 36, REVIEW confidence); consumed as `CreateRunInput.debugFailureInjection` |
| `CreateRunInput` | interface | 0 | Live API — internal param type | Keep | Parameter type of `createRun`; callers pass structurally-typed object literals, no import needed |
| `ProviderCapability` | interface | 0 | Live API — internal param type | Keep | Used by `createRun`'s planning logic; same structural-typing pattern |
| `JobNoLongerRunningError` | class | 2 | Live API | Keep | Thrown/caught in `src/worker/index.ts`'s stale-lock handling |
| `createRun` | function | 85 | Live API, central | Keep | Core run-creation path; called from `modules/runner/actions.ts`, scripts, and extensively tested |
| `getRun` | function | 90 | Live API, central | Keep | Most widely used accessor in the file — report routes, worker, actions, dashboard |
| `listRuns` | function | **0** | **Unused** | **Delete** | See §6 below — full non-import checklist result |
| `listRunsWithProgress` | function | 2 | Live API | Keep | Powers `/projects/[id]/runs` (D-048); one call site (`runs/page.tsx`) is expected and correct |
| `getRunProgress` | function | 6 | Live API | Keep | Run-progress polling |
| `listRunEvents` | function | 17 | Live API | Keep | `run_events` tail, Debug view, tests |
| `appendRunEvent` | function | 35 | Live API, central | Keep | Every breaker/cap/config/operator-action event path (D-058); heaviest non-`getRun`/`createRun` caller count in the file |
| `hasRunEvent` | function | 2 | Live API — narrow | Keep | One real call site (`modules/extraction/service.ts`, C-12 SSR-scored dedup check) |
| `claimJobs` | function | 18 | Live API | Keep | Worker's `FOR UPDATE SKIP LOCKED` claim path — also the D-073-hazard function (destructive across all runs if called against a shared DB, now moot per D-078's test-DB isolation) |
| `reclaimStaleLocks` | function | 3 | Live API | Keep | Worker restart-safety path |
| `recordSuccess` | function | 23 | Live API | Keep | Post-generation persistence path (D-049's split-failure-domain fix lives here) |
| `recordCancelledProviderResult` | function | 5 | Live API | Keep | Cancel-mid-flight path |
| `recordRetry` | function | 2 | Live API — narrow | Keep | One real call site (`worker/index.ts`'s `handleFailure`) |
| `recordDeadLetter` | function | 8 | Live API | Keep | Dead-letter path, AD-2 |
| `requeueJob` | function | 10 | Live API | Keep | Debug requeue action |
| `isRunFinished` | function | 6 | Live API | Keep | D-045's ordering-bug fix site (finished-check before breaker) |
| `completeRun` | function | 6 | Live API | Keep | Terminal-state transition |
| `pauseRun` | function | 24 | Live API | Keep | Manual + programmatic pause path; D-058's `operator_paused` event now logs at the call site, not here |
| `pauseRunForWorkerConfigError` | function | 2 | Live API — narrow | Keep | One real call site (`worker/index.ts`, credential/config-error pause) |
| `pauseRunBeforeProviderSpend` | function | 6 | Live API | Keep | D-072's pre-spend budget guard |
| `resumeRun` | function | 12 | Live API | Keep | D-072 finding 2 fix site (`>=` cap/budget re-check on resume) |
| `cancelRun` | function | 14 | Live API | Keep | Manual + programmatic cancel path |
| `getRunFailureCounts` | function | 16 | Live API | Keep | RN-7 breaker input |
| `getBreakerCounts` | function | 4 | Live API | Keep | Provider-down-aware breaker counts (D-042) |
| `getProviderOutcomeCounts` | function | 3 | Live API | Keep | `modules/runner/degradation.ts`'s provider-down detection |
| `skipRemainingJobsForProvider` | function | 2 | Live API — narrow | Keep | One real call site (`degradation.ts`) |
| `getApprovedMatrixCellCount` | function | 2 | Live API — narrow | Keep | One real call site (`modules/runner/actions.ts`, cost projection) |
| `getRunMatrixCellCount` | function | 2 | Live API — narrow | Keep | One real call site (`worker/index.ts`, C-1 cap re-check) |
| `pauseActiveRunsExceedingCellCap` | function | 2 | Live API — narrow | Keep | One real call site (`worker/index.ts` tick loop) |
| `getAverageCellTextLength` | function | 2 | Live API — narrow | Keep | One real call site (`modules/runner/actions.ts`, D-039 cost projection) |
| `getApprovedVersionForRun` | function | 7 | Live API | Keep | Run-creation default-version resolution |
| `getMatrixVersionForRun` | function | 5 | Live API | Keep | Run-creation explicit-version resolution |
| `getRunMatrixKind` | function | 51 | Live API, central | Keep | The D-068 C-12 wall's core primitive — every report/export/worker/scoring call site that must branch on audit-vs-resonance calls this |
| `getRunDetail` | function | 5 | Live API | Keep | Run page + WORKER OFFLINE banner (D-073) data source |
| `listActiveRunIds` | function | 3 | Live API | Keep | Worker heartbeat/tick loop |
| `getProviderSpendToday` | function | 23 | Live API | Keep | C-2 daily-budget enforcement (D-044's attribution-split fix lives here) |
| `getProjectStatus` | function | 2 | Live API — narrow | Keep | One real call site (`modules/runner/actions.ts`) |
| `getProjectSummary` | function | 14 | Live API | Keep | Project-header data across many pages |
| `getProjectPipelineState` | function | 2 | Live API — narrow | Keep | One real call site (`app/projects/[id]/layout.tsx`) — the OX-2 next-action banner input (D-059/D-071) |

**runner.ts summary:** 42 Keep, 1 Delete (`listRuns`), 0 Merge, 0 Archive.

---

## 2. `src/db/repositories/resonance.ts` (814 lines, 19 exports)

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `ResonanceStudyPatch` | interface | 0 | Live API — internal param type | Keep — Protected (D-078) | `PROTECTED_REGISTER.md` row 19: the `genericUnconditioned` field on this exact type is deliberately kept dormant-but-present for historical-fixture test patterns |
| `ResonanceEvidenceResponse` | interface | 0 | Live API — internal composed type | Keep | Nested inside `ResonanceVariantResult`/`ResonancePersonaResult`; structural consumption only |
| `ResonanceVariantResult` | interface | 0 | Live API — internal composed type | Keep | Array element of `ResonanceProviderGroup.variants` |
| `ResonancePersonaResult` | interface | 0 | Live API — internal composed type | Keep | Array element of `ResonanceProviderGroup.personaRows` |
| `ResonanceDeltaResult` | interface | 0 | Live API — internal composed type | Keep | Array element of `ResonanceProviderGroup.deltas` |
| `ResonanceProviderGroup` | interface | 3 | Live API | Keep | D-080's per-engine grouping shape |
| `ResonanceStudyResults` | interface | 2 | Live API | Keep | `getResonanceStudyResults`'s return type, consumed by the results page and report service |
| `getResonanceStudyExportLabel` | function | 19 | Live API | Keep | Backs `resonanceExportLabel` (`PROTECTED_REGISTER.md` row 18, GENERIC historical rendering) |
| `listResonanceStudies` | function | 5 | Live API | Keep | Studies list page |
| `getResonanceStudyResults` | function | 11 | Live API, central | Keep | Results page, report service, CSV export — the D-080 composite-key reader |
| `createResonanceStudy` | function | 19 | Live API | Keep | Study-builder entry point |
| `createResonanceStudyFromTemplate` | function | 6 | Live API | Keep | M20 value-add pack instantiation |
| `updateResonanceStudy` | function | 10 | Live API | Keep | Wizard step 1-3 saves (D-075) |
| `addResonanceStimulus` | function | 24 | Live API | Keep | Wizard step 3 |
| `updateResonanceStimulus` | function | 7 | Live API | Keep | Wizard step 3 edit |
| `deleteResonanceStimulus` | function | 6 | Live API | Keep | Wizard step 3 delete; D-071's try/catch fix site |
| `getResonanceStudyAnchorSetVersion` | function | 2 | Live API — narrow | Keep | One real call site (cost projection, D-066 pinned-anchor-set) |
| `listAuditEvidenceResponses` | function | 2 | Live API — narrow | Keep | One real call site (evidence picker in the study wizard) |
| `approveAndCompileResonanceStudy` | function | 20 | Live API, central | Keep | The C-4/C-13 approval guard — D-078's hard-rule fix and D-071's `draft`-state guard both live here |

**resonance.ts summary:** 19 Keep (5 of them explicitly cross-referenced to Protected Register entries), 0 Delete, 0 Merge, 0 Archive.

---

## 3. `src/db/repositories/metrics.ts` (636 lines, 4 exports)

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `EMITTED_METRIC_KEY_EXAMPLES` | const | 2 | **Test-only helper** | Keep | Sole consumer is `metrics-glossary.test.ts`'s SL-2 completeness test (every emitted metric key has a glossary entry) — this is the export's designed purpose, not orphaned scaffolding |
| `areMetricsStale` | function | 7 | Live API | Keep | D-074's dashboard self-heal staleness check |
| `recomputeMetrics` | function | 73 | Live API, central | Keep | The C-5 disposable-recompute entry point; highest caller count in this file by a wide margin (tests, actions, scripts, archive) |
| `listMetrics` | function | 26 | Live API | Keep | Dashboard/report/CSV read path |

**metrics.ts summary:** 3 Keep (live API) + 1 Keep (test-only helper, correctly scoped), 0 Delete, 0 Merge, 0 Archive.

---

## 4. `src/db/repositories/dashboard.ts` (584 lines, 12 exports)

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `listCompletedRuns` | function | 9 | Live API | Keep — Protected (D-072) | Its `{ includePaused?: boolean }` option and the `includePaused: false` default at the report run-selector is the exact "coherent split" `PROTECTED_REGISTER.md` row 42 protects — do not unify with the archive script's paused-inclusive path |
| `getRunForDashboard` | function | 9 | Live API | Keep | D-072 finding 1's `completed\|paused` state-gate fix site, matched by `getResponseDetail` below |
| `listCompletedResonanceRuns` | function | 5 | Live API | Keep — Protected (D-072, same pattern) | Resonance sibling of `listCompletedRuns`; same `includePaused` option, same protection reasoning applies |
| `getProjectBrandNames` | function | 9 | Live API | Keep | Brand-name resolution for chart labels |
| `getMisinformationRegister` | function | 15 | Live API | Keep | DB-1's sixth dashboard view |
| `reviewClaim` | function | 27 | Live API | Keep | SM-5 claim-review action (confirm/correct/re-open), `reviewed_at` write path (D-024) |
| `getCitedSources` | function | 9 | Live API | Keep | DB-1's cited-sources view |
| `getProjectPersonasAndMarkets` | function | 4 | Live API | Keep | Funnel heatmap axis labels (D-032) |
| `getResponsesForScope` | function | 9 | Live API | Keep | TP-4 drill-through, scope-filtered path |
| `getResponsesForMetric` | function | 6 | Live API | Keep | TP-4 drill-through, metric-scoped path |
| `getResponsesByIds` | function | 7 | Live API | Keep | TP-4 drill-through, explicit-id-list path |
| `getResponseDetail` | function | 9 | Live API | Keep — cross-reference D-072 | Was the D-072 finding-1 bug site (missing state gate, now matches `getRunForDashboard`) — not itself a Protected Register entry, but load-bearing enough that any future edit should re-run that fix's regression test |

**dashboard.ts summary:** 12 Keep (2 explicitly Protected via D-072), 0 Delete, 0 Merge, 0 Archive.

---

## 5. `src/core/report-templates.ts` (605 lines, 14 exports)

C-7 note: this file is pure (`src/core`) — confirmed no `db`/`providers`/`modules`/`app` imports; see `AUDIT_STRUCTURE_MAP.md` §1.

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `REPORT_SECTIONS` | const | 8 | Live API | Keep | RB-4's nine-section audit report structure |
| `SectionKey` | type | 2 | Live API | Keep | Derived from `REPORT_SECTIONS`, used in report state machine |
| `RESONANCE_REPORT_SECTIONS` | const | 8 | Live API | Keep | RR-3's three-section resonance report structure |
| `ResonanceSectionKey` | type | 2 | Live API | Keep | Derived type, same pattern as `SectionKey` |
| `AUDIT_CSV_DATASETS` | const | 0 | Live API — internal, selector-consumed | Keep | Consumed only through `csvDatasetsForKind()`, its documented "single source of truth" purpose (comment at line 47) — correct encapsulation, not dead |
| `RESONANCE_CSV_DATASETS` | const | 0 | Live API — internal, selector-consumed | Keep | Same pattern as `AUDIT_CSV_DATASETS` |
| `reportSectionsForKind` | function | 6 | Live API | Keep | D-068's "single source of truth for the kind -> section-list mapping," per its own doc comment |
| `csvDatasetsForKind` | function | 4 | Live API | Keep | Paired selector for CSV export routes |
| `ReportEvidenceExcerpt` | interface | 3 | Live API | Keep | `ReportContext.evidenceExcerpts` element type |
| `ReportContext` | interface | 6 | Live API | Keep | `generateSection`'s parameter type |
| `ResonanceProviderSection` | interface | 0 | Live API — internal composed type | Keep | `ResonanceReportContext.providerSections` array element (D-080); structural consumption only |
| `ResonanceReportContext` | interface | 4 | Live API | Keep | `generateResonanceSection`'s parameter type |
| `generateSection` | function | 24 | Live API, central | Keep | Audit report markdown generation (RB-1..RB-5), no LLM call by design (D-033) |
| `generateResonanceSection` | function | 10 | Live API, central | Keep | Resonance report markdown generation (RR-3) |

**report-templates.ts summary:** 14 Keep, 0 Delete, 0 Merge, 0 Archive. Three "0-caller" constants/types (`AUDIT_CSV_DATASETS`, `RESONANCE_CSV_DATASETS`, `ResonanceProviderSection`) all resolved to the same healthy pattern: correctly encapsulated behind a selector function or a parent type, not orphaned.

---

## 6. `src/worker/index.ts` (585 lines, 0 exports)

This file exports nothing — it is a Next.js/Node-style **non-import reference**: invoked exclusively via `package.json`'s `"worker": "tsx src/worker/index.ts"` script (the `pnpm worker` command) and, in combination, `scripts/dev-all.sh` (`pnpm dev:all`, D-073). Per the Pass 3 non-import checklist, this is exactly the "`package.json` scripts → `scripts/*.ts`" case generalized to the worker's own entrypoint — confirmed live via the script wiring, not by any `rg`-for-imports pass.

Internal (non-exported) structure, reviewed for completeness even though Pass 3's register is scoped to exports:

| Internal function | Called by | Dead? |
|---|---|---|
| `getRunConfig` | `processJob`, `afterJobFinished` | No |
| `afterJobFinished` | `processJob`'s success/failure paths | No |
| `processJob` | `tick` | No |
| `pauseIfSpendGuardAlreadyTripped` | `processJob` | No |
| `handleFailure` | `processJob`'s catch path | No |
| `tick` | `main`'s loop | No |
| `main` | Module-level invocation at file bottom | No (the actual entrypoint) |

No dead internal code found. A sibling test file (`src/worker/completion-at-cap.test.ts`) exercises worker behavior through the repository/DB layer rather than importing these internals directly, consistent with the file having zero exports by design.

**worker/index.ts summary:** 0 exports to classify; entrypoint confirmed live via `package.json` + `scripts/dev-all.sh`; 7 internal functions, all reachable from `main`, none dead.

---

## 7. `src/components/setup/setup-client.tsx` (721 lines, 2 exports)

| Export | Kind | Callers (excl. self) | Classification | Action | Notes |
|---|---|---|---|---|---|
| `SetupData` | interface | — (checked via component prop usage) | Live API | Keep | Prop type for `SetupClient`, populated server-side by `/projects/[id]/setup/page.tsx` |
| `SetupClient` | function (component) | 1 (the page) | Live API | Keep | Sole render target of `src/app/projects/[id]/setup/page.tsx` (M27, D-084) |

Internal (non-exported) helpers, both confirmed actively used, not dead:

| Internal | Call count within file | Dead? |
|---|---|---|
| `linesToList` | 8 | No — small string-to-array utility used across multiple of the six dossier sections |
| `SectionHeader` | 6 | No — one call per numbered section (Basics/Brands/Personas/Markets/Attributes/Fact sheet, D-084) |

**setup-client.tsx summary:** 2 Keep, 0 Delete, 0 Merge, 0 Archive. This file's structural characteristic — one large client component with only two tiny internal helpers factored out despite covering six distinct sections — is a Pass 4 structural-split candidate, not a Pass 3 dead-code finding. See `AUDIT_STRUCTURE_MAP.md` §3.

---

## 8. Full register summary

| File | Exports reviewed | Keep (live API) | Keep — Protected (explicit D-number cite) | Test-only helper | Delete | Merge | Archive |
|---|---|---|---|---|---|---|---|
| `runner.ts` | 43 | 42 | 1 (`DebugFailureInjection`) | 0 | 1 (`listRuns`) | 0 | 0 |
| `resonance.ts` | 19 | 19 | 1 (`ResonanceStudyPatch`) | 0 | 0 | 0 | 0 |
| `metrics.ts` | 4 | 3 | 0 | 1 (`EMITTED_METRIC_KEY_EXAMPLES`) | 0 | 0 | 0 |
| `dashboard.ts` | 12 | 12 | 2 (`listCompletedRuns`, `listCompletedResonanceRuns`) | 0 | 0 | 0 | 0 |
| `report-templates.ts` | 14 | 14 | 0 | 0 | 0 | 0 | 0 |
| `worker/index.ts` | 0 (entrypoint) | — | — | — | 0 | 0 | 0 |
| `setup-client.tsx` | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **94** | **92** | **4** (subset of the 92, not additional) | **1** (subset of the 92) | **1** | **0** | **0** |

No duplicate logic was found across any of the 7 files (the `Merge` label was never triggered) — the audit/resonance path pairs that look superficially similar (`listCompletedRuns`/`listCompletedResonanceRuns`, `generateSection`/`generateResonanceSection`, `getResponsesForScope`/`getResponsesForMetric`) are each deliberately parallel implementations preserving the C-12 wall, not accidental duplication (consistent with methodology §2 Pass 3's explicit instruction not to merge audit and resonance paths if doing so weakens C-12 separation).

---

## 9. `listRuns` — full non-import checklist (the one confirmed Delete)

Per methodology §2 Pass 3, before finalizing:

- [x] **Protected Register check** — no entry for `listRuns` in `PROTECTED_REGISTER.md` (checked full document).
- [x] **Next.js file-convention routes** — not applicable; `listRuns` is not itself a route file and no route file references it by name (confirmed: only `listRunsWithProgress` is imported by `app/projects/[id]/runs/page.tsx`).
- [x] **`package.json` scripts** — no script imports `runner.ts`'s `listRuns` (checked all 19 scripts' source files).
- [x] **Hash-keyed fixtures** — not applicable; `listRuns` is a DB query function, not fixture-selection logic.
- [x] **Drizzle `meta/*.json` snapshots** — not applicable.
- [x] **`render.yaml`/CI** — no reference.
- [x] **Literal-string safety net** — `grep -rn "listRuns("` across the entire repo (not just `src/`/`scripts/`, and without word-boundary anchoring) returns exactly one hit: its own definition line in `runner.ts`.

**Conclusion:** `listRuns` is superseded by `listRunsWithProgress` (added for D-048's runs-index page, which needed the same "list a project's runs" job plus per-run job-progress counts in one grouped query) and left in place afterward with no remaining caller. Confirmed `Delete`, pending the lead's approval in the later cleanup dispatch — this document does not delete it.
