# framing-protocol.v4 — Preregistration (§§1–11 RATIFIED & LOCKED)

> **Status: RATIFIED 2026-07-11 (lead).** §§1–11 are LOCKED — no value changes without a
> v5 bump; a change after any scoring is a new protocol, never an amendment. Two dev-data
> calibration steps remain before **freeze** (CAL-1 span budget, CAL-2 prompt wording, both
> on Insta360); after freeze nothing may be re-tuned. **Nothing is scored (no control,
> ablation, gold, or held-out) until the §12 freeze boxes are all checked.** Governed by D-098
> and the design brief (`framing-protocol-v4-brief.md`); carries all standing rules
> (D-095/096/097): freeze before scoring, no threshold loosening, no post-score merges,
> no arm promotion, Insta360 + HEYTEA are development data forever, Crocs/Xiaomi sealed.

This document fixes every free parameter *before* data is scored. Two calibration steps
are permitted on **development data (Insta360)** and must complete before the lock:
(CAL-1) the concept-mapping span budget, and (CAL-2) the extraction prompt wording. Both
are recorded and frozen at lock; after lock they are immutable.

---

## 1. Extraction contract — `blind-frame-extraction.v4`

**Job:** find character-offset spans in the immutable raw response that carry a framing
signal about the observed brand. The model authors **no identity** — only spans.

Per-span object:
```
{ "start": int, "end": int,            // offsets into raw_text; raw_text[start:end] must reproduce exactly
  "dimension": one of the 8 tags,      // category|offering|audience|occasion|attribute|differentiator|concern|uncertainty
  "stance": "stated"|"implied"|"hedged", // hedged carries the uncertainty signal the v3 clause used to force
  "gloss": string (<=60 chars) }        // reviewer convenience ONLY — zero role in mapping/eligibility/reporting
```
Envelope: `{ schema_version: 4, state: ok|no_frame|uncertain|insufficient_evidence|entity_ambiguous|malformed, spans: [...] }`.

**Server validation (hard):** every span offset is validated against the stored raw text;
`raw_text[start:end]` must equal the reproduced span. A span that fails is **rejected and
counted** (`droppedSpans`), never stitched or normalized. The v3 quote-verification defect
(484/772 literal) is structurally impossible here — offsets are the quote.

Blind-input contract (unchanged, test-enforced): raw text + observed brand name + schema
only. Never fact sheet / attributes / competitors / original prompt / operator labels.
Manifest, 90s deadline, one retry, per-span salvage all carry over from the v3 harness.

**`entity_ambiguous`:** if the brand name alone cannot identify the intended entity, the
model returns that state with `spans: []`. Preregistered scope rule: if `entity_ambiguous`
+ `insufficient_evidence` together exceed **40%** of a scope's admission generations, the
scope abstains `entity_ambiguous` and is not mapped.

---

## 2. Prompts — `representation-prompts.v4`

### 2.1 Admission set (5 bare open paraphrases — NO shared instruction sentence)
1. `What is {client_brand}?`
2. `Describe {client_brand}.`
3. `Tell me about {client_brand}.`
4. `Give an overview of {client_brand}.`
5. `Explain {client_brand}.`

No uncertainty clause, no "say so if unsure," no shared instruction of any kind. Hedging is
captured by the `hedged` stance at extraction; thin answers land in `no_frame` /
`insufficient_evidence`; entity confusion in `entity_ambiguous`. **CAL-2** may adjust only
surface wording to remove accidental steering, on Insta360, before lock — never to tune an
outcome.

### 2.2 Diagnostic probes (enrichment ONLY — never admission evidence)
- Offering probe: `What does {client_brand} make or offer?`
- Audience probe: `Who is {client_brand} typically for?`

These populate the associative-layer profile and are reported, but **never** determine
prompt-robustness or eligibility (the v3 error: v4/v5 steered dimensions yet counted as
admission).

### 2.3 Generation
Per scope = project × provider × mode. Admission: 5 prompts × 5 generations = 25. Probes:
2 × 5 = 10. Mode: **ungrounded only** for v4 (grounded unproven; per-mode scoping stands,
D-094). Sampling recorded per-record (DeepSeek temp 0.7; OpenAI omit temp — gpt-5.5 rejects
non-default, verified 2026-07-10). Manifest binds prompt-set hash + decoding + model.

---

## 3. Concept mapping — operator as blinded mapper

1. All spans across a scope are **deduplicated by exact text**, then presented **shuffled,
   stripped of counts / variant / provider / arm / any running tally** (D-096 blinding).
2. **Span budget (CAL-1, preregistered):** proposed **`N_max = 60`** distinct dedup'd spans
   per scope. Calibrated on Insta360 dev data before lock; final value frozen at lock. A
   scope exceeding `N_max` abstains **`mapping_overflow`** — an over-fragmenting extractor
   is a failed measurement, not extra reviewer work.
3. Operator assigns each span to a concept (create-or-assign). Output = a **concept map**
   (span → concept, concept → dimension distribution). The map is **locked and versioned
   before any eligibility scoring**; scoring may never edit it (no relabel-to-same after
   scoring — the v3 manufactured-eligibility hole).
4. **Reliability (preregistered floor):** a random **20%** of spans are re-mapped in a
   second blinded pass (different order, fresh session). **Cohen's κ ≥ 0.70** required; below
   floor → the scope's mapping is unreliable → abstain `mapping_unreliable`, do not score.
5. LLM-assisted mapping is **out** for v4 (mapper-of-record). Later versions may add it as a
   suggestion layer under the same lock-before-scoring rule.

---

## 4. Eligibility & the framing profile (two-level, profile-not-winner)

A concept **carries** an admission prompt iff ≥ **3 of that prompt's 5** generations
contribute ≥1 span mapped to it (dedup: one generation counts once per concept).

A concept is **stable** iff it carries ≥ **4 of the 5** admission prompts (pinned *with* the
5-prompt set size, per D-095) **and** survives **leave-one-prompt-out** (still ≥3/4 wins on
each of the 5 exclusions — i.e. remains stable when any single prompt is dropped).

**Identity layer** = stable concepts whose dimension distribution is majority
`category`|`offering`. **Associative layer** = all other stable concepts (audience /
occasion / attribute / differentiator / concern), plus probe-enriched concepts (reported,
never counted for eligibility).

**Scope eligibility:** a scope yields an **eligible framing profile** iff it has ≥1 stable
identity-layer concept **and** no unresolved contradiction (two stable concepts that a
preregistered contradiction check flags as mutually exclusive — recorded, operator-confirmed,
no auto-resolution). **Multiple stable concepts do not fail — they are the profile.** A tie
is never instability (the D-096 correction). Every non-eligible outcome is an explicit
abstention: `sparse | mapping_overflow | mapping_unreliable | entity_ambiguous |
no_stable_identity | unresolved_contradiction`.

The **medoid** (baseline stimulus, when M34 later certifies) is the stored response whose
embedding is closest to the mean of the responses supporting the profile's dominant stable
identity concept — verbatim, immutable (C-15). Not built in v4; the *rule* is fixed here.

---

## 5. Controls suite (through the real pipeline, as immutable inputs)

Each control is a fixed set of hand-authored raw "responses" fed through the exact
extraction → mapping → eligibility path (never analyzer-internal shortcuts, the v3 negative-
fixture defect). All four must pass, else NO-GO.

| Control | Construction | Pass criterion |
|---|---|---|
| Positive (synonym consolidation) | One concept in ≥5 surface synonyms across prompts | Consolidates to 1 stable concept; eligible |
| Negative (distinct concepts) | 5+ genuinely different concepts, none dominant | No stable identity concept; abstains `no_stable_identity` |
| Polysemy | One label legitimately `category` AND `offering` | One concept with a **two-dimension distribution**, not two concepts, not one forced winner |
| Over-merge | "budget action camera" vs "professional action camera" — related but strategically distinct | Remain **separate** concepts; neither merged away |

---

## 6. Clause-agreement freeze gate (permanent, all future versions)

Run the full dev-data pipeline **twice**, differing only in elicitation instruction:
- **Arm A:** the bare admission set (§2.1).
- **Arm B:** the same set + a single minimal hedge clause.

**Freeze requires the stable-concept SETS to agree**, preregistered as: Jaccard(stable
concepts A, B) ≥ **0.60** **AND** identical scope eligibility verdict **AND** same dominant
identity concept. Disagreement ⇒ the instrument measures the instruction ⇒ **NO-GO,
redesign (v5)** — never pick the arm you prefer (the D-097 rule, now standing law). The
shipped protocol is Arm A (bare); Arm B exists only to prove insensitivity.

---

## 7. Human-coded gold set (instrument validity, before held-outs)

Operator codes a preregistered sample from **development data** (blind to eligibility
outcomes):
- **60 spans** for: supported-by-offset-text (y/n), about-client-brand (y/n),
  dimension-reasonable (y/n).
- **15 concept pairs** for should-merge / should-not-merge.

Preregistered floors: support ≥ **90%**, aboutness ≥ **90%**, dimension-reasonable ≥
**80%**, merge-decision κ ≥ **0.70**. Any floor missed ⇒ the coding instrument is invalid
⇒ NO-GO. This validates the instrument; it is **not** a calibration study (D-096).

---

## 8. Held-out gate (Crocs, Xiaomi — sealed)

Scored **exactly** as `heldout-register.md`, using the **frozen** v4 prompts/decoding/
mapping/eligibility and the same declared provider+mode for both:
- **Crocs:** must yield an eligible profile with ≥1 stable identity concept. Abstention is
  scientifically acceptable but scores the gate **NO-GO** (no real held-out passed).
- **Xiaomi:** must preserve **multiple distinct stable identities** or abstain **without an
  over-merge**. Manufacturing one dominant frame by merging strategically distinct
  categories = NO-GO.
- All four controls pass; ablation agrees; gold floors met.
Held-out results **never relax** these conditions. Any protocol/impl change they prompt = v5,
and neither brand may be reused as a v5 held-out.

---

## 9. Cost & ops (hard caps, preregistered)

- Dev cycle (controls + both ablation arms + gold generation/extraction/mapping) ≤ **$3.00**.
- Each held-out scope ≤ **$2.00**.
- Every extraction / embedding / mapping-support call enters projection + per-run cap +
  daily-budget accounting **before** the call (C-2; binding per D-098). No post-hoc spend
  discovery.
- Immutable run manifests; 90s deadlines; per-arm caps abort loudly.

---

## 10. Decision procedure

**GO (freeze v4 for production)** iff, in order, each gate passes: controls (§5) → clause-
agreement (§6) → gold floors (§7) → held-out gate (§8). Any failure ⇒ **NO-GO**, and §11.

## 11. What a NO-GO triggers

Record the failing gate; write the v5-conditions note (what a materially different instrument
must change); **do not** re-run v4 seeking a pass, loosen any floor, or promote an arm. If the
clause gate (§6) fails, the elicitation model is still contaminated. If mapping reliability
(§3.4) or gold (§7) fails, the coding instrument is still too noisy — the D-097 exit bar
stands: a lower-variance, human-checkable instrument is the prerequisite, not iteration.

---

## 12. Lock record

- [x] **Lead ratifies §§1–11** — 2026-07-11, no amendments to the proposed values
      (5-of-... admission stability 4/5 + LOO, N_max=60 proposed, κ≥0.70, gold 90/90/80,
      clause Jaccard≥0.60, caps $3 dev / $2 held-out). §§1–11 now immutable pre-scoring.
- [ ] CAL-1 span budget `N_max` finalized on Insta360: ____ (proposed 60; may only tighten
      or confirm from observed dedup'd span counts — never loosened to admit an overflow scope).
- [ ] CAL-2 extraction prompt wording finalized on Insta360: ____ (surface-only; remove
      accidental steering; no outcome tuning).
- [ ] `frozenAt`: ____   ·   fixtures frozen: `framing-protocol.v4.json`,
      `representation-prompts.v4.json`, `blind-frame-extraction.v4.json`.
- [ ] Only after all boxes checked may any control, ablation, gold, or held-out be scored.

Pre-CAL fixtures (`representation-prompts.v4`, `blind-frame-extraction.v4`,
`framing-protocol.v4` with `status:"ratified-pre-cal"`) are written now so the CAL harness
reads canonical inputs; freeze flips `status:"frozen"` + `frozenAt` after CAL and lead
confirmation of the calibrated numbers.
