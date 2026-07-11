# M34_BUILD_PLAN.md — Baseline Framing Integrity

> **Status:** SUPERSEDED by the D-099 descope (2026-07-11) — historical record, do not execute. The automated-certification architecture this playbook builds (blind-extraction state machine, clustering, eligibility engine, medoid, hard C-15) was retired after protocols v1–v4 failed to reach a defensible freeze; M34A's human-reviewed-evidence plan lives in D-099 + `BUILD_NOTES.md` (below the D-090 threshold). Body preserved unedited below per the D-086 document taxonomy.
> **Branch:** `m34-baseline-framing` (cut from `main` at the M33-merge commit).
> **Decision record:** D-094 (`MASTER_CONTEXT.md` §9), amended by D-095/D-096/D-097/D-098; new hard constraint C-15 (§4).
> **Qualifies for a standalone plan file under D-090:** multi-phase with per-phase acceptance, ships a migration and a second worker state machine, realistically spans several sessions/agents, and exceeds ~300 lines. This is the earned exception, not the default.

---

## 0. Boot ritual for this milestone

Before editing anything, the implementing agent runs the §8 boot ritual:

> Read `MASTER_CONTEXT.md` fully, then PRD §8.32 + the M34 tracker row (§11), then **this file end to end**, then `DEVELOPMENT_GUIDELINES.md` §A, then the active M34 entry in `BUILD_NOTES.md`. UI-facing → also read `DESIGN_GUIDELINES.md`. This milestone deletes/renames nothing but **supersedes** protected decisions (D-068, D-079), so also read `AUDIT_METHODOLOGY.md` and `PROTECTED_REGISTER.md` and confirm each supersession is cited by D-number before touching the surface. Summarize the plan in ≤10 bullets, list expected files per phase, wait for confirmation before editing.

Then **read the epistemic frame** below. The whole milestone exists to enforce one idea: *a simulation may only react to a framing we have proven is real, prevalent, and stable — represented by an actual stored AI answer, never an authored summary.* Every rule serves that; if a step seems to weaken it, stop and escalate.

---

## 1. What M34 is (and is not)

**Is:** a foundational Evidence Layer milestone that (a) measures the story AI tells about a consumer brand with the least possible prompt contamination, across two explicitly-different evidence lanes; (b) proves whether that framing is prevalent and stable under conservative, no-override admission rules; (c) admits only the **representative verbatim response** (medoid) of an eligible framing into a Simulation study as its measured baseline; and (d) walls all of this per-lane, per-provider, per-mode with no pooling.

**Is not:** a construct redesign (`purchase_intent.v1` stays `calibrated:false`, BF-26); a human-calibration study; a demo/brand milestone (the D-089 M34→M36 hero-data/brand/demo arc is **deferred** — recorded, not silently dropped); a B2B feature (B2B keeps the existing Evidence Layer, gets no framing baseline and no new Simulation approval); a decision-gate/implementation-brief milestone (explicitly out of scope, deferred).

**Stand-alone value insurance:** Phases 0–4 are a sellable Evidence-Layer product on their own ("what story does AI tell about our brand, and is it stable?") even if the Simulation Layer were cut. The investment is not stranded on the simulation bet.

---

## 2. Constraints and protected surfaces this milestone touches

| Surface | Rule for M34 |
|---|---|
| C-3 raw immutability | Frame extraction reads stored raw text; never mutates it. A frame-extraction failure never invalidates the raw response or the standard audit extraction. |
| C-4 / migration 0009 CHECK | Representation cells are `intent<>'simulation'` → already satisfy the 0009 shape CHECK (need only `stimulus_id`/`panel_persona_key` null). A **tightening** CHECK (representation ⇒ persona/market null) is added additively in 0013. |
| C-9 mock discipline | Mock runs are fixture-backed end to end, incl. the blind frame extractor — no live embedding/extraction calls in mock or CI. |
| C-12 measured/simulated wall | Frame rows are audit-side; they never enter Simulation metrics and never pool into ordinary audit aggregates. New wall tests. |
| C-13 evidence-conditioning | Extended by C-15: a measured baseline must reference an **eligible** framing baseline, not merely a cited response id. |
| **C-15 (new)** | Baseline framing integrity — see §4 and MASTER_CONTEXT §4. Enforced in the approval RPC + repository; no UI/repo override. Lands **last** (Phase 6). |
| D-054 prompt-frame rule | Gains a 4th frame class `neutral_branded` (branded but non-evaluative). Representation cells count toward no planted-signal metric. |
| D-066 enum-add rule | Migration 0013 only *adds* the `representation` enum value; it is never *used* in the adding transaction. Seeding happens in app code afterward. |
| D-068 `Intent` union | **Partially superseded** by D-094: five audit intents become six (`representation` is a genuine audit intent, unlike `simulation`). The audit-vs-simulation type wall stays. Cite D-094. |
| D-079 coverage contract / packs | **Partially superseded** by D-094: the "Simulation coverage" panel is replaced for framing-repair by a real readiness state; price/promo packs stay protected code but are methodology-gated (not newly client-ready). Cite D-094. |
| D-081 freeze trigger | Approved framing baselines are immutable exactly like approved matrices/anchor sets; edits create a new baseline version. |
| PM-9 scanner | `representation` joins the branded-exempt set (its prompts contain `{client_brand}` by design). |
| Stability Index | Stays "tracked-brand shortlist consistency" (BF-13). **Never** relabeled or reused as frame stability. Frame stability is its own separate computation. |

**Register additions (do in the ritual):** C-15, the medoid-verbatim baseline rule, the blind frame extractor's input isolation, the `neutral_branded` PM-9 exception, and the `representation` intent — all become new protected surfaces.

---

## 3. The two evidence lanes (shared vocabulary for every phase)

- **Organic-in-context** (`organic_in_context`): the client appeared *spontaneously* in an existing unbranded discovery/consideration response. Always conditional on the frozen query set. Never labeled "organic opinion" without the "in-context" qualifier.
- **Neutral-elicited** (`neutral_elicited`): the client was named in a minimally-prompted `representation` query. Never labeled "organic."
- **Never pooled:** lanes, providers, and grounded/ungrounded modes are separate scopes end to end. "Bias-free", "unbiased", "vanilla AI opinion" are **forbidden** vocabulary (test-enforced).

---

## 4. C-15, stated once (canonical text lives in MASTER_CONTEXT §4)

> **C-15 — Baseline framing integrity.** A new B2C client-ready Simulation study may not use a measured baseline unless it references an **eligible** M34 framing baseline from the same project, and its single `measured_ai` stimulus IS the baseline's stored medoid response (`baselineStimulusId` equals that stimulus). Custom/corrected/repositioned stimuli can never be the baseline. Lane, provider, and generation mode never pool. No UI or repository path may bypass eligibility. Historical studies render `LEGACY BASELINE`; no backfill or reclassification occurs.

---

## 5. Phased build

Seven phases, each its own commit(s), each green (lint · tsc · vitest · relevant golden/e2e) before the next — D-092's commit-per-phase-green rule. **C-15 enforcement is Phase 6, deliberately last**, so that merging M34 does not brick new B2C studies until an eligible baseline can actually exist.

Legend for each phase: **Goal · Files · Steps · Acceptance · Commit.**

---

### Phase 0 — Retrospective feasibility gate + protocol freeze
*No migration. No production code paths. No C-15. This phase can STOP the whole milestone.*

> **PHASE 0 STATUS (2026-07-11, D-095): executed twice, NO-GO both runs — the stop-line fired as designed.**
> Run 1 failed on instrument defects (payload voiding, label fragmentation, invalid Heytea organic dataset);
> run 2, on a clean v2 instrument with byte-identical thresholds, produced real abstention verdicts
> (`prompt_sensitive` 2/6, `volatile` 1/6). Diagnosis: the eligibility *unit* is malformed
> (`dimension::label` identity fragments cross-dimension polysemy) and v4/v5 are dimension probes, not
> paraphrases. The lead's ruling (D-095, full record in `docs/audits/m34/phase0-reassessment.md`) sends
> Phase 0 into **framing-protocol.v3 research**: two-level concept+dimension-distribution ontology,
> open-paraphrase admission set with v4/v5 demoted to probes, a rebuilt four-control suite, and a
> brand-level dev/holdout split (Insta360 is development data permanently). **Phases 1–6 do not start
> until frozen v3 passes its held-out gate. C-15 remains unfrozen. No threshold was loosened.**
> The Phase-4 eligibility rules and BF-8/BF-10/BF-14 below are therefore superseded-in-part by the v3
> design once it freezes; they are left as written pending that freeze (immutable-history discipline).
>
> **PHASE 0 RECOVERY AMENDMENT (D-096):** before any v3 scoring, implement exact
> source-offset verification, immutable generation/extraction manifests, response-state
> denominators, one-run/one-standard-extraction-version organic pinning, four controls
> through the real clustering/eligibility path, and count/outcome-blinded mapping locked
> before scoring. v3 measures a profile of independently stable concepts with a
> per-concept dimension distribution; several stable concepts are allowed and a tie is
> not automatically instability. A small blinded human-coded instrument check and the
> preregistered uncertainty-clause ablation are freeze gates. Crocs/Xiaomi stay untouched
> until freeze. A held-out failure produces NO-GO (method changes create v4 + new held-outs).
>
> **V3 GATE RESULT (2026-07-11, D-097): NO-GO.** All four controls passed and
> exact-offset/manifests/denominators/pinning/blinding were implemented, but the
> preregistered ablation found eligibility only when the shared uncertainty clause
> was present. The registered rule therefore selects the no-clause arm, which was
> `unstable_profile`. v3 is rejected-not-frozen; human gold and Crocs/Xiaomi were not
> run; migration 0013 and Phases 1–6 remain blocked. See
> `docs/audits/m34/phase0-v3-gate.md`.

**Goal.** Prove the eligibility thresholds are empirically achievable on real data *before* any of them are written into enforceable code. Freeze the numeric rules as versioned protocol parameters, not universal truths.

**Files (throwaway/analysis, kept under `scripts/framing-feasibility/` and `docs/audits/m34/`; not wired into the app):**
- `scripts/framing-feasibility/extract-frames.ts` — read-only harness: pulls stored raw responses for the Insta360 + Heytea B2C projects, calls the configured extraction engine with the **blind** frame-extraction prompt (the exact prompt Phase 2 will ship), writes results to `scratchpad`/`docs/audits/m34/` JSON. Never writes to `frame_extractions` (table doesn't exist yet).
- `scripts/framing-feasibility/neutral-mini-run.ts` — fires the **six candidate representation prompts** (drafted here, promoted verbatim into the Phase-1 seed) 5× against the live DeepSeek + OpenAI credentials for one real brand (Insta360). Bounded spend (~6×5×2 = 60 generations + 60 extractions, single-digit dollars under existing cost guards). Explicitly labeled a feasibility mini-run, never a production matrix.
- `scripts/framing-feasibility/analyze.ts` — computes, per lane: frame-prevalence distributions, within-prompt vs across-prompt agreement, organic brand-mention density, clustering sensitivity at cosine ∈ {0.78, 0.80, 0.82, 0.85}, and the count of candidate baselines that would **pass / abstain / fail** each draft rule.
- `fixtures/framing/framing-protocol.v1.json` — the frozen parameter set (see below). Versioned; treated like an anchor set (edits = new version).
- `docs/audits/m34/phase0-feasibility.md` — the report + the go/no-go record.

**Steps.**
1. Draft the six representation prompts (§ BF-3 wording) and the blind frame-extraction schema/prompt. Get these exactly right here — they are promoted verbatim to production, so wording is finalized in Phase 0.
2. Organic lane: run `extract-frames.ts` over stored Insta360/Heytea responses that the standard extractor already marked as spontaneous client mentions. (Organic data already exists — no new spend beyond extraction.)
3. Neutral lane: run `neutral-mini-run.ts` to generate real neutral-elicited data (no representation cells exist yet, so this is the only way to get real neutral data for threshold-setting).
4. Run `analyze.ts`. Populate `framing-protocol.v1.json` with the draft numeric rules (§ Phase-4 eligibility) as the starting values, then check them against the observed distributions.
5. Write the go/no-go: **at least one real retrospective baseline passes AND at least one deliberately-unstable fixture correctly abstains.**

**Acceptance / GO-NOGO.**
- ✅ GO if ≥1 real baseline passes and ≥1 unstable case abstains → freeze `framing-protocol.v1.json`, proceed to Phase 1.
- ⛔ NO-GO if zero baselines pass → **do not loosen thresholds automatically.** Stop the rollout before C-15, write the protocol-reassessment note, escalate to the lead. A zero-pass world means the method, not the numbers, needs rethinking.
- The frozen `framing-protocol.v1.json` is the single source for every threshold in Phases 4/6. No threshold is ever a magic number in code.

**Commit.** `M34 Phase 0: retrospective framing feasibility + framing-protocol.v1 freeze` (includes the feasibility scripts, the protocol fixture, the report). Feasibility scripts may be deleted at milestone close per the docs/audits disposability convention (D-086 §8); the protocol fixture and report stay.

---

### Phase 1 — `representation` intent + prompts + allocation + metric walls
*Migration 0013 (schema for the whole milestone lands here). This is the widest-blast-radius phase.*

**Goal.** Introduce `representation` as a genuine sixth audit intent and route its blast radius exhaustively, so nothing silently mis-handles it.

**Migration `0013_baseline_framing.sql` (additive, no backfill) — write ALL M34 schema here:**
- `ALTER TYPE "public"."intent" ADD VALUE 'representation';` — **only** the enum value (D-066: cannot be *used* in this transaction).
- `CREATE TABLE "frame_extractions"` — versioned blind-extraction rows: `id`, `response_id` (FK, immutable), `lane`, `state` (`pending|retrying|valid|dead_lettered`), `schema_version int`, `extracted_json jsonb`, `extractor_model`, `protocol_version`, `cost_usd`, `tokens`, `validation_error`, `created_at`, `updated_at`. Mirror `extractions` provenance columns.
- `CREATE TABLE "framing_baselines"` — `id`, `project_id` (FK), `source_run_id` (FK), `lane`, `provider_id`, `generation_mode`, `state`, `cluster_membership_json`, `source_response_ids_json`, `eligibility_result_json`, `medoid_response_id` (FK), `report_summary` (text, nullable), `gap_classification`, `protocol_version`, `clustering_version`, `prompt_protocol_version`, `model_version`, `language`, `measured_at`, `review_notes`, `approved_at`.
- `ALTER TABLE "resonance_stimuli" ADD COLUMN "framing_baseline_id" uuid` (nullable; historical rows stay null).
- **Tightening CHECK** (additive, verified clean against existing rows): `ALTER TABLE "prompt_cells" ADD CONSTRAINT "prompt_cells_representation_shape_ck" CHECK ("intent" <> 'representation' OR ("persona_id" IS NULL AND "market_id" IS NULL AND "stimulus_id" IS NULL AND "panel_persona_key" IS NULL));`

**Files.**
- `src/db/schema/enums.ts` — add `representation` to the `intent` pgEnum array (keep in sync with the migration).
- `src/db/schema/extraction.ts` / new `src/db/schema/framing.ts` — `frameExtractions`, `framingBaselines` tables.
- `src/db/schema/resonance.ts` — `framingBaselineId` on `resonanceStimuli`.
- `src/core/matrix.ts` — widen `Intent`. Do **not** add `representation` to `UNBRANDED_INTENTS` (it is branded). Add it to the PM-9 branded-exempt path (beside validation/objection).
- `src/core/prompt-templates.ts` — `DEFAULT_FRAME_ASPECTS` (a `Record<Intent, FrameAspect[]>`, so the compiler forces this) gains a `representation` entry mapped to a new/reused Perception aspect; add the six representation seed rows to `TEMPLATE_SEED` (consumer archetypes only, `active:true`, `{client_brand}` the only placeholder).
- `src/core/semantic.ts` — PILLARS map gains `representation → Perception`; **replace** the `metricIntentFilter` if-chain's implicit default with an **exhaustive policy map** (§ metric wall below).
- `src/core/funnel.ts`, D-058 sample-budget panel, matrix-board grouping, archetype packs, report DTOs — every exhaustive `Intent` switch the compiler flags.
- `src/db/repositories/matrix.ts` — allocation: consumer default 40→46 (six representation cells added on top of the existing 40; B2B unchanged at 40); the 50-cap holds (46 < 50).
- `scripts/seed.ts` — idempotent seed of the six representation rows (natural key: archetype+intent+variantKey, per D-079's fix).

**Metric wall (exhaustive, test-locked).** Representation responses **feed**: blind frame discovery/robustness; standard factual-claim extraction + accuracy review (a claim is not planted by merely naming the brand). Representation responses **do not feed**: mention/recommendation rate, share-of-voice/first-position, comparative win rate, sentiment (any), desired-attribute association, the tracked-brand Stability Index, citation share, or standard cross-intent findings (unless a finding is explicitly scoped to `representation`). Implement as an exhaustive policy map keyed by `(metricKey, intent)` — never an unlisted/default branch.

**Acceptance.**
- Migration applies clean to fresh + existing DB; zero historical row changes; the tightening CHECK validates against all existing `prompt_cells`.
- Seed twice → no dupes; consumer archetypes generate 46 cells, B2B 40, 51 still rejected.
- Representation cells: null persona/market, empty competitor order, exact approved text, uneditable resolved text.
- Prompt-contract test: only `{client_brand}` placeholder; no evaluative vocabulary; the six prompts byte-match Phase 0's frozen wording.
- PM-9 accepts `neutral_branded` as an explicit branded exception; representation cells are not flagged as unbranded contamination.
- Metric-wall test: representation responses enter only the approved metric families; a wall test proves they never appear in mention/SoV/sentiment/attribute/citation/stability denominators.
- `tsc` clean (proves the `Intent`-widening blast radius is fully handled).

**Commit.** `M34 Phase 1: representation intent, prompts, allocation, exhaustive metric walls (migration 0013, D-094)`.

---

### Phase 2 — Blind frame extraction (second state machine)

**Goal.** A framing-specific extraction path that **cannot** see the fact sheet, desired attributes, campaign goals, competitors, operator labels, corrected/proposed narratives, or the original prompt. Discovery, not confirmation.

**Files.**
- `src/core/framing.ts` — `FrameLane`, `FrameDimension` (`category|offering|audience|occasion|attribute|differentiator|concern|uncertainty`), `FrameExtractionV1` (Zod): `frame_label`, `frame_dimension`, `stance`, `evidence_quote` (exact text, ≤240 chars), `source_response_id`, extractor/model/protocol version, and explicit `insufficient_evidence | no_frame | uncertain | malformed` states.
- `src/db/repositories/framing.ts` — the parallel state machine, mirroring `extraction.ts`: `createPendingFrameExtraction`, `markFrameExtractionRetrying`, `markFrameExtractionDeadLettered`, `commitValidFrameExtraction`, `recordFrameExtractionAttemptCost`, `listResponsesMissingFrameExtraction`, `listResponsesWithStaleFrameExtraction` (the D-045 torn-row sweep, verbatim pattern).
- `src/modules/extraction/framing-service.ts` — the worker-side blind extractor, mirroring `service.ts` but assembling a prompt that receives **only** raw text + observed brand name + the fixed schema. A snapshot test proves the assembled prompt contains none of the forbidden inputs.
- `src/providers/*/frame-extraction.ts` + `src/providers/mock/frame-extraction-engine.ts` — fixture-backed mock frame extraction (C-9); live uses the configured extraction engine.
- `src/worker/index.ts` — schedule frame extraction: for every valid representation response; for unbranded discovery/consideration responses **only after** the standard extractor confirms a spontaneous client mention. Reuse the failure-domain isolation of D-049 (a frame-extraction failure is its own domain; it never dead-letters the raw response or the standard extraction, but it blocks *baseline* completion until terminally resolved).
- Cost: `src/modules/runner/*` projection assumes worst case — all representation + all unbranded responses may require frame extraction; counted against run cap + daily budgets, attributed to the extraction engine (D-044 pattern).

**Acceptance.**
- Prompt snapshot proves absence of fact sheet, attributes, competitors, original prompt, client-role cues — and that identical raw text yields identical extractor input regardless of fact-sheet/attribute/campaign/competitor changes.
- Retry / dead-letter / stale-sweep / spend-projection / daily-budget / cost-attribution tests cover the second state machine (parallel to the existing extraction suite).
- Mock frame extraction is fully fixture-backed; CI makes no live call.
- A dead-lettered frame extraction blocks baseline completion but leaves the raw response + standard extraction untouched (C-3).

**Commit.** `M34 Phase 2: blind frame-extraction state machine (fixture-backed mock, worker-scheduled)`.

---

### Phase 3 — Clustering + minimal operator review UI

**Goal.** Propose within-scope clusters; let the operator approve/reject/relabel; keep prevalence descriptive.

**Files.**
- `src/core/framing-cluster.ts` — pure: propose clusters **only within the same** dimension + lane + provider + generation-mode + source-run; embeddings via the existing `EmbeddingProvider`; initial cosine threshold `0.82` (read from `framing-protocol.v1.json`, propose-only, versioned). Deduplicate: one response counts at most once toward a cluster's prevalence.
- `src/db/repositories/framing.ts` — persist proposed/approved cluster sets; approved sets immutable (later edits → new baseline version, prior memberships reproducible — D-081 discipline).
- `src/components/framing/cluster-review.tsx` + `src/app/projects/[id]/runs/[runId]/framing/…` — the v1 review interface: **approve / reject / relabel**, plus "assign the same reviewed label to multiple proposed clusters" (collapses them server-side). **Manual split is deferred** — an over-merged cluster must be *rejected*, never silently repaired.

**Acceptance.**
- Clustering never crosses dimension/lane/provider/mode/run boundaries (golden fixture: cross-dimension separation, same-dimension grouping, dedup-by-response).
- Relabel-to-same-label collapses server-side; a rejected cluster cannot support a baseline.
- Prevalence renders descriptively as `6 prompt variants × 5 generations` (or `N qualifying cells`), never `n=30`, and **no** Wilson/confidence interval or independence claim is emitted from correlated generations.

**Commit.** `M34 Phase 3: within-scope clustering + approve/reject/relabel review UI`.

---

### Phase 4 — Eligibility engine + medoid baseline + Framing view/report + legacy labels

**Goal.** Turn approved clusters into an eligible (or explicitly-abstaining) baseline, select the representative **verbatim** stimulus, and surface everything.

**Eligibility rules (read from `framing-protocol.v1.json`; no override anywhere).**

*Neutral-elicited baseline:*
- All six prompt variants × five generations completed successfully.
- A frame **wins a variant** iff it appears in ≥3 of that variant's 5 responses.
- It must win **≥5 of 6 variants**, be the **unique** top frame, and **remain uniquely top under leave-one-variant-out**.
- A tie for top frame **fails** (no arbitrary tie-break).
- No unresolved contradictory cluster on the same dimension; operator approval required.

*Organic-in-context baseline:*
- A source cell **qualifies** iff the brand appears spontaneously in ≥3 of 5 generations.
- Within a qualifying cell, a frame **wins** iff it appears in a majority of valid client-mentioning responses.
- A frame must win **≥5 distinct qualifying cells**, be uniquely top, and remain uniquely top under **leave-one-cell-out**.
- Fewer than five qualifying cells → `SPARSE ORGANIC EVIDENCE` (abstain, not a forced conclusion).

*Both lanes* also require operator approval, no unresolved contradictory cluster, and produce explicit abstention states: `extraction_incomplete | sparse | recurring_only | prompt_sensitive | volatile | divergent`. **No operator override of a failed rule** exists anywhere.

**Medoid baseline (evidence-pure — replaces authored synthesis).**
- For the winning eligible cluster, select the stored response whose embedding has the **lowest mean cosine distance** to the other supporting responses in the cluster.
- Resolve an exact medoid tie by response-UUID ordering (deterministic).
- Store the **immutable full raw response** as the measured baseline stimulus. Do not trim/rewrite/paraphrase. If it is unusable as a stimulus, **reject** the baseline in v1.
- Separately generate a labeled human-readable framing summary **for reports only** — it may be reviewed, but it is **never** the Simulation stimulus or primary evidence. Client language: *"This is a real AI answer, selected because it was the most representative response in a stable framing pattern."*

**Baseline scoping (BF-20).** A baseline is scoped to exactly one: project · source run · lane · provider · generation mode · prompt-protocol version · clustering version · model version · language · measurement date.

**Files.**
- `src/core/framing-eligibility.ts` — pure: the rules above, returning `eligible | <abstention state>` + diagnostics (variant/cell win table, LOO result, contradiction check). Hand-computed unit tests (the M26/calibration precedent).
- `src/core/framing-medoid.ts` — pure medoid selection + UUID tie-break; unit-tested deterministic.
- `src/db/repositories/framing.ts` — baseline create/approve; immutability on approval.
- `src/app/projects/[id]/runs/[runId]/framing/page.tsx` (+ view components) — the URL-addressable **Framing view** under audit-run detail: organic & neutral lanes, provider/mode selector, frame-extraction completion status, proposed clusters + raw excerpts, merge/relabel controls, eligibility diagnostics, reviewed synthesis, approval.
- `src/db/repositories/report.ts` + report templates — the Perception report/dashboard separates (1) organic-in-context framing, (2) neutral-elicited framing, (3) **client-defined attribute association** (the desired-attribute metric, relabeled — never "organic perception"), (4) solicited objections. Reports disclose prompt variants, generation structure, provider/model, grounding mode, extraction model, clustering protocol, review status, prevalence, divergence, abstention reasons. Historical audits/studies get `LEGACY BASELINE`; **no backfill**.
- Matrix Perception coverage (replaces the D-079 "Simulation coverage" check for framing-repair): readiness state `not run | extraction incomplete | review required | eligible | blocked`.

**Acceptance.**
- Eligibility boundary tests: neutral passes at 5/6-variant agreement, fails at 4/6, on top-ties, on LOO instability, on missing extractions, on contradictions; organic abstains at <5 qualifying cells; grounded/ungrounded evaluated separately.
- Medoid selection deterministic; returns an immutable verbatim stored response; operator edits cannot change it.
- Independent SQL spot-check reproduces ≥1 frame-prevalence denominator, cluster membership, and medoid linkage from raw rows.
- Reports never present the Stability Index as frame stability; desired-attribute metric reads "client-defined attribute association."

**Commit(s).** `M34 Phase 4a: eligibility engine + medoid selection (pure core + tests)` then `M34 Phase 4b: Framing view, Perception report split, legacy labels`.

---

### Phase 5 — Simulation linkage, pack gating, disclaimers, RS-8 language

**Goal.** Wire baselines into Simulation approval (but do **not** yet enforce — enforcement is Phase 6), gate packs, and correct sample language.

**Files.**
- `src/db/schema/resonance.ts` + `src/db/repositories/resonance.ts` — `framingBaselineId` on stimuli; the approval path (`approveAndCompileResonanceStudy`, `resonance.ts:940`) learns to select the baseline's medoid as the measured stimulus and auto-populate `evidenceResponseIdsJson` from the baseline's source responses (historical array preserved for legacy rendering).
- `src/modules/resonance/actions.ts` — pack gating: `price_presentation`/`promo_framing` packs cannot become newly client-ready (methodology-gated); protected code + historical rendering preserved (register/D-079 cite).
- Report templates + `src/core/report-templates.ts` — new Simulation reports say **experimental/uncalibrated**; single-mode baselines carry a mandatory `UNGROUNDED-ONLY`/`GROUNDED-ONLY` disclosure; both-mode is an enhanced-coverage label, not a gate.
- RS-8 language sweep — every UI/report renders `6 profiles × 5 completions` (or the real structure); the generation-count gate certifies only a **minimum model-generation budget / convergence check**, never "aggregate-grade consumer evidence."

**Acceptance.**
- New Simulation studies can *reference* a baseline; reports disclose mode and experimental status; RS-8 language appears everywhere n renders.
- Price/promo packs cannot be newly client-ready; historical studies still render (incl. GENERIC/legacy).
- B2B studies remain approvable **only** in the pre-M34 sense (no framing baseline) until Phase 6 gates them — see Phase 6.

**Commit.** `M34 Phase 5: Simulation baseline linkage, pack gating, disclosure + RS-8 sample-language sweep`.

---

### Phase 6 — C-15 enforcement (last)

**Goal.** Turn on the gate. This is a deliberate, stated product rule change: after this lands, a new **B2C client-ready** Simulation study cannot be approved until an eligible framing baseline exists.

**Files.**
- `src/db/repositories/resonance.ts` — `approveAndCompileResonanceStudy` enforces, for every new B2C client-ready study: exactly one `measured_ai` stimulus; that stimulus references an **eligible** framing baseline; `baselineStimulusId` equals that measured stimulus; custom/corrected/repositioned stimuli can never be the baseline; cross-project/stale-version/ineligible/blocked baselines rejected. **B2B** projects cannot create M34 baselines or approve new Simulation studies.
- `MASTER_CONTEXT.md` §4 — C-15 row already added in the ritual; this phase makes the code match it.
- Wall/regression tests — reject raw-response-only evidence, modified baseline text, cross-project baseline ids, blocked baseline states, B2B attempts, and any custom-baseline bypass (the RPC-hole discipline of D-071/D-078).

**Acceptance.**
- Approval rejects every bypass enumerated above; the existing measured-stimulus selection is now *protected policy* with regression tests.
- Existing studies keep running and render legacy; the C-12 wall tests still prove frame rows never enter Simulation or ordinary audit metrics.
- Documented product pause recorded in D-094 and the tracker: new B2C measured studies now require an eligible baseline.

**Commit.** `M34 Phase 6: C-15 baseline-integrity enforcement in approval RPC (D-094)`.

---

## 6. Data model summary (all in migration 0013)

- `intent` enum `+= 'representation'` (value only; D-066).
- `frame_extractions` — versioned blind-extraction rows, immutable source-response + protocol provenance, its own state machine.
- `framing_baselines` — lane/provider-mode-scoped, status, cluster membership, protocol/clustering/model versions, medoid response id, report summary, gap classification, review notes, approval time.
- `resonance_stimuli.framing_baseline_id` — nullable; historical rows null; **no backfill**.
- `prompt_cells` tightening CHECK for representation shape (additive).

Public domain additions: `Intent += "representation"`; `FrameLane`; `FrameDimension`; `FrameExtractionV1`; `FrameEligibilityStatus`; `FramingBaseline`; Simulation stimulus DTO gains `framingBaselineId` + legacy-baseline status. The standard extraction contract is **unchanged** — frame extraction is a separate blind contract precisely so fact sheets/attributes can't influence discovery.

---

## 7. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Thresholds too strict → zero baselines ever pass → C-15 permanently bricks new B2C measured studies | High | Phase 0 GO/NO-GO on real data *before* enforcement; NO-GO stops the milestone, no auto-loosening. |
| R2 | Widening `Intent` silently mis-routes a metric/allocation/pillar site | High | `Record<Intent,…>` + exhaustive switches make most sites compiler-forced; the exhaustive metric policy map + wall test cover the rest. |
| R3 | Blind extractor accidentally receives contaminating input | High | Prompt snapshot test asserts absence of fact sheet/attributes/competitors/prompt/role; separate contract from standard extraction. |
| R4 | Grounded-mode dependency: no live grounded run has ever executed; Gemini shape unverified | Med-High | Baselines are per-mode; a single-mode (ungrounded-only) baseline is admissible with disclosure; both-mode is a quality tier, not a gate. Does **not** put M34's critical path through RELEASE_CHECKLIST gate 9. |
| R5 | Second worker state machine reintroduces a D-045/D-049-class torn-row/failure-domain bug | Med | Mirror the proven patterns verbatim (torn-row sweep, failure-domain isolation); full retry/dead-letter/sweep test parity. |
| R6 | Correlated-draw statistics re-enter as a "confidence interval" | Med | Test forbids any Wilson/CI/independence claim on frame prevalence; prevalence is descriptive `6×5` structure only. |
| R7 | Demo arc displacement surprises the operator | Med | Recorded explicitly in D-094 + tracker: M34 replaces hero-data; M35/M36 brand/demo deferred; existing demos wear `LEGACY BASELINE`; new hero study generated only after M34 passes. |
| R8 | Cost of worst-case frame extraction on a full run | Low-Med | Worst-case projection (all representation + all unbranded) counted in cap + daily budgets up front. |

---

## 8. Definition of done

M34 is complete only when **all** hold (D-095/D-096 supersede the stale v1/hard-enforcement wording below where they differ):
- Phase 0 recovery gate succeeded under frozen `framing-protocol.v3`: six instrument fixes, all four real-path controls, blinded human-coded instrument check, preregistered uncertainty ablation, Crocs eligible, and Xiaomi preserved as a multi-concept profile or honest abstention without over-merge.
- Migration 0013 applies to fresh + existing DB twice; no historical row changes; seed idempotent; consumer 46 / B2B 40 / 51 rejected.
- Blind-extractor prompt snapshots prove input isolation; retry/dead-letter/sweep/budget parity tests green.
- Eligibility boundary suite green (neutral 5/6 pass & 4/6 fail, ties fail, LOO instability, missing extractions, contradictions; organic <5-cell abstain; grounded/ungrounded separated).
- Medoid selection deterministic + immutable; operator edits can't change the measured stimulus.
- No confidence interval / respondent-style claim emitted from correlated generations (test-enforced); forbidden-vocabulary test covers "bias-free"/"unbiased"/"vanilla".
- Shadow/advisory integration rejects or marks every provenance defect internally, records eligibility/abstention/review-time/actionable-gap rates, and renders `PRE-M34 BASELINE` for new C-13 studies until a later evidence-backed hard-enforcement decision; existing historical studies render `LEGACY BASELINE`.
- Independent SQL spot-check confirms provenance, cluster membership, medoid linkage, zero backfill.
- C-12 wall tests prove frame rows never enter Simulation or ordinary audit metrics.
- Playwright journey: consumer project → 46-cell matrix → audit run → frame review → baseline approval → experimental Simulation study; B2B absence and blocked states exercised.
- Full gate: lint (0 warnings) · tsc · full vitest · golden · mock-e2e · `pnpm test:e2e` (Playwright + axe) · migration/seed twice · cost-projection check · **an evidenced operator browser walk** (D-092: a UI milestone is not Done until the walk is evidenced in BUILD_NOTES).
- Canon current: D-094 + C-15 recorded; PROTECTED_REGISTER updated; PRD §8.32/tracker/roadmap synced; BUILD_NOTES M34 entry written; commit-per-phase history intact.

---

## 9. Explicitly out of scope for M34 (deferred, not dropped)

- `purchase_intent.v1` → single validated message-response construct redesign (later milestone).
- Any human calibration / flipping `calibrated:true`.
- Decision-gate outcome computation + implementation-brief report section.
- B2B framing baselines / B2B Simulation.
- Offer-specific baseline protocol for price/promo packs (packs stay methodology-gated until it exists).
- The methodology-guide citation fix (Aparicio→Maier) and the SSR-preprint qualifier in report templates (belong to the construct-redesign milestone).
- The M35 brand-alignment and M36 demo-ops arc.
