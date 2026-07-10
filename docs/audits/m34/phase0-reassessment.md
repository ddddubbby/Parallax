# M34 Phase 0 — Protocol Reassessment (the NO-GO note the gate requires)

> 2026-07-11. Status: **NO-GO stands after two runs.** C-15 unfrozen. No eligibility
> threshold was changed at any point (v1 → v2 verified byte-identical). This note is
> the escalation record the Phase-0 gate mandates, plus the lead's ruling on it (D-095).

## Run history

| Run | Instrument | Verdict | What the failure actually was |
|---|---|---|---|
| 1 (2026-07-10) | framing-protocol.v1 | NO-GO | Instrument, not method: whole-payload Zod voiding on >240-char `evidence_quote` killed 5/60 neutral responses → `extraction_incomplete` before eligibility ever evaluated; plus unbounded label vocabulary (213 labels/264 frames); plus Heytea organic = invalid dataset (project mislabeled `b2b`, the D-052 defect; BF-24 excludes B2B). |
| 2 (2026-07-11) | framing-protocol.v2 (per-frame salvage, label-form rules, deterministic normalization, 90s call deadlines, Heytea gate-excluded) | NO-GO | **Real verdicts for the first time**: neutral DeepSeek `prompt_sensitive` (top wins 2/6), neutral OpenAI `volatile` (1/6); Insta360 organic `sparse` (correct abstention); negative control abstains. |

## Corrected scientific conclusion (supersedes the agent's run-2 first reading)

The agent's initial reading — "the framing is proven stable and prevalent; OpenAI passes
5/6 under family collapse" — was an **overclaim** and is withdrawn. The hand-collapse
that produced 4/6 (DeepSeek) and 5/6 (OpenAI) was an unfrozen, post-hoc synonym rule
designed while looking at the same responses it scored. Designing the rule on Insta360
and validating it on Insta360 is circular.

The defensible conclusion:

> **The current method cannot distinguish conceptual stability from dimensional
> variation.** A plausible concept-level consolidation recovers cross-prompt recurrence,
> suggesting the current ontology (`dimension::label` as frame identity, cosine-0.82
> label-string merge) may be suppressing a real signal. That justifies redesigning the
> measurement model — it does not establish any brand's framing as stable, nor any
> scope as eligible.

Two structural defects identified:

1. **Malformed eligibility unit.** Dimension is baked into cluster identity, so a frame
   the extractor legitimately tags `category` in one response and `offering` in another
   ("action camera" is genuinely both) can never consolidate. Per-dimension eligibility
   does not rescue it (tested: still 1/6) because the fragmentation is *across* dimensions.
2. **The prompt set is not six paraphrases.** v4 ("what does X make or offer") steers
   `offering`; v5 ("who is X for") steers `audience`. Requiring one frame to dominate
   across deliberately different questions confuses multidimensionality with instability —
   a coherent brand can fail because different questions correctly elicit different facets.
   This is the more fundamental defect; concept clustering alone would mask it.

## The ruling (D-095)

**Approved:** the harness timeout fix (D-039 parity) and per-frame salvage (D-011
layering); Phase-2 production code mirroring the existing extraction state machine
verbatim (three separate harness bugs re-learned product lessons — payload voiding,
missing deadlines, fixture clobbering); the continued NO-GO with no threshold relaxation;
prompt-set reassessment; concept/dimension-separation **research**.

**Not approved:** majority-vote dimension resolution (hides real polysemy instead of
modeling it); hand-authored synonym collapse as production logic; declaring OpenAI (or
any scope) eligible; freezing C-15.

## framing-protocol.v3 design requirements (research next, then freeze, then held-out test)

1. **Two-level ontology.** Concept identity is separate from dimension tags. A concept
   (e.g. `action/360 camera`) carries a *distribution* of observed dimensions
   (`category`, `offering`, …), reported, never forced to one winner.
2. **Admission vs diagnostic prompts.** Admission set = genuinely open paraphrases only
   (currently v1/v2/v3/v6). v4 → offering probe; v5 → audience probe: they enrich the
   framing profile and never determine prompt-robustness. The admission-set size and its
   win threshold must be re-specified *together* (e.g. restore a 6-prompt admission set
   with new open paraphrases, or re-derive the required-wins rule for 4) — pre-registered
   in v3 before any data is scored, never tuned afterward.
3. **Rebuilt controls suite** (the current rotating fixture uses labels — "action camera",
   "360 camera", "sports cam" — that a legitimate coarser synonym model may merge, making
   the negative control accidentally stable):
   - positive control: surface synonyms of ONE concept → must consolidate and pass;
   - negative control: genuinely different concepts → must abstain;
   - polysemy control: one label legitimately spanning two dimensions → must remain one
     concept with a two-dimension distribution;
   - over-merge control: semantically related but strategically distinct frames
     (e.g. "budget action camera" vs "professional action camera") → must remain separate.
4. **Brand-level dev/holdout split.** Insta360 is **development data** (it drove this
   redesign; it can never validate it). Frozen v3 is then evaluated on: ≥1 unseen B2C
   brand with an expected stable category frame; ≥1 unseen brand with genuinely
   fragmented framing; the adversarial fixture. Freeze rules before scoring held-out data.
5. **Commercial-value layer.** Distinguish identity frames (what the brand is/offers)
   from associative frames (qualities, users, occasions, differentiators, concerns), and
   define the *actionable framing gap*: a stable association conflicting with intended
   positioning or omitting an important verified truth. "AI consistently says Insta360
   makes 360 cameras" is defensible but commercially trivial; v3's outputs must surface
   the associative layer, or the baseline risks being true and useless.

## Standing data gaps (independent of v3)

- **Organic data availability is now established; framing validity is not.** The clean
  `HEYTEA Consumer Feasibility` project (`consumer_venue`) completed a bounded live
  audit on 2026-07-11: 150/150 responses and 150/150 Evidence Layer extractions valid.
  HEYTEA appeared in 36/60 open discovery/consideration responses, with 8/12 cells at
  at least 3/5 mentions. This supplies valid consumer organic-lane development data;
  it does not establish a stable or eligible framing, and the invalid v2 framing
  instrument was not run. See `heytea-consumer-feasibility.md`.
- **Held-out brands are selected but deliberately unrun.** Crocs (clear-identity role)
  and Xiaomi (fragmented-identity role) are pre-registered in `heldout-register.md`.
  Neither receives brand-targeted generation, extraction, or inspection until v3 and
  its implementation manifest are frozen and the control/gold-set gates pass.

## Evidence inventory

- `fixtures/framing/framing-protocol.v1.json` — run-1 NO-GO record, untouched.
- `fixtures/framing/framing-protocol.v2.json` — run-2 NO-GO record (thresholds identical
  to v1; instrument changes only), incl. `neutralSampling` (DeepSeek temp 0.7 / OpenAI
  model-default — gpt-5.5 rejects non-default temperature, verified 2026-07-10) and
  `gateExclusions`.
- `docs/audits/m34/phase0-feasibility.md` — run-2 report (verdicts, salvage stats,
  exclusions, costs).
- `docs/audits/m34/*-frames*.json` — both runs' extraction records (v1 runs preserved
  as `.v1-run.bak.json`); `neutral-generations.json` (60 generations with per-record
  sampling provenance).
- Total Phase-0 spend across both runs: ≈ $0.60.

---

## Addendum (2026-07-11, D-096): risk disposition + verified defect list

The lead's second ruling triaged the outstanding risk list. Verification performed
before recording: the 772-frame quote audit reproduced exactly — **484/772 literal,
266 normalized-only, 22 unmatched** (extractor stitches non-contiguous text with
ellipses; the "exact quote" contract is enforced only as type+length). Organic
extraction-version fan-out confirmed in code (no latest-version filter, no run pin),
not yet manifested (44/44 distinct). Resume identity, hit-derived denominators, and
the analyzer-internal negative fixture confirmed from source.

**Fix before any v3 run (instrument):** immutable run manifests (prompt/raw-text
hashes + full model/decoding/protocol identity; mismatch = new run); response-state
denominators (`no_frame|uncertain|insufficient_evidence` count); quotes resolved to
verified source offsets (reject unsupported frames); organic evidence pinned to one
declared run + extraction version; all four controls through the real
clustering/eligibility path; review blinded to counts/outcomes with label mappings
locked before scoring (relabel-to-same must not be able to manufacture eligibility).

**Methodology (dev-data only):** framing-profile vs dominant-frame experiment
(independently stable concepts, per-concept dimension distributions, identity vs
associative layers, one explicit target association; ties ≠ instability); small
blinded human-coded gold set (validates the coding instrument, not a calibration
study); preregistered ablation of the shared uncertainty clause; new
`entity_ambiguous` abstention state.

**Product:** PRD gains a post-blind gap-analysis stage before Phase 1 — the
actionable framing gap tied to verified facts and intended positioning; stable
category recognition alone is commercially trivial.

**C-15 rollout amended (supersedes D-094 pt-7 hard cut):** frozen v3 → controls +
gold set + held-out brands → **shadow/advisory mode** measuring eligibility rate,
abstention reasons, review time, actionable-gap rate → hard enforcement only if the
workflow supports the commercial promise; explicit invalidation on any component
version change; drift automation deferred; interim C-13 studies carry
`PRE-M34 BASELINE` disclosure.

**Security/ops queued:** untrusted-data envelope + adversarial fixtures for raw AI
text (before production integration); embedding + frame-extraction spend into
projection/cap/ledger/daily budgets (before Phase 3). Raw Phase-0 JSON artifacts are
now gitignored with SHA-256 anchors in `MANIFEST.md` (done this session).

**Explicitly not reopened inside M34:** Wilson/respondent claims, B2B baselines,
price/promo protocols, purchase-intent calibration, universal ontology, automated
drift monitoring, large human validation, or re-running v2 to seek a pass.
