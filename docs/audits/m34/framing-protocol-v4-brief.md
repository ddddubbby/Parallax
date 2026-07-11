# framing-protocol.v4 — Design Brief

> **Status:** Approved design brief (D-098, 2026-07-11). Not yet designed in detail, not preregistered, not frozen.
> Governs the next — and only sanctioned — protocol cycle after v3's rejection (D-097).
> Rule zero, carried from D-095/D-096/D-097: **freeze before scoring; no threshold loosening; no post-score merges; no arm promotion; Insta360 and HEYTEA are development data forever.**

## 1. What v4 must solve (the two-failure diagnosis)

v3 failed on development data for two *coupled* reasons, and a v4 that fixes only one fails on the other:

1. **Elicitation sensitivity.** One shared instruction sentence (the uncertainty allowance) flipped Insta360 from `unstable_profile` to eligible. Recurrence was partly a property of the instruction, not the text.
2. **Coding-instrument variance.** Blind mapping produced 112/123 unique labels from 30 responses; exact-offset enforcement rejected 81 (no-clause) / 39 (clause) unsupported frame observations — quote fidelity itself was clause-sensitive. The mapping step was also too costly and brittle to productize (~$1.12, transport failures, chunking artifacts).

**The v4 bar, stated once:** *recurrence must come from the text, not the instruction — and the mapping step must be small enough for a human to verify it.*

## 2. Instrument design

### 2.1 Extraction: `blind-frame-extraction.v4` — span extraction, not label authoring

- The extractor's job shrinks to finding **character-offset spans** (`start`, `end` into the immutable raw text) that carry a framing signal, each tagged with a dimension and stance. Offsets are validated server-side against the raw text; a span that doesn't reproduce exactly is rejected at the field level (per-frame salvage carries over).
- **No free-form frame labels drive identity.** The extractor may emit a short gloss for reviewer convenience, but the gloss has zero role in clustering, eligibility, or reporting. This removes the label-explosion failure at its source.
- Blind-input contract unchanged (raw text + observed brand name + schema only). Retry/dead-letter/deadline/manifest discipline carries over from the v3 harness.
- Dimension stays a per-span *tag*; concepts carry dimension **distributions** (D-096) — never a forced winner.

### 2.2 Concept mapping: operator as blinded mapper (bounded, lockable, checkable)

- The system presents the operator with **deduplicated span texts, shuffled, stripped of all outcome-relevant metadata** — no counts, no variant, no provider, no arm, no running tallies (D-096 review-blinding).
- The operator assigns each span to a concept (create-or-assign). The resulting **concept map is locked and versioned before any eligibility scoring runs**; scoring may never edit it. Relabel-to-same-collapse after scoring remains forbidden.
- **Bounded:** each scope carries a preregistered span budget (`N_max` distinct deduplicated spans). Exceeding it is an automatic abstention (`mapping_overflow`) — an over-fragmenting extractor is a failed measurement, not extra reviewer homework.
- **Checkable:** a sampled second blinded pass measures mapper self-consistency; the human-coded gold set (D-096) measures instrument validity (support, aboutness, offset mapping, synonym resolution, over-merge, dimension reasonableness). Reliability floors are preregistered before either check runs.
- LLM-assisted mapping is *out* for v4. It may return in a later version only as a suggestion layer under the same lock-before-scoring rule, never as the mapper of record.

### 2.3 Elicitation: zero shared instruction

- Admission prompts become **bare open paraphrases** — no shared uncertainty clause, no shared instruction sentence of any kind. What v3 used the clause for moves into machinery that doesn't touch elicitation: hedging is *detected at extraction* (stance tags), entity confusion becomes the `entity_ambiguous` abstention state, and thin answers land in the existing `insufficient_evidence`/`no_frame` states.
- v4/v5-style steered prompts remain **diagnostic probes only** (framing-profile enrichment), never admission evidence. Admission-set size and its win rule are re-specified *together* and preregistered (D-095).

### 2.4 The permanent clause-agreement gate

Every future protocol version — v4 and beyond — runs a **preregistered elicitation-sensitivity ablation on development data** before freeze: two arms differing only in the candidate instruction wording (for v4: bare prompts vs. a minimal-hedge variant). Freeze requires the **stable-concept sets to agree across arms** — not merely both arms passing. Divergence = the instrument is measuring the instruction; redesign, don't pick the arm you like. This is the gate that caught v3, promoted from a one-off to a standing rule.

## 3. Preregistered gate order (each gate blocks the next)

1. **Controls** — positive (synonym consolidation), negative (distinct concepts), polysemy (one concept, two-dimension distribution), over-merge (strategically distinct stays separate) — through the real pipeline, as immutable inputs.
2. **Clause-agreement ablation** on development data (§2.4).
3. **Human-coded gold set** — instrument validity floors (preregistered).
4. **Mapper-reliability check** — blinded self-consistency floor (preregistered).
5. **FREEZE** `framing-protocol.v4` (fixture + manifest schema + all thresholds).
6. **Sealed held-outs**: Crocs (expected eligible) and Xiaomi (must preserve multiple identities or abstain without over-merging), scored exactly as registered in `heldout-register.md`. **Both carry over from v3 unburned** — register rule 5 burns held-outs only when *held-out results* prompt the change, and v3 was rejected on development data alone.
7. Only then: migration 0013 + production Phases 1–6, with C-15 in **shadow/advisory mode first** (D-096 rollout unchanged).

## 4. Cost & ops constraints (hard requirements, not aspirations)

- **Every** harness/production mapping, review, extraction, and embedding call enters spend accounting (projection, per-run cap, daily budgets) — the v3 gate's ~$1.12 with unreconcilable overwritten attempts is the last time spend is discovered after the fact (C-2; D-096 queue item now binding).
- Immutable run manifests (prompt hash, raw-text hash, provider/model, decoding, extractor/embedding/protocol versions); any mismatch = new run.
- Per-call deadlines (90s) and per-arm spend caps, preregistered.

## 5. Relationship to Option B (descriptive framing profile — D-098)

- The **descriptive framing profile** ships as Evidence-Layer output *without* any eligibility, baseline, or certification claim: verified-offset frame observations, dimension distributions, prompt-variant recurrence structure, and explicit abstention states, labeled **EXPERIMENTAL / DESCRIPTIVE**. Concept-level statements appear only as clearly-attributed operator interpretation until v4 validates the mapper.
- C-15 stays blocked; new C-13 studies keep the `PRE-M34 BASELINE` disclosure; nothing descriptive may be upsold as "certified stable" in copy or conversation (C-14 discipline).
- **Held-out seal compatibility:** Crocs/Xiaomi *audits* (ordinary Evidence-Layer generation) may be run early for Option-B value. The framing pipeline must not run on them, and nobody inspects their framing patterns before v4 freeze. Every access gets recorded in `heldout-register.md`'s execution table.

## 6. Explicitly out of scope for v4

Wilson/respondent-style claims on correlated draws; B2B baselines; price/promo protocols; purchase-intent construct calibration; universal frame ontology; automated drift monitoring; any large human-validation study; re-running v2/v3 to seek a pass; LLM mapper-of-record.

## 7. Exit criteria

v4 is done when: the frozen fixture exists with all gates passed in order; Crocs/Xiaomi are scored exactly as registered; the gold-set and mapper-reliability numbers are in the gate report; and the production build plan's Phases 1–6 are re-pointed at the frozen v4 contracts (notably: `FrameExtractionV4` span-offset schema replaces the v1 label-identity schema in migration 0013's design before it ships).
