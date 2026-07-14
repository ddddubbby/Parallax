> LIFECYCLE: ACTIVE · ROLE: PLAN · OWNS: M43 Resonance web UI refinement execution, route/state inventory, live-demo protocol, and acceptance · TRACKER: STATUS.md

# M43 — Resonance Web UI Refinement

## 1. Milestone contract

M43 refines the authenticated Resonance operator web product. It does not refine the public brand site and it does not change the GEO agent product.

The operator journey in scope starts at authentication and continues through projects, intake, setup, prompt matrices, runs, evidence dashboards, reports, Simulation studies, Framing Evidence, settings, and debug.

M34A behavior is frozen. M43 may improve presentation hierarchy, responsive layout, interaction feedback, accessibility, error handling, and visual consistency. M43 must not change measurement logic, schemas, APIs, provider behavior, cost calculations, reports or export payloads, methodology, or epistemic labels.

`DESIGN_GUIDELINES.md` is authoritative. The Apple design skill contributes immediate feedback, focus discipline, spatial consistency, restraint, and reduced-motion behavior only where those principles preserve the existing dossier identity, ink/paper surfaces, signal orange, reserved stamps, and silk-not-spring motion.

## 2. Isolation and integration

- Branch: `m43`.
- Integration branch: `geo-agent-v1`.
- Phase-green anchor before governance: `fba6d1f20c35e0775506bec21ecb25ab1b059b1b`.
- Shared governance commit applied before branch creation: `620148c`.
- Future milestone branches use `m<number>` and no tool, developer, operator, or product prefix.
- The M43 worktree, environment, database, ports, browser tab, and Playwright output are isolated.
- M35–M42 branches never merge into M43.
- M43 never merges into an individual M35–M42 branch.
- M43 merges into `geo-agent-v1`; `main` advances only after a separate release decision.
- New phase-green integration changes are considered only at phase boundaries.
- Application layout, global CSS, shared primitives, navigation, Settings, and test configuration are high-collision surfaces. Each lands in a surface-specific commit and is compared with the latest integration branch before merge.
- A required migration, server-contract change, agent-path change, measurement change, or methodology change stops that portion for operator review.

### Existing-work protection

Do not stage, alter, delete, or absorb:

- the operator's modified `BUILD_NOTES.md` on the original worktree;
- `site/index.html`, `site/motion.js`, or `site/styles.css`;
- `.claude/skills/**`;
- `.m35-evidence/**`;
- `skills-lock.json`;
- `.agents/**` other than `.agents/skills/apple-design/SKILL.md`.

## 3. Documentation and handoff model

- D-112 governs parallel product work and supersedes only D-107's repository-wide active-plan cardinality.
- This file owns M43 milestone definition, phase order, route/state scope, and acceptance.
- `STATUS.md` owns branch-local product, branch, milestone state, next action, and tracker.
- `BUILD_NOTES.md` owns concise session handoff and interactive-verification evidence.
- `DECISIONS.md` owns durable rationale; M43 does not restate existing decisions.
- Another branch's `STATUS.md`, commits, and pull request are authoritative for that branch. M43 never mirrors their live state.
- No second UI audit, component inventory, team dashboard, copied roadmap, per-team README, or process manual is created.
- Browser screenshots, recordings, Playwright reports, traces, generated pages, databases, caches, and preview artifacts remain untracked.
- Route/viewport/state verification is recorded as compact `BUILD_NOTES.md` evidence.
- Phase commits are used within M43; there are no per-screen branches.
- At merge, mark M43 complete, move this plan to `docs/history/`, prune M43 session notes, and reconcile `STATUS.md` to the integration branch in the merge commit.
- The active agent plan is never archived or rewritten by M43.

## 4. Ownership boundaries

### M43 owns

- Login and authenticated operator presentation.
- Projects, intake, setup, matrix, runs, dashboards, reports, Simulation studies, Framing Evidence, settings, and debug presentation.
- Shared UI primitives, navigation, dialogs, menus, tabs, loading/error states, responsive behavior, and operator-journey E2E coverage.

### Agent milestones own

- Agent core, gateway, commerce ledger, provider adapters, workers, agent APIs, schemas, migrations, reports, deployment, and agent tests.
- Adjacent cleanup in those areas is out of scope.

### Explicit exclusions

- `site/**` and all brand-site work.
- New features, routes, reports, charts, or measurement concepts.
- Database, migration, provider, metric, extraction, Simulation-scoring, cost, or methodology changes.
- Agent storefront, wallet, gateway, settlement, or deployment UI.
- New fonts, colors, icon families, animation libraries, chart libraries, state managers, form libraries, toast systems, or component systems.

## 5. Live browser demo

At the start of Phase 2:

1. In the isolated M43 worktree run `PLAYWRIGHT_PORT=3143 pnpm exec tsx scripts/playwright-webserver.ts`.
2. Wait for `http://127.0.0.1:3143/health`.
3. Open `http://127.0.0.1:3143/projects` in a dedicated in-app browser tab.
4. Keep the tab and server alive through the UI phases when practical.
5. Keep the browser on the surface currently being refined so hot reload exposes each change.

The harness must use a throwaway seeded Postgres database, disable authentication only for that disposable demo, use port 3143, start no worker, make no provider call, and permit no live spend. `pnpm dev:all` is forbidden for the visual demo. Run-progress views use only seeded or mock state.

At every phase-green checkpoint:

- Navigate all changed routes in the in-app browser.
- Exercise available default, hover/focus, pressed, pending, empty, warning, error, locked, and narrow states.
- Verify keyboard navigation, Escape behavior, focus trapping, and focus restoration.
- Inspect at 1280px desktop and 390px narrow.
- Enable reduced motion for the relevant motion check.
- Resolve any compile overlay or transient development error before calling the phase green.
- Leave the browser on the phase's most representative completed screen.

The browser supplements automated tests; it never replaces Playwright, axe, or manual evidence. Temporary browser output remains untracked. If hot reload becomes stale, restart the isolated server and reconnect the same URL. Stop the server and disposable database at milestone handoff.

## 6. Cross-product refinement rules

### Visual identity

- Preserve ink/paper surface assignments and the evidence-dossier identity.
- Preserve IBM Plex Mono, Inter, and Instrument Serif as the only fonts.
- Preserve signal orange for action, selection, and client brand only.
- Render reserved evidence states only through `Stamp`.
- Keep confidence intervals, sample counts, run modes, provenance, warnings, and methodological limitations visible.
- Remove duplicate hierarchy, weak spacing, inconsistent feedback, and accidental noise without replacing the aesthetic.
- Add no raw colors, one-off radii, ad-hoc durations, decorative gradients, glass, backdrop blur, glow, bounce, overshoot, or decorative motion.

### Typography

- Uppercase mono is limited to short labels and metadata.
- Body explanations remain sentence-case Inter.
- Interactive text is at least 12px.
- Values and table numerals remain tabular mono.
- Long evidence, methodology, warnings, and instructions are neither uppercase nor mono.
- Tracking and leading use shared tokens or classes, never component-local overrides.

### Interaction states

Every relevant control has a clear default, pointer hover, accent `focus-visible` ring, immediate pointer-down feedback, distinguishable disabled and pending states, size-stable action-specific pending copy, inline success, and inline error that preserves input. Keyboard and Escape behavior must match the control.

Use the shared 140ms token and restrained `scale(0.98)` only for buttons and pill controls. Data cards, rows, charts, and evidence surfaces use border/color feedback and never scale.

### Motion

- Use only established 140ms, 220ms, and 320ms tokens and easing.
- Menus/dialogs use opacity plus a 2–4px origin-consistent transform.
- The mobile drawer enters and exits at its actual edge.
- Animate only transform and opacity.
- Add no loop; the existing live-run pulse stops at terminal state.
- Reduced motion uses opacity-only transitions no longer than 100ms.
- Replace generic skeleton pulses with contextual dossier loading lines.

### Responsive layout

- At 1024px and above the desktop shell retains its 248px fixed sidebar.
- Below 1024px the sticky top bar and left drawer are used.
- Local tabs become a one-line horizontally scrollable rail on narrow screens.
- Forms stack before columns become cramped.
- Tables remain semantic and scroll inside labeled regions; the page never overflows.
- Verify 1440×900, 1280×800, 768×1024, and 390×844.
- At 390px primary actions, close controls, menu triggers, and icon-only controls have at least a 44px touch target.
- Content, dialogs, stamps, errors, and actions are never clipped.

### Shared UI interfaces

Permitted backward-compatible additions are:

- `Button.pending` and `Button.pendingLabel`;
- `InlineStatus` with neutral, success, warning, and danger variants and correct live-region semantics;
- contextual `PageLoading.label`;
- accessible `AppConfirmDialog`;
- accessibility/state props required by existing dialogs, menus, tabs, and evidence sheet.

Confirmation is required for permanent deletion, matrix or study approval, active-run cancellation, replacing an edited report section, locking a framing codebook, completing full-sample review, creating an immutable handoff, and discarding unsaved edits.

Confirmation is not used for normal saves, filters, clean tab changes, or reversible archive/unarchive. Native `beforeunload` remains for close/refresh with unsaved work.

## 7. Route and state acceptance inventory

Every surface below is reviewed in each state it can currently enter. A conforming screen is recorded as a verified no-op rather than rewritten.

### 7.1 Authentication and system states

Review root authentication routing, `/login`, contextual loading, global error, route error, not-found, recovery, retry, and redirects.

- Login remains an ink surface with a centered dossier form.
- Password input, pending submit, error, and retry are labeled.
- Redirects do not flash authenticated content or create a duplicate shell.
- Errors expose one primary recovery action and no internals or secrets.
- Focus moves to the recovery heading after route failure.
- Loading uses contextual dossier copy, never pulsing skeletons.

### 7.2 Operator shell

Review desktop sidebar, mobile top bar/drawer, project switcher, current project, current stage, next action, Setup/Execution/Results groups, global links, active state, sign-out, and dirty navigation.

- Project and section are distinguishable without color alone.
- Project switching preserves context, closes correctly, and restores focus.
- The mobile drawer traps focus, closes on Escape/overlay, restores trigger focus, and remains scrollable.
- Dirty navigation uses the shared confirmation.
- Sign-out has size-stable pending feedback and cannot submit twice.
- No nested route produces a duplicate shell.

### 7.3 Projects library — `/projects`

Review heading, new-project action, search, `All`/`Active`/`Draft` filters, count, table, states, dates, Resume/Open actions, row menu, empty library, no-match, loading, and failure.

- Result count and filter-specific emptiness are explicit.
- Project name is primary and metadata secondary.
- Resume/Open is permanently visible.
- Menus retain row context and restore focus.
- Narrow tables scroll internally.
- Empty library routes to creation; no-match offers clear filters.
- Dates use the dossier format.

### 7.4 New-project intake — `/projects/new`

Review all eight steps:

1. Basics: project/client name, archetype, category, buyer goal.
2. Client brand: name, domain, aliases, description.
3. Competitors: initial cards, name, domain, aliases, add/remove.
4. Fact sheet: type, statement, source note, source URL, add/remove.
5. Attributes: tags, 6–12 guidance, Enter/Add, removal.
6. Personas: title, company context, pain points, buying criteria, add/remove.
7. Markets: ordered tags, Enter/Add, removal.
8. Review: summaries, per-section Edit, completion.

Acceptance:

- Progress exposes current/completed/future states and remains usable on mobile.
- Step URLs remain resumable.
- Back preserves persisted data.
- Next validates only the current step and focuses its first invalid field.
- Input survives validation and server failure.
- Autosave uses exactly `SAVING…`, `SAVED HH:MM:SS`, or `SAVE FAILED — RETRY` after the existing 800ms delay.
- Add/remove moves focus logically.
- Review preserves entered order.
- Completion prevents duplicate creation and routes only after success.

### 7.5 Project hub — `/projects/[id]`

Review breadcrumb, title, stage, next action, Setup/Execution/Results groups, card status, Open/Resume actions, and blocked destinations.

- Exactly one next action is visually primary.
- Every card has a permanently visible action.
- Cards stack without clipped metadata or controls.
- Blocked destinations name the prerequisite and link to its resolution.

### 7.6 Setup workbench — `/projects/[id]/setup?view=`

Review:

- Basics: project name, category, archetype, buyer goal.
- Brands: client/competitors, edit, save/cancel, add, archive/unarchive, zero-competitor warning.
- Personas: title, context, pain points, buying criteria, add/archive.
- Markets: edit, add, archive, order.
- Attributes: edit, add/remove, historical-retag warning.
- Facts: statement, source note, source URL, add/archive.
- Unsaved signal, dirty navigation, and forward-only explanations.

Acceptance:

- Tabs are URL-backed.
- Read/edit states are unmistakable.
- Only one entity edits at a time; the first field receives focus.
- Pending/error status is row-specific.
- Cancel restores persisted values.
- Reversible archive/unarchive has no destructive confirmation.
- Permanent removal confirms the named item.
- Historical warnings remain visible.
- Section changes protect unsaved work.

### 7.7 Prompt matrix — `/projects/[id]/matrix?view=&v=`

Review Overview/Presence/Position/Perception; version selector; empty, draft, approved, stale, warning, and cap states; 50-cell counter; competitor and PM-9 warnings; generation; intent addition; approval; run configuration; Simulation coverage; pillar explainers; cells/metadata; edit/regenerate/remove; fixed-representation notice.

- Remove duplicate page/board hierarchy.
- Version and state remain visible.
- Capacity shows used and remaining cells before failure.
- Actions have independent pending/error states.
- Approval confirms immutability.
- Removal confirms the named target.
- Edit supports autofocus, Cancel, and dirty protection.
- Approved versions expose no edit affordance.
- C1/C4, PM-9, and representation behavior remain unchanged.

### 7.8 Runs library and configuration

For `/projects/[id]/runs`, review audit/Simulation grouping, study or matrix context, provider/mode, run ID, jobs, date, state, epistemic stamps, actions, and empty states.

For `/projects/[id]/runs/new`, review approved-input summary; mock/live-validation/live-audit choice; providers and generation modes; credential readiness; repetitions; cap; projected calls/cost/provider budgets; generation/extraction failure injection; live warning; start action.

- Mode appears first and dependent controls update without a layout jump.
- Projection states are exactly `LOADING`, `READY`, `UNAVAILABLE`, and `OVER CAP`.
- Missing credentials identify the resolution route.
- Advanced mock controls use an accessible disclosure.
- Start prevents duplicate submission without changing calculations.

For `/projects/[id]/runs/[runId]?view=`, review Overview, Events, Extraction, Metrics; worker state/pause reason; jobs/progress/cost; pause/resume/cancel; result destination; event log; extraction/dead letters; recompute; and 1.5-second polling.

- Progress exposes progressbar semantics.
- Polling failure retains last-known data and announces degraded/retry state.
- Recovery does not replay animation.
- Actions have independent pending states.
- Cancel confirms consequences.
- Terminal completion is announced once.
- Events and errors wrap or scroll locally.
- No decorative loop is added.

### 7.9 Evidence dashboard — `/projects/[id]/dashboard?view=`

Review shell, audit tabs, separate Simulation destination, report action, run selector, loading/failure/retry, no-runs, and missing-metrics states.

Presence reviews Mention Rate, Share of Voice, Average First Position, intent × persona funnel, competitive spectrum, and evidence access.

Position reviews Recommendation Rate, Comparative Win Rate, and head-to-head spectrum.

Perception reviews attributes, radar, attribute evidence, organic and solicited sentiment, and no-mention/insufficient-data states.

Proof reviews Citation Share, Accuracy Rate, cited sources, Misinformation Register, severity/verdict/type/review state, confirm/correct/reopen, fact context, and evidence.

Cross-pillar reviews Stability Index, repetitions, n≥30 limitation, and evidence action.

- A run switch marks the prior data stale while loading.
- Failure leaves the previous valid run visible and identified.
- Every figure retains value, n, CI, limitation, and evidence action.
- Insufficient samples never render a convincing fake chart.
- Charts preserve monochrome/client-accent rules.
- Every figure reaches raw evidence in no more than two clicks.
- Evidence drill-down is an accessible edge sheet with focus trap, close/restoration, loading/retry, list/detail/back.
- Misinformation edits retain input after failure.
- Audit and Simulation remain computationally and visually separate.

Simulation summary review includes approved-study summaries, engine, run metadata, top ΔPI, baseline, directional state, empty states, and full-results link. Every surface retains `SIMULATED`; engines are never pooled.

### 7.10 Reports

For `/projects/[id]/report?runId=&view=`, review audit/Simulation run switching, outline tabs, provenance and `SIMULATED`, stale warning, generation, preview, edited/regenerated state, edit/save/cancel/regenerate, export menu, Markdown, print/PDF, JSON, and CSV.

- Each run option identifies date, `AUDIT`/`SIM`, mode, and state.
- Switching preserves a valid matching section.
- Editing focuses the textarea and registers unsaved work.
- Save changes only the current section.
- Regeneration confirms replacing edited content.
- Unrelated tabs and exports remain available during section work.
- Export menu is keyboard-operable and restores focus.

For `/projects/[id]/report/print`, review title/run/date, Simulation provenance, stale warning, sections, tables, blockquotes, and page breaks. Print remains paper-only, chrome-free, unclipped, and payload-identical.

### 7.11 Simulation studies

For `/projects/[id]/resonance`, review title/`SIMULATED`, new-study dialog, blank/template creation, empty state, draft/approved cards, `GENERIC`, counts, matrix, latest run, provenance, Continue/Open. The dialog traps/restores focus, preserves failed input, shows selected mode, and prevents duplicate submission.

For `/projects/[id]/resonance/[studyId]?view=`, review:

- Overview: study/run states, persona/framing counts, matrix, provenance, and exactly one next action among Continue design, Configure run, Watch run, or View results.
- Design step 1: study name.
- Design step 2: buyer panel label, age, income, location, buying habits, add/remove.
- Design step 3: measured AI, corrected, repositioned, and custom framings; label/body; snapshot/audit evidence; add/save/delete.
- Design step 4: summary, readiness, and approval.
- Runs: approval prerequisite, configure action, rows/empty, state/mode/Simulation stamps.
- Results, one engine at a time: epistemic header, methodology, provenance, URL-backed engine selector, Ranking, Deltas, Segments, Excerpts, and report action.
- Evidence: engine, stimulus/persona filters, count/page, metadata, full raw text, mean PI/PMF, pagination, and empty filtered state.

Acceptance:

- Study fields save before advancement.
- Validation focuses the first incomplete field.
- Readiness names every blocker and step.
- Consumer immutable baseline stays verbatim and read-only.
- Framing pending state is item-specific.
- Delete and approval use confirmations.
- Approved definition is locked with no edit affordance.
- Results retain rank, label/type, draw-floor gate, mean PI, n, PMF, baseline, ΔPI, persona slice, directional state, and deterministic low/high excerpts.
- Engines remain URL-backed and are never pooled.
- Evidence filters preserve one another and reset pagination.
- Every evidence item retains `SIMULATED`.

### 7.12 Framing Evidence

For `/projects/[id]/framing`, review workflow explanation, `HUMAN REVIEWED`, eligible audits, ready count, run/date/prompt/job/mode metadata, start action, no-ready state, review library, reviewed denominator, protocol, method, and state.

For `/projects/[id]/framing/[studyId]`, review identity/state/protocol/report, denominator explanation, recurrence table, six stages, reviewed count, elapsed time, method, and unsaved signal.

Discovery reviews masking instructions/state, blind IDs, raw text, and outside-knowledge limitation.

Codebook reviews creator, association ID/label/definition, add/remove/save/cancel, draft/locked state, and permanent attestation.

Reveal reviews positioning/source disclosure, revealed-by, reviewer, method, reveal/start-review action, and already-revealed state.

Review covers every denominator row: variant/repetition/provider/model/mode, raw answer or unavailable state, outcome, association, decision, proposal source, exact quote, annotation add/remove, save/cancel, and complete review.

Gaps reviews actionable/no-actionable outcome; reinforced/missing/misframed/unsupported/non-actionable classification; target or association; rationale; fact reference; add/remove/save/cancel.

Handoff reviews source-mode eligibility, no-handoff state, actionable gap, accepted candidates, evidence quote, full verbatim baseline, existing snapshot, and immutable action.

Acceptance:

- Dirty/pending state is stage- or row-specific.
- Codebook lock, review completion, and immutable handoff require explicit confirmation.
- Unavailable rows remain in N.
- Gaps stay locked until denominator completion.
- No-actionable-gap remains valid.
- Only live audit evidence creates a handoff.
- The full response is never described as representative.

For `/projects/[id]/framing/[studyId]/report`, review Back, Markdown, JSON, print/PDF, cover/stamps, Decision summary, Descriptive recurrence, Positioning, Evidence excerpts, Method, prompts, and recommended next step. The report remains conservative, paper-only, complete, and methodology/export-payload identical.

### 7.13 Settings and debug

For `/settings?view=providers|defaults`, review provider credential explanation, provider table/status/last verified/last used, add dialog, provider/base URL/model/credential fields, verify, rotate, disable/enable, delete, notices, and errors.

- Stored secrets are never rendered.
- Validation focuses invalid fields.
- Pending state is row-specific.
- Deletion confirms the provider name.
- Status is announced without dimming the entire table.
- Narrow-screen access is preserved.

Review Defaults budget, worker, default provider, and explanatory readout. It remains read-only unless current behavior already supports editing.

For `/debug`, review ink-terminal jobs, events, dead letters, heartbeat, requeue/re-extract, loading, empty, pending, and failure. Long content wraps or scrolls locally, headings remain readable, actions expose errors, and no secret-bearing payload or decorative pulse is added.

## 8. Implementation phases

### Phase 0 — Shared governance

- Record D-112 and its supersession.
- Update parallel-work guidance and `docs:check`.
- Leave integration `STATUS.md` and `BUILD_NOTES.md` unchanged.
- Run `pnpm docs:check`.
- Commit once on `geo-agent-v1`.

Green evidence: commit `620148c`; documentation check passes; original dirty work is unchanged.

### Phase 1 — Activate M43

- Create branch `m43` and its isolated worktree.
- Add this plan, the branch-local PRD activation, branch-local `STATUS.md`, a concise `BUILD_NOTES.md` handoff, and the approved Apple skill file only.
- Run the baseline operator journey.
- Record observed failures in `BUILD_NOTES.md`; do not add an audit document.
- Commit activation independently.

### Phase 2 — Live demo and foundations

- Start the safe port-3143 demo and in-app browser tab.
- Refine primitives, forms, loading/error states, dialogs, menus, tabs, shell, project switcher, drawer, focus, motion, and unsaved navigation.
- Demonstrate desktop, mobile, keyboard, and reduced-motion behavior.
- Run focused component/shell tests, lint, typecheck, and browser checks.
- Commit at phase green.

### Phase 3 — Projects and setup

- Refine projects, all intake steps, project hub, and all setup views.
- Demonstrate creation, validation, autosave, dirty-state, and responsive flows.
- Run the create-project-to-setup journey.
- Commit at phase green.

### Phase 4 — Matrix and runs

- Refine matrix states/actions and run list/configuration/operation.
- Demonstrate draft, warning, approved, projection, progress, event, and degraded-polling states.
- Run matrix/run regressions.
- Commit at phase green.

### Phase 5 — Dashboard and reports

- Refine every dashboard pillar, evidence sheet, Simulation summary, report builder, and print output.
- Demonstrate two-click evidence, small-n behavior, report editing, and export controls.
- Run accessibility, responsive, report, and evidence tests.
- Commit at phase green.

### Phase 6 — Simulation and Framing Evidence

- Refine Simulation library/workspace/results/evidence.
- Refine every Framing Evidence stage, handoff, report, and export control.
- Demonstrate the complete seeded M34A journey.
- Verify C-12, C-13, C-15, B2B, and historical behavior.
- Commit at phase green.

### Phase 7 — Verification and handoff

- Incorporate only the latest phase-green `geo-agent-v1` changes.
- Resolve shared-surface changes without importing sibling implementation.
- Run all automated and interactive gates.
- Perform the final live browser walkthrough.
- Record route/viewport/state evidence.
- Close documentation and stop the isolated demo/database.

## 9. Compatibility contract

- Add, remove, or rename no route.
- Preserve `view`, `v`, `runId`, `matrixVersionId`, `engine`, `section`, `stimulus`, `persona`, and `page` query parameters.
- Change no API or action payload, database schema, extraction schema, metric type, report payload, export format, cost calculation, or methodology.
- Add no migration.
- Keep every internal UI addition backward-compatible.

## 10. Verification gates

Run:

- `pnpm docs:check`
- `pnpm lint --max-warnings 0`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:golden`
- `pnpm test:mock-e2e`
- `pnpm test:e2e`
- `pnpm build`

No live provider spend, wallet, gateway, deployment, or production database is required.

Playwright covers login failure/success; project search/filter/empty; intake validation/autosave/retry/resume/completion; hub navigation; setup save/cancel/archive/remove/dirty navigation; matrix views/edit/warning/cap/approval; Audit/Simulation run lists; configuration/projection/advanced mock/start; progress/polling recovery/cancel/events/extraction/metrics; dashboard tabs/run switch/small-n/evidence/misinformation; report generation/switch/edit/regenerate/export; Simulation creation/design/readiness/approval/results/evidence; Framing discovery/codebook/lock/reveal/review/gaps/handoff/report; Settings with safe test credentials; Debug success/failure; mobile drawer; narrow tabs/tables.

Run axe on representative states in every major route group. No critical or serious violation may remain. Verify keyboard navigation, accessible names, `aria-current`, `aria-busy`, live regions, progress semantics, dialogs, focus traps, and focus restoration.

At 1440×900, 1280×800, 768×1024, and 390×844 verify no page overflow, clipped content, clipped controls, fake or unreadable charts, unstable pending layouts, unusable 200% zoom, undersized critical touch targets, or incorrect reduced-motion behavior.

## 11. Completion gate

M43 is complete only when:

- every listed route and reachable state has a recorded review or verified no-op;
- all automated gates are green;
- the final interactive in-app browser walk is evidenced;
- no surface remains `code complete — unverified`;
- reserved epistemic stamps remain visible;
- no raw color, ad-hoc duration, skeleton pulse, glass, glow, gradient, bounce, or forbidden AI-default visual enters the diff;
- no schema, API, metric, methodology, cost, agent, or brand-site change enters the diff;
- documentation and repository-bloat controls are closed.

## 12. Fixed assumptions

- “Web product” means the authenticated Resonance operator app, never `site/**`.
- M43 advances in parallel with agent milestones.
- The branch name is exactly `m43`.
- Functionality is frozen at M34A.
- Refinement is subtle and evolutionary, never a redesign.
- Chrome desktop is primary; tablet and mobile must remain usable.
- The dossier design system overrides generic Apple aesthetics.
- The Apple skill is committed as exactly one repository file.
- The in-app browser contributes no repository files.
- The live demo uses port 3143, a disposable seeded database, demo-only disabled auth, and no worker.
- No migration, dependency, live spend, agent deployment, or production rollout belongs to M43.
