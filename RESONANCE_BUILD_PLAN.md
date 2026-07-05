# RESONANCE_BUILD_PLAN.md — M16–M20 Execution Playbook

> Step-by-step build plan for the Resonance expansion (funnel presentation layer + lower-funnel synthetic panel + value-add template packs). Written for execution by agentic coding sessions and human QA. **Assume no prior context beyond the canonical docs.** Read `MASTER_CONTEXT.md` fully first (constraints C-1..C-14, decisions D-063..D-065), then the milestone's PRD section (8.19–8.22), then this file's milestone chapter. `ENGINEERING_SPEC.md` owns schema/state contracts; this file owns the how and the traps.
>
> RULES FOR EXECUTORS: (1) Do not improvise architecture — every deviation from this plan must be logged as a Decision Log entry and approved by the operator first. (2) Every milestone ends with its QA gate fully executed and pasted into `BUILD_NOTES.md`. (3) When this plan says VERIFY, run the command and read the output; do not assume. (4) When a step conflicts with observed code, STOP, write the conflict into `BUILD_NOTES.md`, and ask the operator. (5) The words "simulated" and "measured" are load-bearing everywhere; never swap them.

---

## 0. Architecture in one page (read before any milestone)

**What exists (Parallax measurement engine, M0–M15):** intake → prompt matrix (`matrix_versions` + `prompt_cells`, approved versions frozen, ≤50 cells) → runs (`audit_runs`) → jobs → immutable `responses` → versioned `extractions` → disposable `metrics` → dashboard/report/exports. Worker polls jobs, enforces cost guards (C-1/C-2), extracts synchronously after each success, reconciles orphans. Mock provider is permanent and fixture-backed (C-9, D-016, D-022).

**What we add:** a second *kind* of pipeline flowing through the SAME tables and worker:

```
resonance_studies (1) ──< resonance_stimuli (2-3 per study)
        │  compile & approve (freezes)
        ▼
matrix_versions (kind='resonance') ──< prompt_cells (cell = panel-persona × stimulus,
        │                                intent='simulation', stimulus_id set,
        │                                persona_id/market_id NULL, panel_persona_key set)
        ▼
audit_runs → jobs → responses          (unchanged machinery, all cost guards apply)
        ▼
extractions (extracted_json.kind='ssr') (SSR scoring instead of brand extraction:
        │                               free text → embedding similarity vs anchor
        │                               sets → 5-point PMF; fixture-backed in mock;
        │                               schema_version stays INTEGER — D-066)
        ▼
metrics (scope resonance_variant / resonance_variant_persona / resonance_delta)
        ▼
lower-funnel dashboard + resonance report sections + exports (all SIMULATED-badged)
```

**The three laws that shape every step (C-12, C-13, C-14 in MASTER_CONTEXT §4):** simulated and measured data never mix and simulation surfaces always carry a SIMULATED badge; simulations are conditioned on measured audit evidence by default; simulation outputs are comparative only (rankings/deltas between stimuli), never absolute-intent promises or ROI predictions.

**Why reuse instead of parallel tables:** the worker, cost guards, breaker, budgets, run events, immutability, and mock discipline took ~10 milestones to harden. A parallel pipeline would re-earn every one of those bugs. The `kind` column + dispatch branches is the entire integration surface.

**SSR method (from the PyMC Labs paper, arXiv:2510.08338; reference impl `pymc-labs/semantic-similarity-rating`):** elicit a FREE-TEXT reaction (never a numeric rating — direct elicitation is the paper's failed baseline), embed it, compute cosine similarity to 5 anchor statements per anchor set, subtract the row-minimum similarity, normalize to a probability mass function over Likert 1–5, average PMFs across 4–6 anchor sets. Mean score = Σ pmf[i]·i. The min-subtraction step is mandatory — without it PMFs come out nearly flat because all anchor similarities are numerically close.

---

## M16 — Funnel presentation layer + Resonance identity

**Goal:** the product presents as Resonance with funnel-stage framing (Upper = Presence, Mid = Position + Perception, Proof as the trust rail, Lower = simulation placeholder), with zero data/metric changes. Pure presentation layer over the existing pillar system — the D-051 pattern again: no renames of intents, metric keys, pillar ids, or stored data.

### Steps

1. **Branch** `m16-funnel-identity`.
2. **Core mapping** — new file `src/core/funnel.ts`:
   - `export type FunnelStage = "upper" | "mid" | "lower"`.
   - `export const FUNNEL_STAGES: Record<FunnelStage, { label: string; question: string; pillarIds: PillarId[] }>` — upper: label "Upper Funnel — Awareness & Reach", question "Does AI put us in front of buyers?", pillars `[presence]`; mid: "Mid Funnel — Consideration & Education", "When buyers evaluate, does AI make our case?", pillars `[position, perception]`; lower: "Lower Funnel — Simulated Action (SIM)", "What would buyers do about it?", pillars `[]` (fed by resonance metrics from M18, not by audit pillars).
   - `export function funnelStageForPillar(p: PillarId): FunnelStage | null` — proof returns `null` (Proof is the trust rail spanning stages, per D-051's confidence-rail rule; it is NOT a funnel stage).
   - Unit test `src/core/funnel.test.ts`: every pillar id in `PILLARS` maps to a stage or null-for-proof; every stage's pillarIds exist in `PILLARS`; lower has no audit pillars.
3. **SimulatedBadge component** — `src/components/SimulatedBadge.tsx`, same visual family as the existing MOCK/VALIDATION-ONLY badges (find them: `grep -rn "VALIDATION-ONLY" src/components src/app`). Text: `SIMULATED`. Follow DESIGN_GUIDELINES badge rules; do NOT invent a new color — reuse the existing badge token treatment. Render-test it.
4. **UI naming** — product name in the app shell header/title becomes "Resonance"; keep "Parallax measurement engine" as secondary text where the layout has room. Locate via `grep -rn "Parallax" src/app src/components --include="*.tsx"`. Update page `<title>` metadata. Do NOT rename the repo, package name, or any code identifiers.
5. **Funnel grouping on surfaces** — dashboard and matrix pillar section headers (components from M13: `PillarSection`/`PillarChip`, find via `grep -rn "PillarSection" src`) gain a small funnel-stage chip (e.g. "UPPER FUNNEL") derived from `funnelStageForPillar`; Proof's section shows "TRUST RAIL" instead. Report chapter titles: prepend nothing — reports keep pillar naming (client-facing docs change in M19, deliberately).
6. **Subnav placeholder** — project subnav (from M13/OX-1) gains a "Resonance" item rendering a stub page `/projects/[id]/resonance` that explains the module and shows "available after M17" — so navigation shape is stable now. Stub carries the SimulatedBadge.
7. **Glossary** — add `funnel stage`, `simulated (SIM)` entries to `GLOSSARY_TERMS` (`grep -rn "GLOSSARY_TERMS" src/core`).

### QA gate (all must pass; paste outputs into BUILD_NOTES)

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` all exit 0.
- **Recompute invariance:** run `recomputeMetrics` on the demo run before and after this branch (via the dashboard recompute button or a script); row counts and values byte-identical — proves presentation-only.
- SSR-curl the dashboard and matrix pages of the demo project: assert strings "Upper Funnel", "Mid Funnel", "TRUST RAIL", "Resonance" present; assert zero occurrences of raw pillar ids leaking.
- Manual browser check: badges legible in both ink/paper surfaces; V-2 intact (orange remains the only accent — funnel chips must be structural/neutral, not colored).

### Critical-bug risks

| Risk | Trap | Defense |
|---|---|---|
| A well-meaning "rename" sweep touches metric keys or pillar ids | Renaming `presence` → `upper` anywhere in `src/core/semantic.ts` breaks glossary resolution and stored scope keys | Step 2 is ADDITIVE mapping only; grep-verify no diffs in `semantic.ts` metric/pillar constants |
| Funnel chips styled with pillar tints or a new accent | Violates D-055's tint-reservation and V-2 | Reuse badge tokens; DESIGN review in QA gate |
| Proof forced into a funnel stage | Misrepresents the trust rail; contradicts D-051 | `funnelStageForPillar('proof') === null` unit test |

---

## M17 — Resonance data layer + study builder + mock run end-to-end

**Goal:** an operator can define a study (panel personas + stimuli with audit-evidence conditioning), approve it (frozen, ≤50 cells), and complete a MOCK resonance run that stores raw responses — before any SSR scoring exists.

### Steps

1. **Branch** `m17-resonance-studies`. This milestone contains a **migration** (0008) — say so in the session plan.
2. **Migration `0008_resonance_studies.sql`** (additive-first, D-024 discipline):
   - `resonance_studies`: `id uuid pk`, `project_id` FK not null, `name text not null`, `state text not null default 'draft'` (`draft|approved|archived`), `construct text not null default 'purchase_intent'`, `anchor_set_version text not null`, `panel_personas_json jsonb not null`, `baseline_stimulus_id uuid null`, `conditioned boolean not null default true`, `approved_at timestamptz`, `created_at`, `updated_at`.
   - `resonance_stimuli`: `id uuid pk`, `study_id` FK not null, `label text not null`, `stimulus_kind text not null` (`measured_ai|corrected|repositioned|custom`), `body_md text not null`, `evidence_response_ids_json jsonb not null default '[]'`, `position int not null`, `created_at`. Unique `(study_id, position)`.
   - `matrix_versions`: add `kind text not null default 'audit'`, add `resonance_study_id uuid null` FK.
   - `ALTER TYPE "public"."intent" ADD VALUE 'simulation';` — REQUIRED: `intent` is a Postgres enum (`discovery|consideration|comparison|validation|objection`), not text; migration 0004 (`provider_down`) is the in-repo precedent. TRAP: Postgres forbids USING a just-added enum value in the transaction that adds it — 0008 must only add the value, never insert a `simulation` row (we don't; compile-time inserts happen at runtime, later).
   - `prompt_cells`: add `stimulus_id uuid null` FK, add `panel_persona_key text null`. RESOLVED (D-066, verified 2026-07-05): `persona_id`/`market_id` are ALREADY nullable in migration 0000 — no `DROP NOT NULL` needed; resonance cells simply leave them null. Keep the step-5 compile test asserting audit-path cell creation still sets both.
   - VERIFY: `pnpm db:migrate` applies clean on a copy of the dev DB AND on a fresh DB from zero (both paths, per additive-first rule). Update Drizzle schema files to match; migration file is canonical (C-6).
3. **Core types & validation** — TYPE RULE (D-068): do NOT widen `Intent`. `Intent` in `src/core/matrix.ts` keeps its exact five audit values and its name — every allocator/quota/PM-9/D-054-frame signature keeps typing on `Intent`, so `'simulation'` cannot enter those paths without an explicit cast (the type system is the wall). ADD `export type CellIntent = Intent | "simulation"` beside it; only cell parse/display code (Zod cell schemas, cell renderers, drill-through labels) types on `CellIntent`. Where a `CellIntent` must narrow to `Intent`, use one shared guard `isAuditIntent(i): i is Intent` — never inline casts. (Renaming `Intent` to `AuditIntent` is allowed later as a cosmetic follow-up; the protection is the union split, not the name.) The DB enum value comes from step 2's `ALTER TYPE`. Zod schema for `panel_personas_json` entries: `{ key: string, label: string, age: number, incomeBand: string, location: string, behavioralProfile: string }` (no gender/ethnicity fields — do not add them, C-14). PRECISION (D-066): only **age and income** are paper-validated conditioning axes; `location` and `behavioralProfile` are prompt context that improves role-play coherence but must never be presented as validated segmentation — any UI/report copy about persona axes says "age and income (validated), location and behavioral profile (context)".
4. **Anchor fixtures** — `fixtures/ssr/anchor-sets.json`: `{ version: "purchase_intent.v1", construct: "purchase_intent", calibrated: false, sets: [{ id: "set1", sentences: ["...1","...2","...3","...4","...5"] }, ...] }`. Target SIX sets (the paper's main setup); ≥4 is the hard floor. Start from the 4 generic OSS-skill sets (short, generic, domain-independent; sentences[i] maps to Likert i+1) and author 2 more in the same register. **`purchase_intent.v1` is UNCALIBRATED (D-066): the paper's anchor sets were hand-tuned against 57 real surveys; ours have no human benchmark. The `calibrated: false` flag must surface in the report method section and stays false until a real-panel or locked-benchmark validation exists (post-PoC).** Loader `src/core/ssr-anchors.ts` validates shape (exactly 5 sentences per set, ≥4 sets) and exports `loadAnchorSets(version)`. **Anchors are C-4-frozen artifacts: editing sentences requires a NEW version string; the loader must refuse unknown versions loudly.** Unit tests.
5. **Study compile service** — `src/modules/resonance/` (new module; obeys C-7 — no provider imports, talks through db + typed interfaces):
   - CRUD for studies/stimuli (draft state only; server actions with Zod validation).
   - `compileStudy(studyId)`: creates a `matrix_versions` row `kind='resonance'` + one `prompt_cells` row per (panel persona × stimulus): `intent='simulation'`, `resolved_text` = rendered elicitation prompt, `stimulus_id`, `panel_persona_key`, `persona_id/market_id` NULL, `variant_key` = stimulus position (`s1`,`s2`,`s3`), `competitor_order_json` = `[]`.
   - Elicitation prompt template (constant in `src/core/resonance-prompt.ts`, unit-tested): persona block ("You are a {age}-year-old {label} living in {location} with household income around {incomeBand}. {behavioralProfile}") + framing block ("You recently asked an AI assistant for advice in this category. Here is what you learned:" + stimulus body) + elicitation ("In a few sentences, share your honest reaction. Would you consider purchasing/visiting? Why or why not? Be specific about what appeals to you or concerns you."). NEVER instruct a numeric answer (C-14 family; the paper's DLR failure mode).
   - Approval: enforce C-1 (≤50 cells: personas × stimuli), freeze study + matrix version together (state machine mirrors matrix: draft→approved, approved rows immutable), require ≥2 stimuli, require every `measured_ai` stimulus to cite ≥1 `evidence_response_ids` from the SAME project's stored responses (C-13; validate the ids exist), stamp `anchor_set_version` from the current fixture version.
   - **Bypass list (critical):** compile/approve must NOT invoke: the PM-2 allocator, PM-9 `scanUnbrandedCells` (stimuli legitimately contain brand names — a PM-9 scan would hard-block the whole feature), archetype template filtering, or PM-8 competitor ordering. Direct construction only. Add a test asserting a study whose stimulus quotes competitor brand names approves cleanly.
6. **Run creation threading** — `createRun` currently takes a matrix version; VERIFY how it validates (read `src/modules/runner/actions.ts` + repo function). Resonance runs: allowed `run_mode` values `mock` and `live_validation`/`live_audit` with identical C-9 both-direction validation, k semantics unchanged (k=5 default; k=2 validation-labeled). **SINGLE-ENGINE RULE (D-067): a resonance run is exactly one provider × one mode.** Server-side in `createRun`: when the matrix kind is `resonance`, reject `selectedProviders.length !== 1 || selectedModes.length !== 1` with a clear message ("each model is a distinct synthetic population — run engines separately"); D-038 is the enforcement pattern. UI: the run form receives a `singleEngine` flag for resonance matrices and renders radio-style single-choice instead of multi-toggles. Test: multi-provider resonance creation rejected via direct action call (scripts bypass UI). Runs list/run detail pages must show a `SIM` badge when the run's matrix kind is resonance (join through matrix_versions). The run-creation UI for resonance lives on the study page ("Run this study" button) — reuse the existing run form component with the matrix preselected.
6b. **Shared-surface kind guards (P1 set from the 2026-07-05 pre-build review, D-068 — these land IN M17 because M17 is the first milestone that produces completed resonance runs; do not defer to M19):**
   - `listCompletedRuns` (`src/db/repositories/dashboard.ts`) currently selects by project+state only — it feeds the audit dashboard run selector (`src/modules/dashboard/actions.ts`) and the audit report page (`src/app/projects/[id]/report/page.tsx`). Add a `kind='audit'` filter (join `matrix_versions`) so audit surfaces never list a SIM run. Create the sibling `listCompletedResonanceRuns` now (used by M19; trivial while you're in the file).
   - `generateReportForRun` (`src/modules/report/actions.ts`) and every report export/print route (`export/markdown`, `export/json`, `export/csv`, `report/print` — all currently check only `run.projectId === id`): load the run's matrix kind and REJECT resonance runs with a clear error ("resonance runs get their own report in M19"). M19 replaces the rejection with kind-dispatch to the resonance templates. Without this, an audit-shaped report can be generated and exported against SSR data — a C-12 breach through the side door.
   - `getProjectPipelineState` (`src/db/repositories/runner.ts`) counts ALL matrix versions and ALL runs — a completed resonance run would flip `hasCompletedRun`/`hasApprovedMatrix` and misroute the OX-2 next-action banner. Make the existing booleans audit-kind-only (join kind); add `hasApprovedResonanceStudy`/`hasCompletedResonanceRun` booleans now for M19's banner step.
   - UI copy rule: where a surface is kind-aware and can show both kinds (runs index, run detail), say "run" with the SIM badge; audit-only surfaces may keep saying "audit run". The DB table stays `audit_runs` — renaming a live table is migration churn with zero behavior gain.
7. **Worker guard** — in `src/worker/index.ts` post-success extraction dispatch (and BOTH reconcile sweeps), branch on matrix kind: resonance responses must NOT flow into `extractResponse` (the brand extractor) — in M17 they get NO extraction (SSR arrives in M18). Implement as: `extractResponse` internally no-ops (returns a typed skip) for resonance responses, so all three call sites are covered by one guard at the service boundary, not three ad-hoc ifs. Log a `run_event` `resonance_extraction_deferred` once per run (not per response) to keep events readable.
8. **Mock fixtures** — extend `fixtures/mock-responses/` with a resonance archetype family: plausible free-text buyer reactions at 5 intensity levels × a few phrasings (≥10 fixtures), keyed by the existing D-016 stable hash (resolved_text, provider, rep_index) — no new keying mechanism. Manifest README updated.
9. **Study builder UI** — `/projects/[id]/resonance`: studies list + create; study detail: panel-persona editor (age/income validated axes + location/behavioral context fields per step 3's wording rule), stimuli editor with **evidence picker** (searchable list of the project's stored responses filtered to completed audit runs; selecting inserts the excerpt into `body_md` as a quoted block and records the response id into `evidence_response_ids_json`), approve button with cell-count preview, run button. **XSS RULE (D-068): evidence excerpts are MODEL-ORIGIN text (D-040 threat model). If the builder renders any markdown preview of `body_md` via `marked`/`dangerouslySetInnerHTML`, excerpts must pass through `src/core/md.ts` escaping at insertion time — the same discipline as report templates. A plain `<textarea>`/plain-text rendering needs no escaping. Decide once, write it in the component header comment.** Everything carries SimulatedBadge. Unconditioned studies (`conditioned=false`, operator must explicitly toggle) show a persistent "GENERIC — not evidence-conditioned" warning chip (C-13).

### QA gate

- `pnpm db:migrate` clean on fresh + existing DB; `pnpm db:seed` twice → no dupes (seed untouched but re-verify).
- Full suite + lint/typecheck/build green; **audit regression:** `pnpm test:mock-e2e` (the 500-job audit e2e) green — proves the kind column and worker guard broke nothing.
- New DB-backed test: create study (2 personas × 2 stimuli) → approve → mock run → run completes; assert 4 cells × k responses stored, zero `extractions` rows, zero `brand_mentions` rows.
- Approval rejections tested: 1 stimulus (reject), 51 cells (reject), measured_ai stimulus with no evidence ids (reject), evidence id from another project (reject).
- Manual browser: build a study on the demo project using the evidence picker against the demo mock audit run; approve; run mock; watch it complete on the existing run page with SIM badge.
- **Shared-surface wall checks (step 6b, all against the completed mock resonance run):** audit dashboard run selector does NOT list it; audit report page selector does NOT list it; `generateReportForRun` returns the rejection error for it; all four export/print routes return a 4xx/error for it (verify by direct HTTP fetch); the OX-2 next-action banner on a fresh project with ONLY a resonance run still says the audit path is incomplete (`hasCompletedRun` false).

### Critical-bug risks

| Risk | Trap | Defense |
|---|---|---|
| Resonance responses flow into the brand extractor | Live mode: paid garbage extractions + fake brand_mentions polluting nothing yet but wasting money; also D-042 provider-down miscounts | Guard at `extractResponse` boundary + test asserting zero extractions in M17 |
| PM-9 scan runs on resonance cells | Approval hard-blocks because stimuli quote brand names — feature dead on arrival (inverse of the D-046 Heytea incident) | Explicit bypass + the branded-stimulus approval test |
| `intent='simulation'` leaks into audit code paths | Frame filters (`metricIntentFilter`), allocator quotas, funnel heatmap would misbehave | Step 3's type wall: `Intent` stays the five audit values; cells parse as `CellIntent`; narrowing only via shared `isAuditIntent` guard — no inline casts. Audit recompute never sees resonance runs (M18 dispatch); heatmap queries are per-run |
| Audit dashboard/report selectors list a SIM run | `listCompletedRuns` filters project+state only — audit UI renders against SSR data the day the first resonance run completes | Step 6b kind filter + QA-gate selector checks |
| Audit report generated/exported for a resonance run | `generateReportForRun` + export/print routes check only `projectId` — audit-shaped report over simulation data, C-12 breach through the side door | Step 6b rejection (M19 swaps in dispatch) + QA-gate 4xx checks on all four routes |
| Next-action banner misroutes after a resonance run | `getProjectPipelineState` counts all versions/runs — a SIM run flips `hasCompletedRun` and the OX-2 banner declares the audit path done | Step 6b audit-kind-only booleans + QA-gate fresh-project check |
| Evidence-excerpt XSS in a builder markdown preview | Excerpts are model-origin (D-040 threat model); a `marked` preview without escaping is the report-XSS bug reborn in M17 | Step 9 rule: escape at insertion via `src/core/md.ts` if previewing as HTML; plain textarea exempt |
| Audit-path code stops setting persona/market (already-nullable columns make the DB silently accept it) | A sloppy future audit insert with null persona/market would corrupt allocation/frame semantics with no DB error | Compile tests assert audit-path cell creation still sets persona/market |
| `ALTER TYPE ... ADD VALUE` used in the same transaction | Postgres rejects USING a just-added enum value in the adding transaction — a 0008 that also inserted a `simulation` row would fail at migrate time | 0008 only adds the value; first `simulation` insert happens at runtime (compile service); fresh-DB + existing-DB migrate test in the QA gate |
| Evidence picker loads entire responses table | Slow page on big projects | Filter by project + completed runs, paginate, excerpt server-side |
| Stale-worker races during tests | A leftover dev worker picks up test-created queued runs and bills/mutates (S-025 gotcha) | `pkill -f "tsx.*worker"` before DB-backed test sessions; tests use mock-mode runs only |

---

## M18 — Embeddings, SSR scoring, resonance metrics

**Goal:** completed resonance runs produce SSR extraction rows and resonance metrics; mock runs are fixture-backed (deterministic, $0); live runs use a real embedding engine under full cost guards; the C-12 wall is test-enforced.

### Steps

1. **Branch** `m18-ssr-scoring`. No migration expected (extractions/metrics tables already fit; if VERIFY shows `extractions.cost_usd` missing — check migration 0003 — then a small additive migration adds it and the plan note must be logged).
2. **Embedding provider capability** — in `src/providers/types.ts` add a SEPARATE interface (do not widen `LLMProvider`):
   ```ts
   export interface EmbeddingProvider {
     providerId: string;
     embed(req: { texts: string[]; model?: string; signal?: AbortSignal }): Promise<{ vectors: number[][]; model: string; tokens: number; costUsd: number }>;
   }
   ```
   - `src/providers/openai/embeddings.ts`: OpenAI `POST /v1/embeddings`, default model `text-embedding-3-small` (the paper's model; VERIFY current name/pricing against official docs at implementation date, store pricing in provider config only — PV-6 discipline). Reuses `shared.ts` error classification + `AbortSignal.timeout` (D-039: every network call has a deadline).
   - `src/providers/mock/embeddings.ts`: deterministic pseudo-embeddings (SHA-256 of text → seeded PRNG → unit vector, 64-dim) — used ONLY by unit tests of plumbing; mock RUNS never call it (they're fixture-backed, step 4).
   - Resolver `resolveEmbeddingProvider()` in `src/modules/runner/provider-resolver.ts` (D-035 side): reads `EMBEDDING_PROVIDER` env (default `openai`), requires an active credential for it (Settings copy updated to say so, like the D-041 extraction-engine line). **DeepSeek has no embeddings endpoint (as of 2026-07-05; VERIFY) — do not point EMBEDDING_PROVIDER at deepseek.**
3. **SSR math core** — `src/core/ssr.ts`, pure functions, no I/O:
   - `cosineSimilarityMatrix(responses: number[][], anchors: number[][]): number[][]` using γ = (1 + cos)/2 rescale.
   - `similaritiesToPmf(sim: number[][], epsilon = 0): number[][]` — per row: subtract row-min, epsilon at argmin position, normalize; guard zero denominators.
   - `averagePmfsAcrossSets(perSet: number[][][]): number[][]`; `pmfMean(pmf: number[]): number` (Σ p_i·(i+1)).
   - **Golden tests** `src/core/ssr.test.ts`: hand-computed 2-response × 2-set fixture with exact expected PMFs (compute by hand in the test file with comments showing arithmetic); property tests: every PMF sums to 1 ± 1e-9, argmin gets probability 0 when epsilon=0, uniform similarities → uniform PMF. The min-subtraction and (1+cos)/2 rescale are the two most-botched details — the golden test must catch both (assert a case where skipping rescale/min-subtraction gives a DIFFERENT wrong value).
4. **SSR scoring service** — `src/modules/resonance/scoring.ts`:
   - `scoreResponse(responseId)`: creates the next-version `extractions` row per the existing versioning pattern (`extraction_version` increments; find the pattern in `src/modules/extraction/service.ts` and mirror it). ROW SHAPE (D-066 — `schema_version` is an INTEGER column, verified; a string like 'ssr-v1' will not insert): `schema_version=1` (the integer), `extraction_model=<embedding model or 'mock-fixture'>`, `extracted_json={ kind:'ssr', ssrVersion:'ssr-v1', anchorSetVersion, pmf:[..5], perSetPmfs, meanScore }`, `state='valid'` on success. SSR rows are discriminated by `extracted_json->>'kind' = 'ssr'`, never by schema_version. Embedding cost written to the extraction row's cost column; retry-once/dead-letter mirroring SM-2/SM-3 semantics.
   - Mock runs: fixture-backed (D-022 discipline — NO live embedding calls for mock, ever): `fixtures/ssr/fixture-pmfs.json` maps each M17 mock-response fixture id to a hand-authored plausible PMF (intensity-consistent: the "enthusiastic" fixture peaks at 5, the "dismissive" at 1–2). Loader errors loudly on an unmapped fixture.
   - Live runs: embed response text + anchor sentences (anchor embeddings computed once per (version, model) and cached in-process; cache keyed by both), compute per-set PMFs, average.
   - Anchor version comes from the STUDY row, not "current fixtures" — re-scoring an old study must reproduce old anchors or fail loudly (C-4-for-anchors; add test).
   - Wire into the worker dispatch + both reconcile sweeps where M17 deferred: resonance responses now get SSR scoring; the M17 no-op is replaced. Re-scoring path: reuse the existing re-extract action (AD-2) — it creates a new version; verify it routes resonance responses to SSR, not brand extraction.
5. **Cost guards (C-2, D-022/D-044 pattern — follow it exactly):**
   - `getProviderSpendToday(p)`: add SSR embedding spend when `p === embeddingProviderId()` (mirror how extraction spend attributes to `EXTRACTION_PROVIDER` — read `src/modules/runner/budget.ts` and copy the join shape).
   - Worker budget-check list for live resonance runs appends the embedding provider (mirror the D-044 extraction-engine append).
   - `projectRunCost` for resonance runs: generation estimate from real average resolved_text length (existing D-039 machinery) + per-response embedding estimate (response tokens ≈ generation max + anchor one-time cost) — embeddings are ~$0.02/1M tokens so this will be cents, but it must be nonzero and counted (a $0 line item is how the D-022 bug happened).
   - `createRun` preflight for live resonance runs: active credential for generation provider AND embedding provider (mirror D-044 preflight).
6. **Resonance metrics recompute** — dispatch at the top of `recomputeMetrics(runId)` in `src/db/repositories/metrics.ts`: look up the run's matrix `kind`; `resonance` → `recomputeResonanceMetrics(runId)`, else the existing audit path untouched. Resonance recompute (same delete-then-rebuild idempotent shape):
   - Eligibility: D-014 analog — latest extraction is `valid` (or qa_reviewed) with `extracted_json.kind='ssr'`; refusal concept N/A in v1.
   - Per stimulus (scope `resonance_variant`, scope_key = stimulus id): `pi_mean` (value = mean of per-response meanScores; metadata_json = `{ pmf: <averaged>, stimulusKind, label }`; ci_low/high NULL — D-023: no invented intervals; bootstrap is post-MVP), `n` = eligible response count.
   - Per stimulus × panel persona (scope `resonance_variant_persona`, key `<stimulusId>|<panelPersonaKey>`): same metric, always directional (n = k).
   - Delta rows (scope `resonance_delta`, key = stimulus id): `delta_pi_mean` = variant pi_mean − baseline pi_mean (baseline = `baseline_stimulus_id` or the `measured_ai` stimulus; if neither exists, position 1); metadata records baseline id. No delta row for the baseline itself.
   - n≥30 gate: variant-level metrics render numbers only at n≥30 (6 personas × k=5 = 30 exactly — the default study shape crosses the gate by design); below → "insufficient data" per DB-3 precedent; persona slices always carry the directional label.
7. **C-12 wall enforcement (the most important tests in the milestone):**
   - Test: audit run recompute emits ZERO `resonance_*` scoped rows; resonance recompute emits ONLY `resonance_*` scoped rows.
   - Test: a project with one audit run + one resonance run — recompute both; audit metric rows byte-identical to a pre-resonance snapshot (leakage = failure).
   - Test: dashboard audit queries (scorecard/SoV/heatmap) against the mixed project return no resonance data; runs index shows both with correct badges.
   - Grep-audit step (manual, logged in BUILD_NOTES): every query in `src/db/repositories/metrics.ts` and dashboard data loaders is either run-scoped (safe) or explicitly filtered by kind — list each cross-run query found and its disposition. Known cross-run queries to check: daily budget spend (MUST include resonance spend — it is real money, not a leak), archive, runs index.

### QA gate

- Full suite green including new golden SSR tests; `pnpm test:mock-e2e` (audit) green.
- DB-backed resonance e2e: M17's study → mock run → assert every response has exactly one `extracted_json.kind='ssr'` extraction with PMF summing to 1, metrics rows exist for every scope, recompute twice → byte-identical (C-5).
- Live-path unit tests with stubbed `EmbeddingProvider` (no network in CI, D-022 discipline): scoring produces versioned rows, cost recorded, budget attribution lands on the embedding provider, timeout propagates as retryable.
- Kill/restart during a mock resonance run (mirror MK-6): resumes, no duplicate extractions (unique `(response_id, extraction_version)` holds under reclaim).
- C-12 wall tests all green; grep-audit pasted into BUILD_NOTES.

### Critical-bug risks

| Risk | Trap | Defense |
|---|---|---|
| Flat/garbage PMFs from skipping min-subtraction or the (1+cos)/2 rescale | Silently plausible-looking uniform-ish output — worst kind of wrong | Hand-computed golden test that fails for both wrong variants |
| Anchor drift silently re-scores old studies | C-3 violation in spirit: numbers change under the operator | Anchor version pinned on the study; loader refuses unknown versions; test |
| Embedding spend invisible to guards | The exact D-022 bug, new coat | Budget attribution test + nonzero projection assertion |
| Mock run makes a live embedding call | $ spend in CI/demo; nondeterminism | Fixture-backed mock path with loud error on unmapped fixture; test asserts zero fetch in mock scoring |
| Wilson/CI applied to PMF means "for consistency" | Statistically invalid — D-023's exact lesson | ci columns NULL + test asserting null; report copy says point estimate |
| Double-scoring under worker reclaim | Duplicate extraction versions or unique-violation crash loop | Mirror the existing at-least-once handling around extraction versioning (read how `extractResponse` guards it; copy) |
| Reconcile sweeps re-route resonance rows to brand extractor | Sweeps predate the kind concept | Both sweep queries join matrix kind; test fabricates an orphaned resonance response and asserts SSR scoring picks it up |
| Multi-engine resonance run pools distinct synthetic populations | Resonance scopes have no provider dimension — two engines' PMFs would silently merge into one distribution, corrupting ΔPI comparability (the paper reports engines separately) | D-067 single-engine rule enforced in `createRun` (M17 step 6) + rejection test; if a legacy multi-engine resonance run somehow exists, recompute emits a loud `run_event` and skips it rather than pooling |

---

## M19 — Lower-funnel dashboard, resonance report, exports, $0 demo

**Goal:** results are visible, drillable, exportable, and demo-able — every surface SIMULATED-badged, every number traceable to raw text (C-3 discipline extended to simulations).

### Steps

1. **Branch** `m19-resonance-surfaces`. No migration.
2. **Lower-funnel dashboard** — `/projects/[id]/resonance/[studyId]` (or the study page's results tab once a run completes; keep routing consistent with existing run-selector patterns from the dashboard):
   - Variant ranking panel: per-stimulus averaged PMF as a 5-bar distribution (reuse chart wrapper conventions — `grep -rn "SoVChart" src/components` for the Recharts wrapping pattern; DESIGN tokens only, no new colors), mean PI, n, gate state.
   - ΔPI table: variant vs baseline per segment (panel persona), directional labels, sortable.
   - Drill-through (TP-4 pattern, ≤2 clicks): click any bar/cell → the exact eligible responses behind it, each showing free text + its PMF + persona + stimulus label. Reuse the metric drill-through machinery scoped to the resonance scopes.
   - Objection/theme panel: deterministic — per variant, the lowest-scoring and highest-scoring responses' excerpts by response-id order (D-061 pattern, no LLM summarizer, no randomness); operator reads themes out of excerpts.
   - SIMULATED badge on every panel; unconditioned studies additionally show the GENERIC chip (C-13).
3. **Report** — resonance runs get their own report sections (reuse `report_sections`, run-scoped, so C-12 holds structurally): section keys `resonance_method` (auto-generated: construct, anchor version AND its `calibrated` status — v1 says "uncalibrated anchor sets" plainly, embedding model, k, n per variant, D-023-style caveat that means are point estimates, the text-only-stimulus limitation note — the paper's image-stimulus setting performed mildly better, and the ΔPI framing sentence: "Likert-scale purchase-intent mean shift vs baseline, a survey construct — not predicted buying behavior" (D-066), C-14 language), `resonance_results` (ranking + delta table + per-segment notes), `resonance_evidence` (per-variant excerpts with response ids). Deterministic templates (D-033), model-origin text escaped via `src/core/md.ts` (D-040 — stimulus bodies and response excerpts are model/web-origin), regenerate/edit semantics identical to audit sections (RB-2/RB-3 tests extended). Forbidden-phrase test (RB-5 pattern) extended with C-14 phrases: "will increase sales", "predicted revenue", "guaranteed uplift", "ROI of" must fail; "simulated", "directional" disclaimers must pass.
4. **Exports** — resonance run exports join the existing set: markdown report, print-HTML, JSON evidence (responses + ssr extractions + metrics), CSV (`resonance_metrics.csv`, `resonance_responses.csv`) — CSV cells guarded (CWE-1236, D-045 helper; response free-text is model-origin). Archive script (`pnpm archive:evidence`) VERIFY: works on a resonance run id (it recomputes first per D-044 — confirm the recompute dispatch routes correctly from the script path too).
5. **Demo** — `pnpm demo:resonance` (idempotent, D-059 pattern): on the seeded demo project, create/approve a demo study (6 panel personas × 3 stimuli; measured_ai stimulus cites real demo-run response ids via the evidence flow), run mock, score from fixtures, recompute, generate report sections. Every page walkable at $0. Extend the M15 walkthrough doc/next-actions so the demo path is discoverable (OX-2 pattern: the project stage banner knows about resonance once an audit run completes — "Next: simulate buyer response").
6. **Runs index / project navigation** — runs list shows SIM rows distinctly; resonance study page links its runs; breadcrumbs consistent (`Projects / <name> / Resonance / <study>`).

### QA gate

- Full suite + audit mock e2e + resonance e2e green; lint/typecheck/build green.
- `pnpm demo:resonance` twice → second run reuses (idempotent); SSR-curl every resonance page: SIMULATED badge present on each, drill-through reachable ≤2 clicks (verify link depth by URL walk), report sections render, forbidden-phrase test green.
- Export downloads verified by real HTTP fetch: CSV guard spot-check (craft a mock fixture response starting with `=SUM(` → exported cell must be quoted), JSON contains pmf arrays, markdown shows edited_md wins after an edit+regenerate-other-section test.
- Archive on the demo resonance run exits 0 with nonzero metrics.
- Manual browser pass on ink + paper surfaces; V-2 check.

### Critical-bug risks

| Risk | Trap | Defense |
|---|---|---|
| Simulated chapter lands in an AUDIT report | C-12 breach via shared section machinery | Sections are run-scoped; test: generating audit report for the audit run emits no `resonance_*` keys and vice versa |
| Stimulus markdown XSS via print view | Stimuli embed model/web-origin quotes; print renders through marked + dangerouslySetInnerHTML | Escape at template source (D-040 helper), test with a `<script>` payload fixture |
| Drill-through shows non-denominator responses | Trust break — the M12/D-062 lesson | Drill-through queries reuse the recompute's eligibility filter function (share the function, don't re-derive) |
| Demo script spends money | Someone flips it to live mode | Script hard-codes `run_mode='mock'` and asserts $0 actual cost at the end |
| "Insufficient data" gates forgotten on persona slices | Small-n numbers presented as solid | DB-3-style gate test at both scopes |

---

## M20 — Value-add template packs + hardening + handover demo

**Goal:** the value-add layer ships as STUDY TEMPLATE PACKS (D-065: presets, not new machinery), guardrails get a final adversarial pass, and the internal build is demo-complete.

### Steps

1. **Branch** `m20-value-add-packs`.
2. **Template packs** — seeded `resonance_study_templates` (VERIFY whether a table or a fixtures-file constant is simpler; prefer a fixtures constant + seed-less approach since packs are static v1 content — if a table is chosen, that's a migration and must be planned as one). Four packs, each = named stimulus scaffolds + guidance copy: (a) *AI-framing repair* (measured_ai vs corrected vs repositioned — the flagship C-13 flow, default), (b) *promo framing* (same offer, N framings), (c) *price presentation* (same price, N presentations — NOT price-point testing; copy explains why absolute WTP is out of scope), (d) *message/claim variants*. Pack copy carries test-before-you-spend language; C-14 forbidden-phrase test covers pack copy too.
3. **Study builder integration** — "Start from template" fills stimuli scaffolds with placeholders; operator must fill each `{...}` before approve (validation: no unresolved placeholders).
4. **Adversarial hardening pass** (checklist, each item verified and logged):
   - C-12 sweep: run the wall tests against a project with interleaved audit/resonance runs and recompute-all (the D-056 backfill path) — zero cross-contamination.
   - C-13 sweep: attempt to approve a conditioned study whose evidence response was deleted/other-project → rejected.
   - C-14 sweep: forbidden-phrase test list reviewed against every resonance template/pack/UI string (grep for "predict", "guarantee", "ROI", "will increase" across `src/` resonance surfaces).
   - Budget chaos: set `EMBEDDING_PROVIDER` budget to $0.000001 → live-path unit test shows pause via `daily_budget_exceeded`, run resumable after raise (D-037 machinery).
   - Unparseable budget env → fails closed (D-039 already; add embedding var to that test's matrix).
   - Injection: D-027 generation chaos on a mock resonance run → retries/dead-letters behave; SSR skips dead jobs.
   - Kill/resume on resonance run re-verified post-packs.
5. **Docs close-out** — PRD tracker rows updated; this file's per-milestone RESULT notes appended; `RELEASE_CHECKLIST.md` gains a resonance-demo gate (internal demo checklist: walk audit → evidence → study → run → dashboard → report → export at $0); BUILD_NOTES entries for the milestone graduated/pruned per D-025.
6. **Full internal demo** — execute the walkthrough end-to-end on a fresh clone + fresh DB (the true handover test): `pnpm install && pnpm db:dev` (background) `&& pnpm db:migrate && pnpm db:seed && pnpm demo:walkthrough && pnpm demo:resonance && pnpm dev` → operator-style click-through of every surface. Log every friction point; fix or file.

### QA gate

- Everything in M16–M19 gates re-run green (regression sweep).
- Fresh-clone demo executed and logged with zero manual DB surgery.
- Hardening checklist 100% executed with outputs in BUILD_NOTES.
- Operator sign-off session: operator walks the demo unassisted; open questions logged as post-PoC backlog (multi-user, auth changes, payments, live embedding fidelity validation are all EXPLICITLY post-PoC — do not build them).

### Critical-bug risks

| Risk | Trap | Defense |
|---|---|---|
| Packs quietly reintroduce absolute-WTP/price-point testing | C-14 breach with a marketing smile | Pack (c) copy constraint + forbidden-phrase coverage |
| Template placeholders leak into resolved prompts | `{age}`-style braces reaching a live provider = garbage samples billed | Approve-time validation: unresolved `{...}` rejects; unit test |
| Recompute-all backfill (D-056 pattern) crosses kinds | One shared script looping all runs | Dispatch is inside `recomputeMetrics` itself, so any caller is safe — test the script path anyway |

---

## Post-PoC parking lot (do NOT build; recorded so nobody "helpfully" starts)

Multi-user/auth changes (existing shared-password login STAYS — it guards spendable credentials, C-11/D-024), payments, client portals, live embedding-fidelity calibration study, bootstrap CIs for PMF means, additional constructs (relevance/trust/switch-likelihood), image stimuli, anchor-set optimization/archetype tuning, non-English panels, location/footfall use cases (fails the validity gradient without a calibration anchor — see D-065), any self-serve surface.
