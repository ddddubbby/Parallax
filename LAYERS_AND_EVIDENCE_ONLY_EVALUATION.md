# Layers & Evidence-Only Evaluation

> Proposal for operator review. NOT canon — untracked, uncommitted. Two operator-proposed
> product improvements evaluated against the running code. Every factual claim cites `file:line`.
> Judgment calls are marked **[JUDGMENT]**; unverified claims are marked **[UNVERIFIED]**.
> Precedent: D-063 (funnel is presentation-only, no data restructure), D-051 (semantic layer
> on top of taxonomy), C-12/C-13/C-14 (simulation wall). Next free Decision-Log ID: **D-077**
> (verified: `D-076` is the last entry in `MASTER_CONTEXT.md` §9).

---

## Executive summary

The two proposals are **one improvement seen from two ends**. Proposal 1 renames the
epistemic boundary the product already enforces in code (C-12) so a first-time client can
see it; Proposal 2 makes that boundary a **producer/consumer contract**: the Evidence Layer
(audit) must produce evidence for every framing aspect a Simulation Layer baseline consumes.

Both are cheap where they should be cheap and both surface one real gap:

- **Proposal 1** is copy-level only, exactly as claimed. All funnel-stage vocabulary lives in
  **one core file** (`src/core/funnel.ts`) feeding **two render sites**. The "Resonance"
  naming collision is real and appears at **7 concrete sites**.
- **Proposal 2**'s GENERIC removal is a dormant-column change (no migration, ~12 code sites +
  ~10 test sites). But the coverage reality check found the **strongest gap in the frame**:
  the audit prompt taxonomy has **zero** templates that ask about price or promotions
  (`src/core/prompt-templates.ts` — verified: no `price|promo|cost|deal|offer|discount|afford|budget`
  token anywhere in 48 seeded templates), yet **two of four** resonance template packs
  (`price_presentation`, `promo_framing`) are built to test exactly those aspects. Those two
  packs' `measured_ai` baselines have **no audit evidence to cite**. This is the single
  strongest argument for the coverage panel.

---

## Proposal 1 — Layer model (Evidence Layer / Simulation Layer)

### 1a. Three overlapping taxonomies confirmed

| Taxonomy | Home | Renders where |
|---|---|---|
| Four P pillars (Presence/Position/Perception/Proof) | `src/core/semantic.ts` (`PILLARS`, `PILLAR_ORDER`) | Dashboard, report, matrix |
| Funnel stages (Upper/Mid/Lower + Trust Rail) | `src/core/funnel.ts` | Pillar section stamps, matrix, resonance page |
| Pipeline vocabulary (cell/rep/engine-mode/run/extraction) | `src/core/semantic.ts` `GLOSSARY_TERMS` | `<abbr>` tooltips (D-059) |

The funnel taxonomy is the thinnest and the one Proposal 1 targets. Its label strings all
originate in `src/core/funnel.ts`:

- `funnel.ts:10` `"Upper Funnel - Awareness & Reach"`
- `funnel.ts:15` `"Mid Funnel - Consideration & Education"`
- `funnel.ts:20` `"Lower Funnel - Simulated Action (SIM)"`
- `funnel.ts:38` returns `"TRUST RAIL"` for proof
- `funnel.ts:39` `funnelStampForPillar` → `"UPPER FUNNEL"` / `"MID FUNNEL"` / `"LOWER FUNNEL"`

**Funnel-stage UI touchpoints (every place a client SEES these words):**

| # | File:line | Copy shown | Surface |
|---|---|---|---|
| 1 | `src/components/semantic/pillar.tsx:47,61` | `UPPER/MID/LOWER FUNNEL` stamp (via `funnelStampForPillar`) | `PillarSection` header — renders on dashboard + matrix |
| 2 | `src/components/semantic/pillar.tsx:48` | full stage label in `title=` tooltip | same |
| 3 | `src/components/matrix/board.tsx:241` | `"TRUST RAIL · "` literal in sample-budget stamp | Matrix board |
| 4 | `src/app/projects/[id]/resonance/page.tsx:88` | `"Lower funnel results"` heading | Resonance page |
| 5 | `src/core/semantic.ts:298` | glossary def of `"funnel stage"` | `<abbr>` tooltip |

`PillarSection`/`PillarChip` are consumed by exactly two components
(`src/components/matrix/board.tsx`, `src/components/dashboard/dashboard-client.tsx`), so
touchpoint #1 fans out to just those two screens. **[JUDGMENT]** The funnel stamp adds a
fourth vocabulary word to a header that already carries the pillar number, pillar label, and
client question — it is the most redundant of the three taxonomies and the safest to retire
or rename.

### 1b. "Resonance" naming collision — confirmed, 7 sites

The umbrella product is "Resonance" (D-063). The simulation studies are ALSO called
"Resonance studies." A first-time client sees the same word as both the whole app and one
sub-tab:

| Meaning | File:line | String |
|---|---|---|
| **Umbrella** (whole product) | `src/app/layout.tsx:21` | `title: "Resonance"` (browser tab) |
| **Umbrella** | `src/app/login/page.tsx:33` | `<h1>Resonance</h1>` |
| **Umbrella** | `src/components/nav.tsx:25` | brand mark `Resonance` |
| **Simulation** (one sub-tab) | `src/components/project-subnav.tsx:11` | subnav tab `{ label: "Resonance", segment: "resonance" }` |
| **Simulation** | `src/app/projects/[id]/resonance/page.tsx:312` | `<h1>Resonance Studies</h1>` |
| **Simulation** | `src/app/projects/[id]/resonance/page.tsx:364` | `"No Resonance studies yet"` |
| **Simulation** | `src/app/projects/[id]/report/print/page.tsx:95` | `"Resonance Simulation Report"` |

The collision is exactly at the layer boundary: the subnav's five tabs are
`Matrix / Runs / Dashboard / Report / Resonance` (`project-subnav.tsx:6-12`) — four are the
Evidence Layer, the fifth is named after the whole product. **[JUDGMENT]** Renaming the
sub-tab and page heading to "Simulation" (or "Simulation Studies") resolves the collision
without touching the umbrella brand at `layout.tsx`/`login`/`nav`.

### 1c. Change-cost estimate — copy-level only

Replacing funnel-stage vocabulary with Evidence Layer / Simulation Layer naming touches:

| File | Change | Kind |
|---|---|---|
| `src/core/funnel.ts` | rewrite 4 label strings + `funnelStampForPillar` return values | copy in core |
| `src/components/semantic/pillar.tsx` | none if label source changes; optional: drop the stamp | none/opt |
| `src/components/matrix/board.tsx:241` | `"TRUST RAIL · "` literal | copy |
| `src/app/projects/[id]/resonance/page.tsx:88,312,364` | headings | copy |
| `src/components/project-subnav.tsx:11` | tab label | copy |
| `src/app/projects/[id]/report/print/page.tsx:95` | report title | copy |
| `src/core/semantic.ts:298` | glossary def | copy |
| `src/core/funnel.test.ts:33-36` | expected stamp strings | test |

No schema, no migration, no intent/pillar/metric rename, no data change — consistent with the
D-063 precedent that funnel labels are a presentation layer. The pillar→stage mapping in
`funnel.ts` can stay as the internal grouping even if the client-facing words change.

### 1d. Naming-scheme options **[JUDGMENT — operator to choose]**

Scored 1-5 (5 best) on four axes:

| Scheme | First-client clarity | Fit w/ "statistical honesty" USP | C-12 alignment | Migration cost |
|---|---|---|---|---|
| **(i) Evidence Layer / Simulation Layer** *(recommended)* | 5 — names the epistemic split plainly | 5 — "evidence" is the USP word; "simulation" signals proxy | 5 — the layer names ARE the C-12 wall | 5 — copy-only |
| (ii) Measure → Simulate (verb-led) | 4 — action-clear, funnel-like flow | 3 — "measure" fine, "simulate" ok but less honest-loaded | 4 — two verbs = two layers | 5 — copy-only |
| (iii) Status-quo funnel stages | 2 — Upper/Mid/Lower is jargon; redundant w/ pillars | 2 — funnel = marketing-speak, dilutes research framing | 3 — Lower≈sim but Proof-rail is awkward | 5 — no change |
| (iv) Observatory / Lab (metaphor) | 3 — evocative but needs a legend | 3 — memorable, but metaphor can overpromise | 4 — two rooms = two layers | 5 — copy-only |

**Recommendation: (i).** "Evidence" is already the load-bearing word in the product's founding
law (statistical honesty; measurement's ground truth is the AI itself). "Simulation Layer"
inherits the SIMULATED badge language (C-12) verbatim. It renames the boundary the code
already enforces rather than inventing a new metaphor a client must decode.

---

## Proposal 2 — Evidence-only studies + coverage contract

### Framing correction adopted from the strategic frame

- **Evidence-only** = every study's **baseline** must be a `measured_ai` stimulus citing stored
  raw response ids from the same project. C-13 tightens from *default-with-toggle* to *hard rule*.
  Repositioned/corrected/custom stimuli stay hypothetical **by design** — they are the
  treatments; the `measured_ai` baseline is the control.
- **MECE is the wrong lens.** Prompt-level mutual exclusivity is unnecessary for a sampling
  instrument, and metric double-counting is already prevented by the prompt-frame rule
  (D-054, `src/core/semantic.ts` `metricIntentFilter`). What matters is **collective
  exhaustiveness per framing aspect**: the audit must produce evidence for every aspect a
  simulation baseline needs.

### 2a. GENERIC's code footprint + removal effort

`genericUnconditioned` / GENERIC surfaces (verified via grep across `src/` + `scripts/`):

| Layer | Site | Role |
|---|---|---|
| Schema | `src/db/schema/resonance.ts:28` `generic_unconditioned boolean not null default false` | column (dormant-able) |
| Migration | `src/db/migrations/0008_resonance_studies.sql:10` | already applied |
| Repo | `src/db/repositories/resonance.ts:674-680` | **approval guard** — the C-13 enforcement |
| Repo | `src/db/repositories/resonance.ts:31,84,104,405,475,639,645,723` | read/write plumbing |
| Action | `src/modules/resonance/actions.ts:79` | reads `genericUnconditioned` off FormData |
| Wizard | `src/components/resonance/study-wizard.tsx:82,92,170,283-294,303,327,369,387,411,415` | **toggle UI + readiness copy** |
| Report | `src/core/report-templates.ts:108,231` | GENERIC badge line |
| Export | `src/core/resonance.ts:10,13-14,22-23,106,108-109` | `resonanceExportLabel` → `"SIMULATED GENERIC"` |
| Export | `src/app/projects/[id]/report/export/csv/[dataset]/route.ts:24,42,56` | CSV `genericUnconditioned` column |
| Export | `.../report/export/markdown/route.ts:30`, `.../json/route.ts`, `print/page.tsx:52` | label plumbing |
| Pipeline | `src/core/pipeline.ts:51` | comment: GENERIC study may run before any audit run |
| Tests | `resonance.test.ts`, `resonance/service.test.ts:340,363`, `budget.test.ts:325`, `wall.test.ts:122`, `report-templates.test.ts:53`, export route tests | assert GENERIC path |

**Removal effort [JUDGMENT]:**

- **Migration:** none. Leave `generic_unconditioned` in place, dormant (D-057/D-072 discipline
  of not editing applied migrations). Optionally add a forward migration only to backfill/lock
  it `false` — not required.
- **Code:** the load-bearing change is `resonance.ts:674-680`, which today *allows* the
  no-evidence path when `genericUnconditioned=true`. Evidence-only makes the guard
  unconditional: a `measured_ai` baseline with zero evidence ids is always rejected. Remove the
  `!study.genericUnconditioned &&` conditions.
- **Wizard:** delete the toggle (`study-wizard.tsx:283-294`) and its readiness escape hatch
  (`:170-171`, `:411` "or turn on the generic option").
- **Report/export:** keep `resonanceExportLabel` but collapse to the single
  `"SIMULATED EVIDENCE-CONDITIONED"` value (`src/core/resonance.ts:13-14`); drop the GENERIC badge
  branch (`report-templates.ts:231`). CSV `genericUnconditioned` column can stay (always `false`)
  or be dropped — **[JUDGMENT]** keep it for export-schema stability.
- **Tests:** ~10 test sites assert the GENERIC-allowed path and must be rewritten to assert
  it is now rejected. The C-13 wall test (`wall.test.ts:122`) and service test
  (`service.test.ts:340` "blocks unconditioned measured_ai by default, then compiles GENERIC")
  invert: the second half is deleted.

Net: no migration, ~12 code edits, ~10 test rewrites. Honest and small.

### 2b. Evidence-picker flow today, and what "evidence-first" adds

**Today** (`src/components/resonance/study-wizard.tsx:385-436`): the operator authors a
stimulus, picks kind `measured_ai`, and a checkbox list of up to 6 audit responses appears
(`:415-435`, `evidenceOptions.slice(0, 6)`), each row showing an `excerpt`. Checking rows adds
their response ids to the stimulus. A warning fires when a `measured_ai` stimulus has zero
evidence (`:409-413`). It is **study-first**: the operator starts from a blank study and hunts
for evidence to attach.

**"Evidence-first" would invert the entry point [JUDGMENT]:** start from an audit finding
(a lost-shortlist cell, a weak-Perception attribute, a misinformation claim) and *seed* a study
whose `measured_ai` baseline is pre-populated with that finding's cited responses. The
machinery already exists — the study wizard drives existing server actions
(`updateStudyAction`/`addStimulusAction`/…, D-075) and evidence ids are already stored per
stimulus. The addition is a "Simulate this finding" affordance on dashboard/report findings
that creates a draft study with the baseline evidence attached, then hands off to the wizard.

### 2c. Coverage reality check — the strongest gap

**Audit taxonomy** (`src/core/prompt-templates.ts`): 5 intents ×
3 archetypes × 3 variants = 45 seeded templates (plus b2b overlap = 48 rows, `TEMPLATE_SEED`).
Intents: `discovery, consideration, comparison, validation, objection`. Placeholders are
`{persona} {market} {job_to_be_done} {category} {client_brand} {competitor_list} {attribute_list}`.

**Resonance packs** (`src/core/resonance-templates.ts` `RESONANCE_STUDY_TEMPLATES`):

| Pack | id | Baseline aspect it needs from the audit | Covered by audit taxonomy? |
|---|---|---|---|
| AI-framing repair | `ai_framing_repair` | how AI frames/describes the brand (Perception + Position) | **YES** — `validation`/`comparison`/`objection` templates elicit exactly this framing |
| Message / claim variants | `message_claim_variants` | truthful claims about the brand (Proof) | **PARTIAL** — `validation` + claim-verification produce claim evidence; variants are hypothetical treatments by design |
| **Price presentation** | `price_presentation` | how the brand's **price/package** is presented | **NO** — no audit template mentions price/cost/package |
| **Promo framing** | `promo_framing` | how an **offer/promotion** is framed | **NO** — no audit template mentions offers/promotions/deals |

**Verified:** grep of `src/core/prompt-templates.ts` for
`price|promo|cost|deal|offer|discount|cheap|afford|budget` → **NONE FOUND**. Not one of the 48
audit templates asks a pricing or promotion question. The only price-adjacent path is
`{attribute_list}`, which is **operator-entered** (`src/core/intake.ts:101-104`, min 6
attributes) — an operator *could* type "affordable" as an attribute, but nothing in the
taxonomy *structurally* elicits pricing framing.

**Consequence:** a `price_presentation` or `promo_framing` study's `measured_ai` baseline has
no stored audit response that actually describes how AI presents the brand's price/offer.
Under evidence-only, those two packs' baselines would fail the C-13 evidence requirement — or,
worse today, be run as GENERIC (the exact escape hatch Proposal 2 removes). Note the packs'
own bodies use `custom`-kind stimuli, not `measured_ai` (`resonance-templates.ts:60-131`), which
is a tacit admission they have no evidence to condition on. **This is the single strongest
argument for a matrix-approval-time coverage panel:** it would flag, before any run, that a
project intending price/promo simulation has no audit prompts producing the needed evidence.

### 2d. Does `pnpm demo:resonance` break under evidence-only? — NO

`scripts/demo-resonance.ts` creates an **evidence-conditioned** study, not GENERIC:

- `demo-resonance.ts:184-186` sets `genericUnconditioned: false`.
- The `measured_ai` baseline stimulus receives real `evidenceResponseIds` (`:190-196`).
- Those ids come from an actual completed **mock** audit run's stored responses
  (`:230-234`: `select id from responses where runId = auditRunId`; throws if none).

So the demo already exercises the evidence-only happy path. Removing GENERIC leaves the $0
demo intact. **[VERIFIED]**

### 2e. Mock-mode evidence conditioning works — YES

Mock audit runs are first-class and store real `responses` rows (C-9; the demo above cites
mock-run responses at `demo-resonance.ts:230-234`). The C-13 approval guard
(`resonance.ts:674-680`) checks only that cited response ids exist and belong to the project
(`assertEvidenceIds`), not that the run was live. So a fully mock pipeline — mock audit → stored
responses → cited in a `measured_ai` baseline → mock resonance run — is evidence-conditioned
end-to-end at $0. Evidence-only does not force live spend. **[VERIFIED]**

---

## Synthesis — the two proposals are one contract

- **Proposal 1 names the layers.** Evidence Layer (audit; Four P pillars live inside it) and
  Simulation Layer (resonance studies). Copy-only, D-063 precedent.
- **Proposal 2 defines the producer/consumer contract between the named layers.** The Evidence
  Layer *produces* framing evidence; the Simulation Layer *consumes* it as baselines. Evidence-only
  makes consumption mandatory (no GENERIC). The coverage panel makes production *checkable*.

The missing piece is a small **evidence-interface declaration**: each resonance template pack
declares the framing aspect its baseline needs (`ai_framing`, `claim`, `price`, `promo`).
At **matrix approval time**, a coverage panel — reusing the D-058 sample-budget-panel pattern
(`src/components/matrix/board.tsx:226-250`, which already projects per-pillar `cells × k` against
the n≥30 gate) — cross-checks the approved matrix's intents/attributes against the aspects any
intended study needs, and stamps ok/gap **before any run spends money**. 2c proves this panel
would immediately flag the price/promo hole.

---

## Recommendations

### (a) Sequencing

| Step | Work | Kind | Depends on |
|---|---|---|---|
| 1 | Rename simulation sub-tab + headings to resolve the "Resonance" collision (1b) | copy-only | — |
| 2 | Rename funnel-stage vocabulary → Evidence/Simulation Layer (1a/1c) | copy-only | — |
| 3 | Make C-13 unconditional; delete GENERIC toggle + escape hatches (2a) | small core + UI, no migration | — |
| 4 | Add `evidenceAspect` field to `RESONANCE_STUDY_TEMPLATES` (2c synthesis) | new core metadata | 3 |
| 5 | Matrix-approval coverage panel: matrix aspects vs template-needed aspects (synthesis) | **new core code** (the only non-trivial build) | 4, reuses D-058 panel |
| 6 | "Simulate this finding" evidence-first entry point (2b) | UI + reuse existing actions | 3 |

Steps 1-3 are copy/dormant-column and can ship in one small PR. Step 5 is the only piece that
is genuinely new core logic and carries real design value (the gap-flag).

### (b) Draft Decision-Log entries (for operator approval — next free ID is **D-077**)

> **D-077** | 2026-07-08 | **Product copy reorganized around two named epistemic layers —
> Evidence Layer (audit; the Four P pillars live inside it) and Simulation Layer (resonance
> studies) — resolving the three-taxonomy overlap and the "Resonance" umbrella-vs-sub-tab
> naming collision. Presentation-only (D-063 precedent): funnel-stage label strings in
> `src/core/funnel.ts` and their two render sites (`components/semantic/pillar.tsx`,
> `components/matrix/board.tsx`) plus the resonance page/subnav/report-title copy are rewritten;
> no intent/pillar/metric rename, no schema change, no data migration. The umbrella brand
> ("Resonance" at `layout.tsx`/`login`/`nav`) is unchanged; only the simulation sub-tab and its
> headings move to "Simulation".** | Why: a first-time client met three competing vocabularies
> (pillars, funnel stages, pipeline terms) and saw "Resonance" mean both the whole product and one
> tab — the epistemic wall C-12 already enforces was invisible in the chrome | Rejected:
> renaming the intent taxonomy (breaks D-054 frames + golden data for zero gain); a metaphor
> scheme (Observatory/Lab — needs a legend, risks overpromising); keeping funnel stages (jargon
> redundant with pillars).

> **D-078** | 2026-07-08 | **Simulation studies are evidence-only: C-13 tightens from
> default-with-operator-toggle to a hard rule. Every study's baseline must be a `measured_ai`
> stimulus citing stored audit response ids from the same project; the GENERIC unconditioned
> toggle and its approval escape hatch are removed (`resonance.ts:674-680` guard made
> unconditional; `study-wizard.tsx` toggle deleted; `resonanceExportLabel` collapses to
> SIMULATED EVIDENCE-CONDITIONED). Repositioned/corrected/custom stimuli remain hypothetical by
> design — they are the treatments; the baseline is the control. The `generic_unconditioned`
> column stays dormant (no migration; D-057/D-072 discipline). `pnpm demo:resonance` is
> unaffected (already evidence-conditioned, `demo-resonance.ts:184`), and mock audit runs still
> supply citable evidence at $0.** | Why: an unconditioned study is exactly the Aaru/EY critique
> attack surface (C-14 rationale); a toggle that silently drops the evidence requirement
> undermines the product's founding honesty law | Rejected: keeping the toggle "for flexibility"
> (the flexibility is the credibility landmine); a migration to drop the column (churn against a
> dormant default-false column).

> **D-079** | 2026-07-08 | **Evidence-interface contract + matrix-approval coverage panel. Each
> resonance template pack declares the framing aspect its baseline needs
> (`RESONANCE_STUDY_TEMPLATES` gains `evidenceAspect`); a coverage panel at matrix approval —
> reusing the D-058 sample-budget-panel pattern — cross-checks the approved matrix's intents (and
> operator attributes) against the aspects any intended study needs and stamps ok/gap before any
> run spends. Motivating gap: verified that `src/core/prompt-templates.ts` has ZERO price/promo
> templates while the `price_presentation` and `promo_framing` packs need exactly that evidence —
> a coverage panel surfaces this at approval time instead of at a GENERIC-run dead end.** | Why:
> collective exhaustiveness per framing aspect (not prompt-level MECE — D-054 already prevents
> metric double-counting) is the real cross-layer requirement, and it was previously invisible
> until run time | Rejected: enforcing MECE at the prompt level (unnecessary for a sampling
> instrument); adding price/promo audit templates unconditionally (over-broadens every audit —
> the panel flags the gap so the operator decides per project).

**[UNVERIFIED / operator to confirm]** the exact wording, and whether D-079's coverage panel is
in-scope now or deferred behind D-077/D-078.

### (c) Deliberately NOT proposed

| Not doing | One-line reason |
|---|---|
| Intent taxonomy rename (`discovery`…`objection`) | breaks D-054 prompt-frames, PM-2 quotas, golden data — zero measurement gain (D-051 precedent) |
| Matrix / prompt-cell restructure | C-4 freezes approved matrices; layer naming is presentation-only |
| Data migration for layer copy or GENERIC removal | funnel labels are strings (D-063); `generic_unconditioned` stays dormant (D-072 discipline) |
| Funnel pillar→stage *mapping* table changes in `funnel.ts` | the internal grouping is fine; only the client-facing label strings change |
| Renaming the umbrella "Resonance" brand | only the sub-tab collides; brand at `layout.tsx`/`login`/`nav` stays |
| Adding price/promo audit templates by default | over-broadens every audit; the coverage panel lets the operator opt in per project |
| A repo-wide `ActionResult`/type sweep for evidence-only | the existing `{ ok, error }` shapes work (D-076 rejected the same sweep) |

---

## Verified-facts appendix

- Funnel labels: `src/core/funnel.ts:10,15,20,38,39`. Render sites: `pillar.tsx:47-61`,
  `board.tsx:241`, `resonance/page.tsx:88`, `semantic.ts:298`. Fans out to `board.tsx` +
  `dashboard-client.tsx` only (PillarSection consumers).
- "Resonance" collision: umbrella at `layout.tsx:21`, `login/page.tsx:33`, `nav.tsx:25`;
  simulation at `project-subnav.tsx:11`, `resonance/page.tsx:312,364`, `print/page.tsx:95`.
- GENERIC guard: `src/db/repositories/resonance.ts:674-680` (approval-time C-13 enforcement).
- Audit price/promo coverage: `src/core/prompt-templates.ts` — grep of
  `price|promo|cost|deal|offer|discount|cheap|afford|budget` = **NONE** across 48 templates.
- Resonance packs: `src/core/resonance-templates.ts:24-132` — `price_presentation` +
  `promo_framing` use `custom` stimuli (no `measured_ai` baseline).
- Demo evidence-conditioned: `scripts/demo-resonance.ts:184` (`genericUnconditioned: false`),
  `:230-234` (cites mock-run response ids).
- Next Decision-Log ID: `MASTER_CONTEXT.md` §9 last entry = `D-076` → next free = **D-077**.
