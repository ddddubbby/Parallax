> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M46 execution — trustworthy progress, balanced brand order, framing-batch persistence, stage-aware ETA, Simulation Persona clarity, live draw-floor enforcement · DISPOSITION: EXECUTED (merged to main via PR #7; trunk reconciles under M47/D-118)

# M46_BUILD_PLAN.md — Trustworthy Progress and Simulation Readiness

> Governing decision: D-117. Product contract: `PRD.md` §8.35. Earns a standalone file under D-090: multi-phase with per-phase acceptance, **migration** `0021`, multi-session worker + UI work, and a non-trivial test matrix.

## 1. Objective

Resolve six operator-trust issues without rewriting measurement semantics, metric formulas, prompt protocols, or historical rows:

1. Balance and freeze every tracked brand’s position in explicit comparison prompts; keep unbranded ranking prompts brand-free (PM-9).
2. Run framing extraction as a persistent worker batch with real progress across navigation, refresh, and worker restart.
3. Show one approximate run ETA plus separate generation and extraction/scoring lanes.
4. Provide relevant response previews and a full-response selection dialog.
5. Standardize Simulation UI terminology on “Persona.”
6. Treat 10-call configs as preview-only: live Simulation runs must reach the existing `n≥30` draw floor per framing and provider.

## 2. Design rulings (D-117)

### 2.1 Balanced, frozen brand order

- Comparison templates use a neutral `{brand_list}` containing the client and every active competitor exactly once (no client-first grammar).
- One shuffled base permutation per generated matrix; cyclically rotate across comparison cells so position counts per brand differ by at most one.
- Persist the full order in `prompt_cells.brand_order_json`; retain `competitor_order_json` for legacy provenance.
- Regenerating a comparison cell keeps its frozen order unless the active brand roster changed; adding a cell uses the next balanced rotation.
- Seeded and stored comparison templates (including price/promo variants) adopt the new grammar. Approved legacy matrices remain byte-frozen (C-4); newly generated or regenerated draft cells adopt M46 behavior.
- Discovery/consideration ranking prompts stay unbranded — do not inject brands (PM-9).

### 2.2 Persistent framing-extraction progress

- `buildFramingThemesAction` becomes an atomic enqueue returning a batch ID; reject duplicate active batches.
- Worker claims observation rows with `FOR UPDATE SKIP LOCKED`, processes individually, recovers stale locks, finalizes `completed` / `partial` / `failed`.
- Recheck C-2 before every live item; pause on budget exhaustion with Resume; failed-item retries create new observation versions (C-3).
- Study page polls persisted progress: accessible SVG ring, `processed/total`, valid/failed, approximate remaining time, queued/worker-offline/paused states. Continues across navigation, refresh, and worker restart.
- Refresh picker on terminal batch. Motion: existing 220ms tokens, actual percentage changes only, reduced-motion support — no decorative infinite animation.

### 2.3 Stage-aware run progress and ETA

- `RunDetail` gains generation completion vs planned jobs, audit extraction / Simulation scoring vs stored responses, overall pipeline completion vs planned calls, approximate remaining seconds + estimate state.
- A successful job is overall-complete only when its latest extraction/scoring row is terminal. Dead-lettered, cancelled, and skipped no-response jobs count directly. Preserve crypto-agent no-extraction path.
- ETA from EWMA of latest 20 effective completion intervals (`α=0.35`); seed sparse runs from compatible prior runs (same project, matrix kind, run mode, providers, modes). Exclude outliers above 3× rolling median. Suppress while paused, worker-offline, or before enough evidence.
- Display `About 8 min remaining` (not second-by-second). Labels: Audit — “Generating AI responses” / “Extracting evidence”; Simulation — “Generating simulated reactions” / “Scoring reactions.”
- Preserve last-known values during degraded polling; warn if a terminal run still has an extraction gap.

### 2.4 Simulation and baseline-picker clarity

- Response rows show exact framing-observation quote when available, else existing excerpt.
- “View full response” opens the existing Radix dialog (widened): provider/mode/model/date, original prompt, whitespace-preserved full response; “Choose as baseline” selects without bypassing Save or C-13/C-15 stamp.
- User-facing “Buyer type”/“Label” → “Persona”/“Persona name.” Keep `PanelPersona`, stored JSON, and `resonance-panel.v2` unchanged.
- Show Simulation math before approval and run creation: `personas × repetitions = draws per framing/provider`; `framings × personas × repetitions × providers = total calls`.
- Allow sub-30 mock and live-validation previews with a prominent directional warning.
- Block `live_audit` Simulation creation server-side when draws per framing/provider `< 30`. With protected `k=5`, a full live study needs ≥6 personas. Warn before approving a sub-six-persona frozen study (preview-only); never invent personas. Multiple providers never combine toward the floor.

## 3. Migration

**`0021_m46_progress_and_brand_order.sql`** (additive; say the word **migration**):

- `prompt_cells.brand_order_json` (nullable JSON array of brand names in prompt order).
- `framing_observation_batches`: project, lifecycle state, totals, timestamps, cost, pause/error metadata; uniqueness of one active batch per project.
- Nullable batch/lock fields on framing observations; queued/running observation states as needed for claim/finalize.

Legacy rows remain readable; no historical rewrite.

## 4. Interfaces

- `brandOrder: string[]` on matrix cell planning/persistence.
- `FramingObservationBatchProgress` + start/fetch/resume server-action contracts.
- `stageProgress` and `eta` on `RunDetail`.
- `drawsPerVariant`, `totalCalls`, `drawFloorMet` on run cost projection.
- Repository backstops for balanced-order persistence and the live Simulation draw floor (scripts cannot bypass UI validation).
- No external API, provider interface, metric formula, prompt protocol, or historical row rewrite.

## 5. Phases

| Phase | Scope | Acceptance |
|---|---|---|
| P0 | Governance: D-117; archive M44/M45 plans; prune merged notes; this plan; STATUS; PRD §8.35; MASTER_CONTEXT index | `pnpm docs:check` green |
| P1 | Migration 0021 + balanced frozen brand order (templates, generation/regeneration, persistence, seeds) | Unit/property tests: reproducible balancing, full membership, position spread ≤1, client not fixed first, approved cells frozen; migration tests for legacy nulls |
| P2 | Framing observation batches: enqueue action, worker claim/finalize, pause/resume, study-page progress ring | Worker tests: enqueue/claim/finalize, partial failure, stale-lock recovery, budget pause/resume, retry versioning, idempotency, restart persistence; UI progressbar ARIA + reduced motion |
| P3 | Stage-aware run progress + EWMA ETA on run detail | Progress tests: latest-extraction counting, audit/Simulation labels, EWMA, historical fallback, outlier filter, paused/offline suppression, completed-with-gap |
| P4 | Persona copy, Simulation math, preview warnings, live draw-floor block, full-response dialog | UI tests: persona copy, exact math, preview warnings, server rejection below floor, keyboard/dialog focus, full-response selection |
| P5 | Full gates + interactive Chrome verification | lint 0-warn, docs:check, typecheck, full Vitest, Playwright/axe, build; BUILD_NOTES evidence of framing batch, mock ETA/stages, full-response dialog, below-floor and floor-met Simulation configs |

## 6. Stop lines

- No metric-formula, provider-interface, or prompt-protocol rewrite beyond comparison `{brand_list}` grammar and brand-order persistence.
- PM-9: unbranded discovery/consideration ranking prompts stay brand-free.
- C-4: approved matrices and studies remain immutable; M46 changes future drafts/runs only.
- C-3: observation retries and re-extraction create new versions; never in-place mutation of raw responses.
- C-2: budget recheck before every live framing-batch item; pause + Resume, not silent spend.
- `n≥30` is a model-signal draw floor only — never human validation, purchase prediction, or external-validity proof (C-14).
- Do not invent or auto-generate personas to meet the floor.
- `site/**` and parked GEO agent surfaces untouched (D-116).
- Any schema change says the word **migration** and ships as one file (0021).

## 7. Assumptions

- Ten total calls from two framings × one persona × `k=5` yields five draws per framing/provider — below the internal floor even before the aggregate `n≥30` gate.
- Approved matrices and studies remain immutable; historical rendering stays truthful.
- No new dependency or visual token is required.

## 8. Merge

PR `m46` → `main` at phase-green boundaries (D-113). Archive this plan to `docs/history/` in the final merge commit and prune M46 `BUILD_NOTES` entries (D-025).
