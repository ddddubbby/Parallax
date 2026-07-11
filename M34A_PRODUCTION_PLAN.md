# M34A Production Integration Plan

> **IMPLEMENTED — D-101/D-102 / 2026-07-11.** This plan implements D-099's
> human-reviewed framing evidence in production. It does not revive M34B,
> semantic eligibility, clustering, medoids, or automated stability claims.

## 1. Outcome

M34A gives a consultant an auditable workflow after a completed consumer
audit:

1. collect five fixed, minimally leading representation prompts inside the
   normal audit run;
2. discover and lock a small project codebook before positioning is revealed;
3. review every denominator job against literal source spans;
4. report descriptive recurrence and manual actionable-gap classifications;
5. hand one verbatim reviewed response to Simulation with an immutable C-15
   evidence snapshot.

The client claim is descriptive: Resonance shows what associations appeared
in sampled AI answers and which narrative gap is worth correcting and testing
next. It never certifies a universal or population-level framing truth.

## 2. Fixed boundaries

- Consumer product and consumer venue only. B2B keeps the existing C-13
  evidence-ID workflow and has no framing workspace.
- Five adopted prompts, `representation-prompts.v4`, with `{client_brand}` as
  the only placeholder:
  - `a1` — `What is {client_brand}?`
  - `a2` — `Describe {client_brand}.`
  - `a3` — `Tell me about {client_brand}.`
  - `a4` — `Give an overview of {client_brand}.`
  - `a5` — `Explain {client_brand}.`
- A normal consumer matrix retains its existing 40 allocated cells and appends
  the five representation cells once each: 45 total, below C-1's 50-cell cap.
- No second extraction worker. Production v1 uses human raw-text review and
  deterministic exact-quote-to-offset resolution. Failed assistance can never
  block evidence.
- No M34B, clustering, cosine similarity, LOO/5-of-6 law, medoid, synthetic
  population inference, cross-project training reuse, or automatic gap choice.
- No Crocs/Xiaomi work is required for production integration. A later pilot
  may measure usability time only; it cannot validate an ontology.

## 3. Data design

### Migration 0013 — enum only

`ALTER TYPE intent ADD VALUE 'representation'`. Nothing in this transaction
uses the new value (D-066/Postgres enum rule).

### Migration 0014 — production structure

1. Add the representation cell-shape CHECK: representation cells have null
   persona, market, stimulus, and panel-persona fields.
2. Create `framing_studies`:
   - project and source audit-run ownership;
   - workflow state;
   - prompt protocol version;
   - codebook id/version/JSON and create/lock metadata;
   - positioning text/digest plus immutable fact-sheet JSON/digest and reveal
     metadata;
   - reviewer identity/method and review timing.
3. Create `framing_response_reviews`:
   - one unique row per framing study × source job;
   - nullable response id so failed jobs remain in N;
   - explicit coded/none/ambiguous/entity-ambiguous/generation-unavailable
     outcome and review metadata.
4. Create `framing_annotations`:
   - response-review and locked association id;
   - accepted/rejected decision and proposal source;
   - exact start/end offsets, reviewer, timestamp, and note.
5. Create `framing_gap_classifications`:
   - reinforced/missing/misframed/unsupported/non-actionable;
   - association or missing target, rationale, fact references, analyst/time.
6. Create `framing_evidence_snapshots`:
   - study, annotation, and verbatim source response linkage;
   - copied evidence payload plus SHA-256 and creation time;
   - append-only repository contract.
7. Add nullable `framing_evidence_snapshot_id` to `resonance_stimuli`.

The compact five-table model stores a locked codebook as versioned JSON on the
study. A recode creates a new study/version; the locked JSON is never edited.

## 4. Phase plan

### Phase A — representation intent and evidence walls

- Widen core/DB intent types and add a `neutral_branded` prompt frame.
- Map representation to Perception and a dedicated
  `framing_associations` coverage aspect.
- Seed the five fixed prompts for both consumer archetypes; B2B gets none.
- Append the five null-persona/null-market cells after the existing 40-cell
  allocator output.
- Add representation to the PM-9 branded exemption.
- Replace implicit metric intent behavior with an exhaustive policy:
  representation may feed checkable claim extraction/accuracy review only;
  it never enters mention, recommendation, SoV, position, comparison,
  sentiment, attribute, citation, Stability Index, or ordinary finding
  denominators—even at intent-pure scopes.
- Acceptance: migration metadata, seed idempotency, 45/40 allocation, cell
  shape, PM-9, metric and finding wall tests.

### Phase B — workflow repositories and actions

- Create a framing study only from a completed B2C audit run containing the
  adopted representation cells.
- Define the denominator from source jobs, not successful responses.
- Select the blind subset without content, frequency, provider, or prompt
  outcome influencing selection; render raw text only.
- Allow codebook editing only in draft; lock id/version/JSON and timestamp.
- Reveal only after lock; snapshot operator-entered positioning and the active
  project fact sheet with digests.
- Require reveal before full-sample review.
- Resolve an operator-pasted quote to one literal occurrence. Zero matches or
  multiple matches require correction; no fuzzy fallback.
- Require one response-review row for every denominator job before recurrence.
- Compute recurrence as n/N, prompt spread, and provider/model/mode scopes;
  store gap classifications as human decisions.
- Acceptance: ownership/RPC boundaries, transition-order, exact-offset,
  complete-denominator, unavailable-job, recurrence, and no-override tests.

### Phase C — operator workflow and report

- Add Results → Framing evidence navigation.
- Add a project library and one staged workspace:
  Discovery → Codebook → Reveal → Review → Gaps → Handoff.
- Preserve explicit edit/save/cancel states and unsaved-change protection.
- Show complete denominator progress, unavailable rows, prompt spread,
  provider/model/mode scope, reviewer method, and elapsed operator time.
- Render a standalone paper-surface framing report with print, Markdown, and
  JSON evidence exports. The existing audit report remains unchanged so
  historical reports do not gain empty sections.
- Client output includes fixed prompts verbatim in Method, public-vs-client
  positioning-source disclosure, and no CI/eligibility/stability language.
- Acceptance: component/action tests, forbidden-copy tests, export boundary
  tests, keyboard/focus checks, and browser walkthrough.

### Phase D — immutable Simulation handoff

- From Handoff, select a reviewed accepted annotation and create an immutable
  snapshot containing codebook/coding versions, n/N, prompt spread,
  provider/model/mode, review method, reveal provenance, literal offsets, and
  verbatim response.
- B2C measured-AI stimulus creation selects a snapshot; the server copies the
  exact raw response as stimulus body and keeps the existing response-id JSON
  for compatibility.
- B2C approval requires a same-project valid snapshot and byte-equal verbatim
  body. No custom-baseline route bypasses C-13/C-15.
- B2B approval retains the pre-M34 evidence-response-id rule.
- Approved pre-M34 studies render `LEGACY BASELINE`; snapshot-less drafts render
  `PRE-M34 BASELINE`; snapshot-backed studies render the copied evidence label.
- Render snapshot provenance on Simulation design, results, reports, JSON,
  Markdown, print, and CSV surfaces wherever the result appears.
- Acceptance: repository/RPC bypass tests, body-equality check, B2C/B2B and
  historical rendering tests, snapshot immutability/hash tests, and C-12 wall
  regression.

### Phase E — verification and close-out

- Fresh and upgrade migration proof.
- Lint, typecheck, full Vitest, mock E2E/golden where affected.
- Interactive Chrome walkthrough at 1280px and narrow drawer width:
  create → blind codebook → lock → reveal → complete review → classify →
  export → handoff → attach snapshot → approve Simulation → inspect result and
  report provenance.
- Independent requirement-by-requirement audit against FE-1–FE-12 and C-15.
- Update PRD, MASTER_CONTEXT, ENGINEERING_SPEC, DEVELOPMENT_GUIDELINES,
  README command tables if changed, PROTECTED_REGISTER, and BUILD_NOTES.

## 5. Expected production areas

- `src/db/migrations/0013_*`, `0014_*`, migration metadata
- `src/db/schema/enums.ts`, `matrix.ts`, `resonance.ts`, new `framing.ts`
- `src/core/matrix.ts`, `prompt-templates.ts`, `semantic.ts`,
  `framing-evidence.ts`, report/resonance DTO helpers
- `src/db/repositories/matrix.ts`, `metrics.ts`, findings paths,
  new `framing.ts`, `resonance.ts`
- `src/modules/framing/*`, `src/modules/resonance/*`
- `src/app/projects/[id]/framing/*`, export/print routes
- `src/components/framing/*`, Simulation evidence surfaces, `src/core/nav.ts`
- seed, schema, unit, DB, wall, export, and Playwright tests

## 6. Commit boundaries

1. Plan/canon approval.
2. Representation intent + migrations + walls.
3. Workflow repositories/actions.
4. Operator workspace + report/export.
5. C-15 Simulation handoff/rendering.
6. Interactive verification + canon close-out.
