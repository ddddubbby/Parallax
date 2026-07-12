> LIFECYCLE: HISTORICAL · ROLE: PLAN · OWNS: M21-M26 execution playbook (D-077) · DISPOSITION: EXECUTED

# M21_M26_BUILD_PLAN.md — Layer Identity → Calibration Execution Playbook

> **Status: tracked planning canon, executed (M21-M26), see D-077 (adoption) through D-082 (execution).** Execution playbook for
> sprints M21–M26, continuing the format of `RESONANCE_BUILD_PLAN.md` (per-milestone numbered
> steps, explicit QA gates, critical-bug risk tables). Strategic sequencing is fixed by the lead
> session; this file verifies effort/risk against the running code and writes the how. Read
> `MASTER_CONTEXT.md` fully first (C-1..C-14; D-016, D-051, D-052, D-054, D-058, D-063, D-064,
> D-067, D-069, D-073, D-076), then `LAYERS_AND_EVIDENCE_ONLY_EVALUATION.md` (the approved-for-
> planning evaluation whose two proposals become M21–M23), then the milestone chapter here.
>
> RULES FOR EXECUTORS: (1) No architecture improvisation — every deviation is a Decision Log
> entry approved first. (2) Every milestone ends with its QA gate executed and pasted into
> `BUILD_NOTES.md`. (3) When this plan says VERIFY, run it and read the output. (4) When a step
> conflicts with observed code, STOP and write the conflict into `BUILD_NOTES.md`. (5) "simulated"
> and "measured" are load-bearing everywhere; never swap them. (6) Claims I could not verify
> against running code are marked **[JUDGMENT]**.

---

## 0. Overview

| Sprint | Theme | Size | Depends on | Decision gate before start |
|---|---|---|---|---|
| **M21** | Layer identity (Evidence/Simulation copy) | **S** (copy-only) | — | D-077 adoption; simulation sub-name choice |
| **M22** | Test-DB isolation + evidence-only (kill GENERIC) | **M** (test infra + ~12 code/~10 test sites, no migration) | M21 recommended (shared copy) | D-078 adoption |
| **M23** | Coverage contract + price/promo templates | **M–L** (new core panel + template pack + golden-expectation drift) | M22 (evidenceAspect on packs) | D-079 adoption; per-project vs default template policy |
| **M24** | Multi-provider resonance (supersedes D-067) | **L** (~10 files: recompute keys + results + report + exports + run form) | — (independent of M21–M23) | **D-067 supersession → D-080** |
| **M25** | Ops & deploy (parallel track) | **M** (deploy + Sentry seam + 1 migration) | operator-gated go-live | RELEASE_CHECKLIST sign-off; D-081 |
| **M26** | Calibration spike | **S–M** (protocol + harness; gated on external data) | external human Likert data | D-082; real-panel data availability |

**Decision-ID accounting (verified):** `MASTER_CONTEXT.md` §9's last entry is **D-076**; the
evaluation's D-077/078/079 are **drafts in the untracked eval doc, not yet written into §9**, so
the true next free ID is **D-077**. This plan numbers: M21 = **D-077**, M22 = **D-078**, M23 =
**D-079** (matching the eval drafts verbatim if adopted), M24 = **D-080**, M25 = **D-081**, M26 =
**D-082**. **Collision rule:** if the operator adopts the eval drafts as-is they occupy 077–079;
if any draft is rejected/renumbered, shift M24–M26 down to keep §9 contiguous. Confirm the final
mapping at M21 kickoff and write it into §9 before any code lands.

---

## M21 — Layer identity (Evidence Layer / Simulation Layer)

**Goal:** the product presents two named epistemic layers — **Evidence Layer** (audit; the Four P
pillars live inside it, Proof stays the trust rail) and **Simulation Layer** (resonance studies) —
resolving the three-taxonomy overlap and the "Resonance" umbrella-vs-sub-tab collision. Copy-only,
D-063 presentation-layer precedent. NO schema, NO intent/pillar/metric rename, NO data change.

### Steps

1. **Branch** `m21-layer-identity`. Decision entry **D-077** (adopt the eval's draft wording).
2. **Funnel vocabulary → layer names** — `src/core/funnel.ts:10,15,20,38,39` (verified). Rewrite
   the four label strings and `funnelStampForPillar` return values. The pillar→stage *mapping*
   stays as internal grouping (D-063 explicitly keeps it); only the client-facing strings change.
   **[JUDGMENT]** simplest coherent scheme under recommendation (i): stamps read `EVIDENCE LAYER`
   for all four pillars, `TRUST RAIL` for proof (unchanged intent), and the Simulation Layer owns
   the lower-funnel word. Do NOT delete `funnel.ts` — its exports feed the two render sites.
3. **Render sites (exactly two `PillarSection` consumers, verified):**
   `src/components/semantic/pillar.tsx:47,48,61` (stamp + title tooltip) and
   `src/components/matrix/board.tsx:241` (`"TRUST RAIL · "` literal). No other component reads
   `funnelStampForPillar` — `PillarSection`/`PillarChip` fan out only to `board.tsx` +
   `dashboard-client.tsx` (verified).
4. **"Resonance" collision (7 sites, verified):** rename the SIMULATION-side four, leave the
   UMBRELLA three untouched.
   - Simulation → "Simulation" / "Simulation Studies": `src/components/project-subnav.tsx:11`
     (tab label + keep `segment: "resonance"` route unchanged — routing is not copy),
     `src/app/projects/[id]/resonance/page.tsx:88,312,364`,
     `src/app/projects/[id]/report/print/page.tsx:95`.
   - Umbrella UNCHANGED: `src/app/layout.tsx:21`, `src/app/login/page.tsx:33`,
     `src/components/nav.tsx:25`. **The route segment stays `resonance`** — renaming the URL is
     migration-of-links churn for zero gain; only visible copy moves.
5. **Glossary** — `src/core/semantic.ts:298` (`"funnel stage"` def). **[JUDGMENT]** rewrite to
   define "Evidence Layer" / "Simulation Layer"; keep the `<abbr>` term key stable if other code
   references it (grep before renaming the key).
6. **Tests** — `src/core/funnel.test.ts:33-36` expected stamp strings updated to the new copy.

### QA gate

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0.
- **Recompute invariance (M16 presentation-only pattern):** recompute the demo run before and
  after the branch; `metrics` row counts and values byte-identical — proves zero data effect.
  Command: `pnpm demo:walkthrough` then a manual/scripted `recomputeMetrics` diff, or dump
  `select scope_type, scope_key, metric_key, n, value from metrics where run_id=<demo>` pre/post.
- **Copy assertions:** SSR-curl the dashboard, matrix, and simulation pages; assert new strings
  present ("Evidence Layer", "Simulation"), assert zero occurrences of the retired funnel words
  ("Upper Funnel", "Mid Funnel", "Lower Funnel") on client surfaces.
- **V-2 one-accent:** manual browser check both ink/paper; layer stamps stay structural/neutral,
  orange remains the only accent (D-055 tint reservation intact).

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| A "rename" sweep touches pillar ids / metric keys in `semantic.ts` | High | Step 2 rewrites only `funnel.ts` label strings; grep-verify no diff in `semantic.ts` `PILLARS`/`GLOSSARY` metric constants |
| Renaming the `resonance` route segment breaks bookmarks/links | Med | Rename copy only; segment stays `resonance` (step 4) |
| Layer stamp styled with a new color/tint | Med | Reuse existing stamp token; V-2 check in QA gate |
| Umbrella brand accidentally renamed | Low | Explicit leave-list: `layout.tsx`/`login`/`nav` untouched |

---

## M22 — Test-DB isolation + evidence-only (kill GENERIC)

**Goal:** (A) the DB-backed suite is safe to run against a dev DB holding real queued runs
(closes the D-073 hazard), THEN (B) C-13 tightens from default-with-toggle to a hard rule — the
GENERIC unconditioned path is removed. No migration; `generic_unconditioned` stays dormant.

### Part A — test isolation FIRST (blocks Part B's DB tests)

**Verified facts:** `src/db/client.ts:5-7` — the pool reads `DATABASE_URL` and falls back to
`postgres://postgres:postgres@localhost:5432/parallax` (the SAME db `scripts/dev-db.ts` serves on
:5432, db `parallax`). `vitest.config.ts` sets `fileParallelism: false` but no per-run DB
scoping. `embedded-postgres` is already a working dependency driven by `scripts/dev-db.ts`
(persistent `.pgdata`, port 5432). `claimJobs(provider)` claims the oldest queued job for a
provider **across all runs** (D-073) — the exact footgun that corrupted a live run mid-session.

**Two options evaluated:**

| Option | Effort | Safety | Cost |
|---|---|---|---|
| **(1) Ephemeral embedded-Postgres test DB** | Med | Total isolation — tests never touch the dev DB | New port + init per suite; ~seconds startup |
| (2) Per-run-scoped `claimJobs` | Med–High | Partial — narrows the claim but tests still write to the dev DB (responses/metrics) | Threads a run filter through the worker claim path + every test |

**Recommendation: Option (1) — ephemeral test DB.** Rationale: (2) only fixes the *claim*
collision; DB-backed tests still INSERT into and DELETE from the shared dev DB (e.g.
`recomputeResonanceMetrics` does `delete from metrics where run_id`), so a shared DB stays
hazardous even with scoped claims. (1) removes the shared surface entirely and the repo already
owns the machinery (`embedded-postgres`, the dylib-symlink fix in `dev-db.ts:14-52`). Per-run
claim scoping is still worth doing as defense-in-depth (the D-073 follow-up) but is not the
isolation guarantee.

**Steps:**
1. `scripts/test-db.ts` (mirror `dev-db.ts`): boot an embedded Postgres on a distinct port (e.g.
   :5433) into a **tmp/throwaway** data dir, run migrations, export its connection string.
2. A vitest global setup (`vitest.config.ts` `globalSetup`) starts the test DB, sets
   `process.env.DATABASE_URL` to it before `src/db/client.ts` is imported, and tears it down
   after. **[JUDGMENT]** verify import-order: `client.ts` reads `DATABASE_URL` at module load, so
   the env must be set in `globalSetup`, not per-file.
3. `package.json` `test` unchanged in name; add `db:test` if a standing test DB is preferred over
   ephemeral-per-run. Update `MASTER_CONTEXT.md` §5 command table + BUILD_NOTES with the new rule:
   **never `pnpm test` against a dev DB with real pending runs** stays true as a belt, but the
   ephemeral DB makes it a non-event.
4. Regression: run the full suite twice against the ephemeral DB; confirm the dev DB (`.pgdata`)
   is untouched (`select count(*) from responses` on the dev DB identical pre/post).

### Part B — evidence-only (kill GENERIC)

**Verified DB state (read-only query, 2026-07-08):** the dev DB holds **9 `resonance_studies`,
of which 6 have `generic_unconditioned = true`** — five are `M17 Compiler E2E` test artifacts
and one is a real-looking approved study `"weekday lunch $1 off"`. All are DEV/TEST rows; there is
no production (M25 is the first deploy). **[JUDGMENT]** Because the dev DB is disposable and
reseedable and no client data exists, removal is CLEAN with a reseed — **no legacy render path is
required for a pre-deploy internal tool**; the collapsed `resonanceExportLabel` and dormant column
mean a stray historical GENERIC row renders mislabeled but never crashes. Recommend reseeding the
dev DB after Part B rather than carrying a legacy branch.

**Verified code footprint (from the evaluation, spot-checked):**
- Approval guard: `src/db/repositories/resonance.ts:674-680` — the C-13 enforcement; today it
  *allows* the no-evidence path when `genericUnconditioned=true`.
- Wizard toggle + readiness escape hatch: `src/components/resonance/study-wizard.tsx`
  (:82,92,170,283-294,303,327,369,387,411,415).
- Action: `src/modules/resonance/actions.ts:79`. Export label: `src/core/resonance.ts:10,13-14,22`.
- Report badge: `src/core/report-templates.ts:108,231`. CSV column:
  `src/app/projects/[id]/report/export/csv/[dataset]/route.ts:24,42,56`.
- Tests asserting the GENERIC-allowed path: **invert** `service.test.ts:340` ("blocks
  unconditioned measured_ai by default, then compiles GENERIC" — delete the second half) and
  `wall.test.ts:122`; sweep `resonance.test.ts`, `budget.test.ts:325`, `report-templates.test.ts:53`.

**Steps:**
5. **Branch** `m22-evidence-only` (after Part A merges or on the same branch — sequence Part A
   first so Part B's inverted tests run isolated). Decision entry **D-078**.
6. Make `resonance.ts:674-680` unconditional: a `measured_ai` baseline with zero evidence ids is
   ALWAYS rejected — remove the `!study.genericUnconditioned &&` conditions.
7. Delete the wizard toggle (`study-wizard.tsx:283-294`) and its readiness escape-hatch copy
   (:170-171, :411 "or turn on the generic option"). Verify the wizard's step-4 readiness
   checklist (D-075) still gates Approve on real evidence.
8. Collapse `resonanceExportLabel` to the single `"SIMULATED EVIDENCE-CONDITIONED"` value
   (`resonance.ts:13-14`); drop the GENERIC badge branch (`report-templates.ts:231`). **Keep** the
   CSV `generic_unconditioned` column (always `false`) for export-schema stability (**[JUDGMENT]**,
   eval concurs). Remove the `genericUnconditioned` FormData read at `actions.ts:79`.
9. Invert/rewrite the ~10 test sites (above) to assert the no-evidence path is now REJECTED.
10. `scripts/demo-resonance.ts` is unaffected — verified it sets `genericUnconditioned: false`
    (:184-186) and cites real mock-run response ids (:230-234). Re-run `pnpm demo:resonance` to
    confirm the evidence-only happy path still completes at $0.

### QA gate

- Full suite green **on the ephemeral test DB** (Part A proven); lint/typecheck/build green.
- New guard test: approving a study with a `measured_ai` baseline and zero evidence ids → rejected
  (was the GENERIC escape hatch).
- `pnpm demo:resonance` twice → idempotent, $0, evidence-conditioned.
- Dev DB untouched by a full `pnpm test` run (Part A invariant).
- Reseed dev DB; confirm no GENERIC rows remain (`select count(*) filter (where
  generic_unconditioned) from resonance_studies` = 0).

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| Part B lands before Part A → inverted tests run against the dev DB and corrupt a live run | **High** | Sequence Part A first; it is a blocking prerequisite (D-073) |
| A historical `generic_unconditioned=true` row crashes a report/export | Med | Column stays dormant + label collapses to one value → mislabeled not fatal; reseed dev DB |
| Wizard readiness gate loosened when the toggle is removed | Med | Step 7 re-verifies Approve still requires real evidence; new guard test |
| `globalSetup` env set after `client.ts` import → tests hit :5432 anyway | Med | Verify import order; assert the test-DB port in a setup smoke test |

---

## M23 — Coverage contract + price/promo templates

**Goal:** additive framing-aspect metadata makes the Evidence-Layer→Simulation-Layer
producer/consumer contract checkable at matrix-approval time; price/promo audit templates fill the
verified coverage hole — all within EXISTING intents, no new intent values.

**Verified gap:** `src/core/prompt-templates.ts` — grep of
`price|promo|cost|deal|offer|discount|cheap|afford|budget` returns **NONE** across all 48 seeded
templates (5 intents × 3 archetypes × 3 variants + b2b overlap). Two of four resonance packs
(`price_presentation`, `promo_framing`, `src/core/resonance-templates.ts:54-106`) use `custom`
stimuli precisely because they have no `measured_ai` evidence to cite.

**Verified PM-2 interplay:** `src/core/matrix.ts` — `intentQuotas(target)` scales
`DEFAULT_INTENT_ALLOCATION[intent]` per **intent**, not per template
(`matrix.ts:110-131`); `allocateMatrix` fills each intent's quota from its priority-ordered combo
pool (:170-216). **Adding templates within existing intents changes the variant POOL, not the
quotas — confirmed no quota change is needed** (task item 5 verified). BUT the new combos enter
the priority-ordered pool, so a default 40-cell matrix MAY begin selecting price/promo cells,
which is the real M23 risk (see below).

### Steps

1. **Branch** `m23-coverage-contract`. Decision entry **D-079**.
2. **Framing-aspect metadata (additive):** add an optional `frameAspect` field to the audit
   template type in `src/core/prompt-templates.ts` (values e.g. `ai_framing | claim | price |
   promo`); tag existing templates by aspect. Additive core field — no schema, no migration.
3. **Pack declares its need:** add `evidenceAspect` to `RESONANCE_STUDY_TEMPLATES`
   (`src/core/resonance-templates.ts`) — `ai_framing_repair→ai_framing`,
   `message_claim_variants→claim`, `price_presentation→price`, `promo_framing→promo` (eval
   synthesis 2c). This is the eval's draft D-079 step 4.
4. **Coverage panel (the only genuinely new core code):** reuse the D-058 sample-budget-panel
   pattern at `src/components/matrix/board.tsx:226-250` (verified — it already projects per-pillar
   `count × AUDIT_K` against `SMALL_N_GATE` with ok/warn `Stamp`s). Add a sibling panel that
   cross-checks the approved matrix's present `frameAspect`s (and operator attributes,
   `src/core/intake.ts:101-104`) against the aspects any intended study pack needs, stamping
   ok/gap **before any run spends**. Pure derivation from already-loaded matrix data — no new
   query if the board already has cell intents/aspects; **[JUDGMENT]** verify the board's cell
   props carry `frameAspect` after step 2, else thread it through the matrix loader.
5. **Price/promo templates:** author price + promo templates across the three archetypes (`b2b`,
   `consumer_product`, `consumer_venue`) within EXISTING intents (**[JUDGMENT]** `consideration`
   and `comparison` are the natural homes — buyers weigh price/offers at those stages). Enforce the
   per-archetype forbidden-jargon test (D-052 RB-5 pattern). **Policy decision (operator gate):**
   default-on for all matrices vs opt-in per project. The eval recommends opt-in ("adding
   price/promo unconditionally over-broadens every audit"). **[JUDGMENT]** ship them as templates
   the coverage panel *recommends* when a price/promo study is intended, not as auto-allocated
   defaults — this also protects golden expectations (below).

### D-016 mock-fixture risk — SIZED HONESTLY (task item 1)

**Verified:** the mock provider selects a fixture by `stableIndex(key, fixtures.length)` where
`key = (resolved_text, "mock", repIndex)` (`src/providers/mock/index.ts:31,52-58`,
`buildFixtureSelectionKey`). Selection is **modulo the fixture-array length** — there is NO
per-prompt fixture map and **no fallback-or-fail path: any new template's resolved text simply
hashes into an existing fixture.** So adding seeded templates requires **NO new fixture entries**
and cannot "fail to map." **The evaluation's framing of this as M23's top risk is a
[JUDGMENT] correction: the fixture-mapping risk is LOW.**

**The real M23 risk is golden/e2e expectation drift, not fixtures:** if new templates enter the
default allocation pool (step 5), `allocateMatrix` may select price/promo combos into the demo/
seed matrix, changing which cells the `pnpm test:mock-e2e` 500-job run and any golden metric
expectations produce. Mitigation: ship price/promo templates as opt-in/recommended (step 5), so
the default seeded matrix composition is unchanged and golden expectations hold; if any test pins
the full template count (e.g. asserts 48), update that count deliberately and log it.

### QA gate

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` exit 0; `pnpm test:mock-e2e` green
  (proves new templates + coverage panel broke no audit path).
- Coverage-panel test: a matrix with zero price aspect + an intended `price_presentation` study →
  panel stamps a `gap`; add a price template → stamps `ok`.
- Forbidden-jargon test green for the new price/promo templates across all three archetypes.
- Golden/e2e: assert seeded default-matrix composition unchanged (opt-in policy) OR update pinned
  expectations with a logged rationale.

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| New templates auto-allocate into default matrices → golden/e2e drift | **Med–High** | Opt-in/recommended policy (step 5) keeps default composition fixed; else update expectations deliberately |
| Coverage panel needs a cross-run/cross-study query → slow or leaky | Med | Derive from already-loaded matrix + intended-study metadata; no new heavy query (D-058 pattern is pure projection) |
| Price/promo copy drifts into absolute-WTP framing (C-14) | Med | Forbidden-jargon test; packs already scope out price-point testing (D-065) |
| `frameAspect` not threaded to board cell props → panel blind | Low | Step 4 verify; thread through matrix loader if missing |

---

## M24 — Multi-provider resonance (supersedes D-067)

**Goal:** a resonance run accepts **≥1 provider** (mode stays exactly 1); each provider is a
distinct synthetic population scored into its OWN per-provider PMFs with ΔPI baselines computed
WITHIN that population — never pooled cross-engine (the D-067 rationale is preserved, its
single-provider *restriction* is lifted). New Decision entry **D-080 supersedes D-067**.

**Verified facts:**
- D-067 guard lives at `src/modules/runner/actions.ts:140-141` (rejects `providers.length !== 1
  || modes.length !== 1` for resonance) inside `projectRunCost`; `createRun` reuses the same
  validation path.
- Resonance recompute: `src/db/repositories/metrics.ts:437-572` — `recomputeResonanceMetrics`
  keys `resonance_variant` on **`stimulusId`** (:499-501), `resonance_variant_persona` on
  **`stimulusId|panelPersonaKey`** (:515-524), `resonance_delta` on `stimulusId` (:549-563).
  **No provider dimension anywhere.**
- The samples array (:464-487) is built from `getEligibleExtractionsForRun` — verified that
  loader **already returns `providerId` per sample** (`src/db/repositories/extraction.ts:242-286`,
  :281). So provider is available; it just isn't carried into `samples` or the scope keys.
- Results reader: `src/db/repositories/resonance.ts:224-390` — `getResonanceStudyResults` selects
  **one** completed run (:251-272) and parses bare/`|`-split scope keys (:341-390). Multi-provider
  is WITHIN one run (one run, multiple selected providers), so run selection is unchanged; only
  key parsing + grouping change.
- Run form: `src/components/runner/run-creation-form.tsx:37,45,139,166,168` — `singleEngine` prop
  forces single provider AND single mode; page wires it at
  `src/app/projects/[id]/runs/new/page.tsx:54` (`singleEngine={version.kind === "resonance"}`).
- Report/export surfaces touching resonance scopes (verified grep):
  `src/modules/report/service.ts`, `src/core/report-templates.ts` (context type already carries
  `providerId` at :70, evidence line at :454), the three export routes
  (`csv/[dataset]/route.ts:39,47` handles `resonance_responses`/`resonance_metrics`,
  `json/route.ts`, `markdown/route.ts`), `print/page.tsx`, `scripts/archive-evidence.ts`.

### Per-file change size (task item 3 — honest enumeration)

| # | File | Change | Size |
|---|---|---|---|
| 1 | `src/db/repositories/metrics.ts:437-564` | carry `providerId` into `samples`; composite keys `stimulusId\|providerId`, `stimulusId\|panelPersonaKey\|providerId`, delta per `stimulusId\|providerId`; **baseline mean computed within each provider group** | **L** |
| 2 | `src/db/repositories/resonance.ts:224-390` | parse the new composite keys; group results per provider for side-by-side render; run selection unchanged | **M–L** |
| 3 | `src/modules/runner/actions.ts:140-141` | relax guard: reject only `modes.length !== 1` for resonance; allow `providers.length >= 1` | **S** |
| 4 | `src/components/runner/run-creation-form.tsx` | split `singleEngine` into `singleMode` (radio for mode) + multi-select providers for resonance | **M** |
| 5 | `src/app/projects/[id]/runs/new/page.tsx:54` | update the prop wiring | **S** |
| 6 | `src/app/projects/[id]/resonance/page.tsx` | results grouped per engine side-by-side; SIM badge per group | **M** |
| 7 | `src/core/report-templates.ts` + `src/modules/report/service.ts` | resonance_results/method per-provider tables (context already has `providerId`) | **M** |
| 8 | `csv/[dataset]/route.ts` (+ json/markdown/print) | add `provider` column to `resonance_metrics.csv`; per-provider rows | **S–M** |
| 9 | `scripts/archive-evidence.ts` | verify recompute-then-export routes resonance correctly (already recomputes per D-044) | **S** |
| 10 | tests: `metrics`, `wall.test.ts`, `resonance/service.test.ts`, csv route test | new key format + within-provider baseline assertions; invert the D-067 rejection test | **M** |

**~10 files. Honest total size: L.** The load-bearing risk is the recompute baseline logic (#1):
ΔPI must subtract the **same-provider** baseline mean, never a cross-provider one.

**Recompute-all migration (C-5, no schema migration):** metrics are disposable — old
single-engine rows keyed on bare `stimulusId` are DELETED-then-REBUILT by the very next
`recomputeMetrics` run (`metrics.ts:566-569` `delete ... where run_id`), which now emits the new
composite keys. So "migrate old rows" = run recompute-all; it is idempotent by construction. Add a
one-shot `recomputeMetrics` sweep over completed resonance runs at deploy and a test asserting an
old-format run recomputes cleanly to the new keys.

### Steps

1. **Branch** `m24-multi-provider-resonance`. Decision **D-080** (supersede D-067; keep D-067's
   no-pooling rationale, lift the single-provider restriction).
2. Relax the guard (#3); update its rejection test to assert multi-mode still rejected,
   multi-provider now accepted.
3. Rework `recomputeResonanceMetrics` (#1): thread `providerId` from the sample into every scope
   key; group `byStimulusProvider`, compute `stimulusMeans` per `(stimulus, provider)`, derive the
   baseline mean **per provider**, emit delta rows per `(stimulus, provider)`. n≥30 gate applies
   per provider group. Add a within-provider-baseline unit test with a two-provider fixture where
   the engines disagree — assert deltas use own-population baselines.
4. Results reader (#2) + page (#6): parse composite keys, render one PMF/ΔPI block per engine
   side-by-side, SIM badge each.
5. Run form (#4/#5): multi-select providers, single-choice mode.
6. Report + exports (#7/#8): per-provider tables/rows; provider column in `resonance_metrics.csv`;
   CSV cells stay CWE-1236-guarded (D-045).
7. Deploy sweep + test (#9/#10).

### QA gate

- Full suite + `pnpm test:mock-e2e` (audit) + resonance e2e green.
- Two-provider mock resonance run: assert each provider gets its own `resonance_variant` /
  `_persona` / `_delta` rows; ΔPI baselines are within-provider (the C-12-in-miniature guard);
  recompute twice → byte-identical (C-5).
- Old single-engine run recomputes to the new key format with no orphan rows.
- Results page renders both engines side-by-side, SIM-badged; report + CSV carry the provider
  dimension; forbidden-phrase (C-14) test green.

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| ΔPI uses a cross-provider baseline → pools distinct populations (the D-067 failure mode) | **High** | Within-provider baseline in recompute (#1); two-engine-disagree test |
| Old single-engine metric rows collide/orphan under new keys | Med | Disposable delete-then-rebuild (C-5); deploy sweep + old-format recompute test |
| Results reader mis-splits a 3-part composite key | Med | Explicit key schema + parser test; keep a stable delimiter |
| Run form lets multi-mode through for resonance | Med | Guard rejects `modes.length !== 1`; form uses radio for mode |
| CSV/report drop the provider dimension → two engines look like one | Med | Provider column + per-provider rows; export test asserts distinct provider values |

---

## M25 — Ops & deploy (parallel track, operator-gated)

**Goal:** first Render deploy per `RENDER_DEPLOYMENT.md` + `RELEASE_CHECKLIST.md`; grounded-
provider validation closing the Gemini caveat; Sentry wired behind the existing `reportError`
seam; a DB trigger closing the S-039 direct-mutation residual. Runs parallel to M21–M24; nothing
here blocks them, and go-live is operator-gated.

### Steps

1. **Branch** `m25-ops-deploy`. Decision **D-081** (deploy + observability wiring).
2. **Render deploy** — execute `RELEASE_CHECKLIST.md` one-time gates: wait-for-CI, backup
   retention, health/login, keys entered via Settings (C-11, never env), mock → deepseek-mini →
   grounded validation. Keys NEVER in `render.yaml` (C-11; D-045 confirmed `generateValue: true`
   for `CREDENTIALS_ENCRYPTION_KEY` is correct — do not re-open).
3. **Grounded-provider validation** — close the Gemini caveat: a grounded run returning normalized
   citations through an approved API path (C-8/C-10). Log the closing evidence in
   `RELEASE_CHECKLIST.md`.
4. **Sentry behind the seam (D-076):** `src/observability.ts`'s `reportError(error, context)` is
   the single swap-in point. Wire an env-gated DSN — no-op when `SENTRY_DSN` unset, so CI/dev/tests
   stay dependency-free (D-045 discipline: no SaaS dep added until the env is present). Do NOT move
   `reportError` into `src/core` (C-7 — it has a console side effect; it already lives in a leaf).
5. **`prompt_cells` mutation trigger (S-039 residual):** a **migration** (next number — VERIFY the
   latest in `src/db/migrations/`; 0009 is the last per D-072, so **0010**) adds a DB trigger
   rejecting direct UPDATE/DELETE on `prompt_cells` belonging to an APPROVED matrix version (C-4
   at the DB layer — belt to the app-level freeze). Additive-first; verify clean on fresh + existing
   DB. This milestone **contains a migration — say so in the session plan.**

### QA gate

- `RELEASE_CHECKLIST.md` one-time gates all checked with pasted evidence.
- Grounded validation run archived; Gemini caveat marked closed.
- `reportError` unit test: no-op when DSN unset; forwards when set (stub). No new dep in the
  DSN-unset path.
- Migration 0010 clean on fresh + existing DB; trigger test: direct UPDATE of an approved-matrix
  `prompt_cells` row is rejected; a draft-matrix row still mutable.

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| Provider key leaks into `render.yaml`/env (C-11) | **High** | Keys via Settings only; checklist gate; grep deploy config |
| KEK env group deleted/recreated → all stored credentials orphaned (D-021) | **High** | Checklist warns; never recreate the env group |
| Sentry dep pulled into CI when DSN unset | Med | Env-gate the import; DSN-unset no-op test |
| 0010 trigger rejects legitimate draft-cell edits | Med | Scope the trigger to approved versions only; draft-mutable test |

---

## M26 — Calibration spike (gated on external human data)

**Goal:** a protocol document + comparison harness benchmarking SSR PMFs against real human Likert
distributions. Anchor sets stay `calibrated: false` until real data lands; the report method-
section language flips automatically off the flag. **Gated on external human data availability —
do not start without it.**

**Verified flag flow:** `src/core/report-templates.ts:113` (`anchorSetCalibrated: boolean` in the
resonance context) → `:499` (`Anchor calibration | ${ctx.anchorSetCalibrated ? "calibrated" :
"uncalibrated anchor sets"}`). So the report copy already flips off a single boolean — M26 needs
only to (a) produce real data, (b) flip the flag on a validated anchor version, and the method
section updates automatically. Anchor versions are C-4-frozen (D-064/D-069): a calibrated set is a
NEW version string, not an edit.

### Steps

1. **Branch** `m26-calibration-spike`. Decision **D-082** (calibration protocol; anchors stay
   uncalibrated until benchmarked).
2. **Protocol document** (`CALIBRATION_PROTOCOL.md`, tracked): how human Likert distributions are
   collected, how SSR PMFs are compared (per-item and aggregate), the acceptance bar for flipping
   `calibrated: true` on a new anchor version. Records the validity gradient (D-065): relative >
   absolute, discourse-rich > niche, text > physical, age/income > identity.
3. **Comparison harness** (`scripts/calibrate-ssr.ts`, **[JUDGMENT]**): given a human Likert
   dataset + a set of stimuli, run SSR scoring and emit per-anchor-set correlation/divergence vs
   the human distribution. Pure comparison — no product surface, no live spend beyond embeddings.
4. **New calibrated anchor version** (only if the harness clears the bar): author
   `purchase_intent.v2` with `calibrated: true`; the loader refuses unknown versions (D-064), so
   studies pin v2 explicitly at approval. The report method section flips automatically via the
   verified flag flow.
5. **Report language** — verify no code change is needed beyond the flag: `report-templates.ts:499`
   already renders "calibrated" vs "uncalibrated anchor sets" off `anchorSetCalibrated`.

### QA gate

- Protocol doc reviewed and committed.
- Harness reproduces a known hand-computed correlation on a tiny fixture (golden-style).
- If v2 authored: a study pinned to v2 renders "calibrated" in the report method section; a v1
  study still renders "uncalibrated"; anchor-version loader refuses an unknown version.

### Critical-bug risks

| Risk | Severity | Mitigation |
|---|---|---|
| `calibrated: true` flipped without a passing benchmark (C-14 overclaim) | **High** | Flag flips only on a NEW anchor version that cleared the protocol bar; never edit v1 |
| Harness reads embeddings live in CI | Med | Fixture-backed golden test; live path opt-in with an env flag |
| Report claims calibration the paper never validated (D-066) | Med | Method-section language pinned to the flag; forbidden-phrase test extended |

---

## Decision gates for the operator (approve before the named sprint starts)

1. **Before M21:** adopt **D-077** (layer identity) and choose the simulation sub-name from the
   eval's options — recommendation **(i) Evidence Layer / Simulation Layer** (eval 1d). Confirm the
   final Decision-ID mapping (see §0 collision rule) before any code lands.
2. **Before M22:** adopt **D-078** (evidence-only / kill GENERIC). Confirm the dev-DB reseed is
   acceptable (6 GENERIC dev/test rows exist; no legacy render path proposed).
3. **Before M23:** adopt **D-079** (coverage contract). Decide price/promo template policy:
   **recommend opt-in/recommended, not default-on** (protects golden expectations + eval's
   over-broadening concern).
4. **Before M24:** approve **D-067 supersession → D-080**. Confirm cross-engine comparison stays
   "separate providers within one run, rendered side-by-side, baselines within-provider" — never
   pooled.
5. **Before M25:** `RELEASE_CHECKLIST.md` go-live sign-off; approve **D-081**. Confirm the M25
   migration (0010 trigger) is wanted.
6. **Before M26:** approve **D-082**; confirm external human Likert data is actually available —
   M26 is otherwise a no-op spike.

---

## Deliberately deferred (recorded so nobody "helpfully" starts)

| Deferred | One-line reason |
|---|---|
| **Local/OSS embedding adapter** (kills the OpenAI SSR-scoring dependency) | Sized but not scheduled — removes a live-cost dependency but adds a model-quality validation burden; post-PoC unless the OpenAI dep becomes a blocker |
| **Repo-wide `ActionResult` type sweep** | Existing `{ ok, error }` shapes work; churn for ~zero behavior gain (D-076 rejected the same sweep) |
| **docx/PDF report polish, client branding** | Demand-driven after the internal PoC (D-053); exports already ship markdown/print-HTML/CSV/JSON |
| **"Simulate this finding" evidence-first entry point** (eval 2b) | Real value but additive UX on top of M22; schedule after the coverage contract proves out |
| **Renaming `Intent`/`audit_runs`/the `resonance` route segment** | Migration/link churn, zero behavior gain (D-068 held the same line) |
| **Per-run `claimJobs` scoping** | Defense-in-depth follow-up to M22's ephemeral test DB (D-073); the isolated test DB is the actual fix |

---

## Verified-facts appendix (file:line)

- Mock fixture selection: `src/providers/mock/index.ts:31,52-58` — `stableIndex(key, len)`, key =
  `(resolved_text, "mock", repIndex)`, **modulo fixtures.length; no map, no fail-on-unmapped** →
  M23 fixture risk LOW (correction to the eval's framing).
- DB connection: `src/db/client.ts:5-7` — `DATABASE_URL` fallback = the dev DB on :5432.
- `embedded-postgres` already driven by `scripts/dev-db.ts:8,54-60` (usable for an ephemeral test
  DB). `vitest.config.ts` has no DB scoping.
- GENERIC dev-DB rows (read-only query, 2026-07-08): **9 studies, 6 `generic_unconditioned=true`**
  (5 `M17 Compiler E2E` + 1 `"weekday lunch $1 off"`, all dev/test).
- Resonance recompute keys: `src/db/repositories/metrics.ts:499,515,551` — bare `stimulusId` /
  `stimulusId|panelPersonaKey`; no provider dimension.
- `getEligibleExtractionsForRun` returns `providerId`: `src/db/repositories/extraction.ts:244,281`.
- D-067 guard: `src/modules/runner/actions.ts:140-141`. Run-form `singleEngine`:
  `run-creation-form.tsx:37,45,139,166,168`; wired `runs/new/page.tsx:54`.
- PM-2 quotas per intent, not per template: `src/core/matrix.ts:110-131,170-216` → new templates
  in existing intents need NO quota change (task item 5 verified).
- Price/promo coverage: `src/core/prompt-templates.ts` — grep
  `price|promo|cost|deal|offer|discount|cheap|afford|budget` = NONE across 48 templates.
- Anchor-calibration flag flow: `src/core/report-templates.ts:113,499` — report copy flips off
  `anchorSetCalibrated` (M26 needs only the flag + a new anchor version).
- Next free Decision-Log ID: `MASTER_CONTEXT.md` §9 last = **D-076** → next = **D-077** (eval's
  D-077/078/079 are drafts, not yet in §9).
