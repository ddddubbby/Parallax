> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M32 operator-workflow UI playbook (D-088) · DISPOSITION: EXECUTED (verification completed by M33, D-089/D-092/D-093)

# M32_BUILD_PLAN.md - Workflow UI Architecture

> **Status: implemented on `m32-workflow-ui`** (PRD M32: Done). M32 builds on M31's project workspace hierarchy. It replaces stacked navigation and all-sections-at-once work surfaces with a URL-addressable operator workflow. Read `MASTER_CONTEXT.md`, PRD section 8.31, `DEVELOPMENT_GUIDELINES.md` section A, `DESIGN_GUIDELINES.md`, and the M32 handoff entries in `BUILD_NOTES.md` for implementation history.
>
> **Ownership:** D-088 owns durable design decisions; PRD 8.31 owns product requirements and milestone status; `DEVELOPMENT_GUIDELINES.md` owns implementation rules; `BUILD_NOTES.md` owns session handoff state. This file owns only the ordered execution and QA playbook. If it conflicts with a canonical document, the canonical document wins. At M32 close, change this file's status header only; record progress in PRD/BUILD_NOTES and add a new Decision Log row only for a genuinely new durable decision. Never rewrite D-088.

## 0. Product decisions and constraints

Resonance is an operator workbench, not a linear wizard after intake. Operators must be able to move between prior and later project work, distinguish viewing from editing, and restore a location through refresh, deep links, and browser history.

- Use one persistent left sidebar for global navigation, project navigation, project switching, and the next action. Remove the root horizontal pill bar, project/Setup subnavs, and duplicated stage banner.
- Keep `/setup`, `/matrix`, and `/resonance` as separate routes. Mutable project inputs, frozen audit matrices, and simulation study definitions remain distinct (C-4).
- Keep audit and simulation data structurally walled. No Simulation surface may share an audit selector, chart, aggregate, or metric DTO (C-12).
- Persisted data is read-only by default. `Edit` opens local fields; `Save changes` persists; `Cancel` restores server data. Creation forms appear only after explicit Add actions.
- Use URL `view` parameters for local navigation. Invalid values fall back to each route's documented default.
- No migration, route-segment rename, metric computation change, or provider/security-policy change is in scope.

Implementation branch: `m32-workflow-ui`, based on `m31-workspace-hierarchy`. Do not stage existing untracked brand/site work.

## 1. Navigation foundation

### Layouts and shell

1. Move authenticated pages into route groups without changing URLs: a global shell for `/projects`, `/projects/new`, `/settings`, and `/debug`; a project shell for `/projects/[id]/**`. Keep login, health, print, and export endpoints outside the operator chrome where their current behavior requires it.
2. Make the root layout fonts/global CSS only. Render exactly one shell per authenticated route group.
3. Add a fixed desktop sidebar at about 248px. Below 1024px it becomes a focus-trapped drawer. At 1280px and above, content must not overlap or cause horizontal document overflow.
4. Add token-backed Radix `Dialog`, `DropdownMenu`, and `Tooltip` primitives plus `lucide-react`. Icon-only buttons need accessible names and tooltips.
5. Add a client navigation configuration plus pure typed URL-view parsers. Components consume parsed values rather than ad-hoc pathname checks.

### Project sidebar

```text
PROJECT SWITCHER
Project overview

SETUP
  Project inputs
  Prompt matrix
  Simulation studies

EXECUTION
  Runs

RESULTS
  Evidence dashboard
  Simulation results
  Reports

All projects
Settings
Debug
Account menu
```

- Project switching includes active and draft projects; a draft opens its resumable intake URL.
- Render project stage and one next action once in the sidebar. Remove the full-width `ProjectNextAction` banner.
- `Simulation studies` is definition/approval. `Simulation results` is the separately walled Dashboard view.
- Retire `Nav`, `ProjectSubnav`, and `SetupSubnav` only after the sidebar renders on every current route. Preserve existing route segments and links.

### Interaction rules

1. Text controls need associated labels and error descriptions; choice controls use `fieldset`/`legend`.
2. Add an unsaved-edit context. Sidebar/local navigation, browser refresh, and tab close prompt only for dirty explicit edit forms. Autosaved intake does not prompt.
3. Use one action vocabulary: `Open`, `Edit`, `Save changes`, `Cancel`, `Add <entity>`, `Archive`/`Restore`, `Rotate key`, `Approve`, `Configure run`, and `Start <mode> run`.

### Acceptance

- Every current project/global URL renders with one sidebar and correct active state.
- Keyboard users can open/close menus and dialogs using Enter/Escape and receive restored focus.
- Sidebar/local navigation and browser history preserve project and selected view.
- No URL changes or 404 regressions.

## 2. Projects, Settings, intake, Setup, and Matrix

### Projects and Settings

1. Convert Projects into a client table with name search and Active/Draft filtering. Each row has one primary `Open`/`Resume` action; Runs and Dashboard move to More.
2. Implement `/settings?view=providers|defaults`, defaulting to `providers`.
3. Replace the visible credential form with `Add provider` dialog. Credential More actions: Verify, Rotate key, Disable/Enable, Delete.
4. The rotate dialog locks the provider and accepts only replacement configuration. Existing secrets remain unavailable to the browser.
5. Mark Defaults deployment-managed and read-only; do not imply they are editable here.

### Intake and project inputs

1. Keep the vertical intake rail. Add `Save and exit` beside autosave state.
2. After `finishIntake`, navigate to `/projects/[id]/matrix`; the sidebar exposes Project inputs for correction.
3. Split `setup-client.tsx` into six components under `src/components/setup/sections/`.
4. Implement `/setup?view=basics|brands|personas|markets|attributes|facts`, defaulting to `basics`.
5. Each Setup view starts as a summary. `Edit project details` reveals Basics. Other rows use visible `Edit`; add forms render only after `Add competitor`, `Add persona`, `Add market`, `Add attribute`, or `Add fact claim`. Replace Attribute `Rename` with `Edit`.
6. Reuse current setup actions and archive rules. Do not change row IDs, historical-label reads, or active-only generation reads.

### Prompt matrix

1. Implement `/matrix?v=<matrixVersionId>&view=overview|presence|position|perception`, defaulting to `overview` while retaining `v` behavior.
2. Overview contains version selection, state/warnings, cell count, sample budget, Simulation coverage, and primary actions.
3. Pillar views render only their mapped intent groups and cells. Proof remains the current trust rail; do not invent a fifth editable section.
4. Replace version pills with a native selector and five add-intent controls with an `Add cell` menu.
5. Drafts keep visible `Edit`; Regenerate/Remove move to More. Approved matrices expose `Review project inputs`, `Create draft from V<n>`, and `Configure run`, never editable matrix fields.

### Acceptance

- Setup and Matrix deep links restore the selected section after refresh.
- Cancel restores server summaries; dirty navigation prompts before loss.
- Archived labels remain resolvable while generation remains active-row-only.
- Existing C-4 immutability tests remain green.

## 3. Runs and run configuration

### Provider readiness contract

Extend the existing runner provider-options DTO; server validation remains authoritative.

```ts
type CredentialState = "not_required" | "active" | "disabled" | "missing";

type ProviderOption = {
  id: ProviderId;
  displayName: string;
  supportsGrounded: boolean;
  supportsUngrounded: boolean;
  credentialState: CredentialState;
};

type SecondaryRequirement = {
  role: "extraction" | "embedding";
  providerId: ProviderId;
  credentialState: Exclude<CredentialState, "not_required">;
};
```

- The run page receives selected matrix/study metadata plus extraction readiness for audit or embedding readiness for Simulation.
- Missing/disabled live providers are disabled in the form and link to Settings. Credential, capability, cost-cap, and daily-budget checks stay server-side backstops.

### Run configuration and detail

1. Rename the page `Configure run` and show matrix/study, cell count, providers, mode, repetitions, projected cost, daily budget, and secondary-engine readiness before submission.
2. Move mock failure injection to an Advanced disclosure. It never renders for live modes.
3. Submit labels are dynamic: `Start mock run`, `Start live validation`, or `Start live audit`. Keep live-audit `k=5` locked.
4. Extend run-list rows with matrix version, selected providers, and selected modes. Resolve Simulation study names; retain short run IDs as secondary metadata.
5. Keep Audit runs and Simulation runs as separate groups.
6. Implement `/runs/[runId]?view=overview|events|extraction|metrics`. Overview contains state/cost/controls/next destination; Events only the log; Extraction and Metrics render only their relevant panels.
7. Completed Simulation runs return to the owning study Results view. Audit runs return to Evidence dashboard.

### Acceptance

- Missing credentials are visible before a paid attempt.
- Forged/stale UI input is still rejected server-side.
- Pause/resume/cancel, partial badges, and pause-reason events retain behavior.

## 4. Simulation study library and detail workspace

### Study library and detail route

1. Make `/resonance` a lightweight library only: study name, draft/approved state, persona/stimulus counts, latest run state, and `Continue`/`Open` action.
2. Replace inline blank/template cards with `New study` dialog offering Blank and Template. Creation redirects to `/resonance/[studyId]?view=design`.
3. Do not fetch or refresh every study's results on the library route. Keep `id="study-<id>"` library anchors so old hash links still land on the record.
4. Add `/resonance/[studyId]`, validating project ownership. Views:
   - `overview`: status, readiness, buyer-panel/framing summary, one next action.
   - `design`: draft-only vertical StudyWizard; approved studies render locked definition.
   - `runs`: study-only runs plus `Configure simulation run` when approved.
   - `results`: one engine and one results subsection at a time.
   - `evidence`: deduplicated, filterable, paginated response list.
5. Rename `Approve & simulate` to `Approve study`. Approval freezes/compiles; next action is `Configure simulation run`.

### Results and evidence contracts

1. Add `getResonanceStudyResultSummary(projectId, studyId, runId?)` for ranking, deltas, persona slices, and deterministic excerpts without raw-response arrays.
2. Add `listResonanceEvidencePage({ projectId, studyId, runId?, providerId?, stimulusId?, panelPersonaKey?, page, pageSize: 25 })`. Return every response once plus page metadata.
3. Results selects exactly one provider using `engine=<providerId>` and exposes vertical `ranking|deltas|segments|excerpts` subsections.
4. Evidence reuses the selected engine and supports optional stimulus/persona filters. It replaces duplicate variant/persona response panels.
5. Keep `SIMULATED`, `GENERIC`, and `DIRECTIONAL` stamps on every applicable view. New links target detail Results; no provider populations may be pooled.

### Acceptance

- Draft, approved/no-run, and completed multi-provider studies choose the right default view.
- Engine selection never combines metric/evidence rows across providers.
- Evidence filtering/pagination never duplicates a response.
- C-12/C-13 and historical GENERIC tests remain green.

## 5. Dashboard, Report, documentation, and verification

### Dashboard

1. Implement `/dashboard?view=overview|presence|position|perception|proof|simulation`.
2. Audit views load audit run options/DTOs only. Overview uses existing headline metrics and confidence rail; pillar views retain current drilldowns/charts/tables.
3. `view=simulation` loads approved-study summaries only and links to study detail Results. It has no audit selector, audit metric import, shared chart, or aggregate.
4. Update stage/next-action links to the exact Dashboard/study view now owning each result.

### Report

1. Implement `/report?runId=<runId>&view=<sectionKey>`, defaulting to Executive Summary.
2. Render one report section at a time with vertical outline and edited/stale status.
3. Extract print Markdown parsing/escaping to a shared server-side helper. The report page receives rendered HTML from that helper; do not introduce a divergent client parsing/trust policy.
4. Keep `Edit`, `Save changes`, and `Cancel`. Regenerating an edited section requires confirmation because it replaces that edit.
5. Replace the export-button wall with one Export menu grouped into Report, Evidence, and CSV downloads.

### Final verification and handoff

1. At M32 close, update the M32 tracker/progress notes, `BUILD_NOTES.md`, README, and this file's status header. Update `DESIGN_GUIDELINES.md` or `PROTECTED_REGISTER.md` only when implementation changes a current rule or protected-surface description. D-088 is already recorded and must not be rewritten; record a new Decision Log row only for a new durable decision.
2. Add tests for URL parsing, active navigation, dirty-state behavior, credential readiness, run labels, engine isolation, paginated evidence, report regeneration confirmation, and legacy hash compatibility.
3. Extend wall tests: audit Dashboard views never load Simulation scopes; Simulation views never load audit scopes.
4. Browser-walk: provider enablement -> intake -> inputs -> matrix -> run setup -> run detail -> Evidence dashboard -> Simulation study/run/results -> report/export.
5. Verify keyboard navigation, labels, focus rings, menu/dialog Escape behavior, deep-link refresh, browser history, and screenshots at 1280x720 and 1440x900.
6. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Stop active dev servers before `pnpm build`.

The expected final commit message is `M32: segment operator workflow UI (D-088)`.
