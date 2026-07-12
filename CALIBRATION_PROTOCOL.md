> LIFECYCLE: PARKED · ROLE: PLAYBOOK · OWNS: SSR human-benchmark calibration design for the parked Simulation Layer (M26, D-082)

# CALIBRATION_PROTOCOL.md — SSR Human-Benchmark Calibration

> M26 (D-082). Describes how a future human-benchmark calibration run would
> work and what bar it must clear before an SSR anchor set may render as
> `calibrated: true` anywhere in this product. **Nothing in this document
> flips that flag.** Every anchor set shipped through M26 stays
> `calibrated: false` (D-066); this is the machinery for calibrating later,
> not a calibration claim. Gated on external human-benchmark data actually
> existing — until then this document and `src/core/calibration.ts` are
> unused infrastructure, which is the honest state to be in.

## 1. Why this exists

The Simulation Layer scores free-text synthetic reactions into a five-point
purchase-intent construct via Semantic Similarity Rating (SSR,
arXiv:2510.08338) against versioned anchor statement sets. `purchase_intent.v1`
ships uncalibrated (D-066) — nobody has checked its output against real human
respondents shown the same stimuli. Reporting an uncalibrated method as if it
were validated would be exactly the kind of borrowed validity this project's
founding rule against overpromising AI outcomes — never a fixed ranking
promise, extended to simulation by C-14 — exists to prevent. This protocol
is the pre-registered bar a real benchmark must clear before that changes.

## 2. Survey design

1. **Same stimuli, same axis.** Recruit human respondents matching the panel
   persona axes a study actually used — age band and income band, the two
   paper-validated axes (D-066; location and behavioral profile stay prompt
   context, never presented as validated segmentation to respondents either).
2. **Direct Likert rating, not free text.** Each respondent is shown one
   stimulus variant (the same framing text the synthetic panel reacted to)
   and answers a single five-point purchase-intent question directly — no
   free-text elicitation step is needed for humans, since SSR's whole
   purpose is converting an LLM's free text into a Likert-equivalent
   distribution, and humans can just answer the Likert question. This keeps
   the comparison honest: both sides end up as a five-point PMF over the
   same construct.
3. **One stimulus at a time, no comparison framing.** Respondents rate a
   single stimulus per screen, matching how the synthetic panel is prompted
   (a resonance cell reacts to one stimulus, not a side-by-side).
4. **Aggregate into a PMF.** For each stimulus, the proportion of
   respondents choosing each of the five points is that stimulus's human
   PMF — the same shape SSR produces from the synthetic panel.

## 3. Minimum sample guidance

- **n >= 30 respondents per stimulus aggregate**, mirroring this product's
  own sufficiency gate for aggregate claims (n >= 30 eligible samples,
  `MASTER_CONTEXT.md` section 3 / D-015). A stimulus benchmarked on fewer
  than 30 human ratings does not count toward the acceptance bar in section 5
  — its pairing may still be recorded for reference but is directional-only,
  same convention this product already applies everywhere else n < 30.
- **At least 8 distinct stimuli** in the full benchmark dataset. The
  comparison harness (section 4) will run on as few as 2 paired stimuli
  structurally, but a correlation computed over a handful of points is not a
  stable estimate of anything — 8 is a practical floor for the acceptance
  decision in section 5, not a hard requirement enforced in code.
- Benchmark stimuli should span more than one study/pack where possible
  (framing-repair, price presentation, promo framing, message/claim
  variants) so the acceptance decision isn't only validated against one
  narrow content type.

## 4. Paired-data fixture format

Each stimulus contributes one paired observation: a human Likert PMF and the
SSR-scored PMF for the identical stimulus. The format is a JSON object with
a mandatory `note` field and an array of pairs — see
`fixtures/calibration/example-paired.json`, which is the living spec this
document points at (its own test in `src/core/calibration.test.ts` proves
the harness accepts the shape below).

```json
{
  "note": "SYNTHETIC EXAMPLE DATA — ... not real human survey responses",
  "studyId": "<resonance_studies.id this benchmark pairs with>",
  "anchorSetVersion": "<the SSR anchor set version being benchmarked>",
  "pairs": [
    {
      "stimulusId": "<resonance_stimuli.id or a stable label>",
      "stimulusLabel": "<human-readable label>",
      "ssrProviderId": "<the generation engine whose SSR scores are paired>",
      "ssrRunId": "<audit_runs.id the SSR PMF came from>",
      "humanSampleN": 32,
      "humanPmf": [0.10, 0.20, 0.30, 0.25, 0.15],
      "ssrPmf": [0.08, 0.22, 0.32, 0.24, 0.14]
    }
  ]
}
```

`humanPmf`/`ssrPmf` are five-point arrays (index 0 = Likert score 1) summing
to ~1. Real benchmark data is never checked in under
`fixtures/calibration/` — only the synthetic format example lives there; a
real dataset stays wherever the operator's survey tooling produces it and is
fed to the harness as a script argument (section 7).

**Per-engine pairing, not pooled.** `ssrProviderId` is required per pair
because each generation engine is scored as its own synthetic population
(D-080) — a benchmark of DeepSeek's SSR output says nothing about GPT-4o's or
Gemini's, and the acceptance decision in section 5 is scoped per engine, not
averaged across engines.

## 5. Comparison harness

`src/core/calibration.ts`'s `computeCalibrationSummary(pairs)` takes an array
of `{ stimulusId, humanPmf, ssrPmf }` (>= 2 stimuli, each PMF validated for
shape and that it sums to ~1) and returns, per stimulus and in aggregate:

- **Pearson correlation** of human vs. SSR per-stimulus means across all
  paired stimuli (`pearsonR`; `null`, never `0`, when either side has zero
  variance — e.g. every stimulus scored an identical mean).
- **Mean absolute error** of per-stimulus means, in Likert points
  (`meanAbsoluteError`, plus each stimulus's own `absoluteError`).
- **1-Wasserstein distance** between the two PMFs per stimulus
  (`wasserstein1` / `meanWasserstein1`) — the closed-form sum of absolute CDF
  differences at each of the four interior category boundaries on the
  five-point scale (see the function's own comment for the derivation), which
  catches an SSR distribution that reproduces the right mean via a shape
  that looks nothing like the human distribution (e.g. bimodal vs. a real
  single peak).

Pure functions, no DB, no network calls, no new dependencies. Unit tests in
`src/core/calibration.test.ts` hand-verify a perfect-match case
(zero error/distance, r = 1) and a deliberately shifted three-stimulus case
(mean absolute error = 1.0, mean Wasserstein-1 = 1.0, r = 11/14) against
numbers worked out by hand in the test file's own comments — not just
asserted against the code's own output.

## 6. Acceptance thresholds for flipping `calibrated: true`

**These are this protocol's own floor, not a number quoted from
arXiv:2510.08338.** The paper's own reported correlation for its SSR setup
has not been independently re-verified against this table, and no claim in
this product may cite the paper's figure as if it were this product's
measured result (the same discipline D-066 already applies to anchor-set
methodology). A NEW anchor set version (never an edit to an existing one —
D-069's freeze-on-approval rule applies to anchor sets exactly like it
applies to prompt cells) may render as `calibrated: true` only when a
benchmark run against it clears ALL of the following, scored PER GENERATION
ENGINE (section 4's per-engine pairing):

1. **Correlation.** `pearsonR >= 0.6` across all benchmarked stimuli for
   that engine (at least 8 stimuli, per section 3).
2. **Precision.** `meanAbsoluteError <= 0.5` Likert points.
3. **Shape.** `meanWasserstein1 <= 0.75`.
4. **Sample sufficiency.** Every stimulus counted toward 1–3 has
   `humanSampleN >= 30` (section 3); under-sampled stimuli are excluded from
   the acceptance decision, not counted as passing or failing.
5. **Directional agreement.** For every variant-vs-baseline pairing in the
   benchmark, the sign of the human mean shift and the sign of the SSR mean
   shift agree for at least 80% of pairings. This is the actual headline
   claim being validated — the product reports comparative shifts, never
   absolute means (C-14) — so a calibration that only checks absolute-mean
   closeness without checking directional agreement would validate the
   wrong thing.

If a benchmark clears 1–4 but fails 5 (or vice versa), the anchor set stays
`calibrated: false` and the shortfall is recorded, not rounded up.

## 7. What happens when a version passes

- Author a new anchor set version (e.g. `purchase_intent.v2`) in
  `fixtures/ssr/anchor-sets.json` with `"calibrated": true` — `src/core/ssr-anchors.ts`
  already refuses an unknown version string, so existing studies pinned to
  `purchase_intent.v1` are unaffected until they're explicitly re-pinned to
  v2 at their own next approval (D-069).
- **No code change is needed for the report to reflect this.** The method
  section already renders off a single boolean:
  `ResonanceReportContext.anchorSetCalibrated` (`src/core/report-templates.ts:153`)
  flows into the method table's "Anchor calibration" row
  (`src/core/report-templates.ts:510`, currently
  `"calibrated"` vs. `"uncalibrated anchor sets"`). A study pinned to a
  version with `calibrated: true` renders "calibrated" automatically; a
  study still on v1 keeps rendering "uncalibrated anchor sets."
- A future script (deliberately **not written this sprint** — there is no
  real paired dataset yet to run it against) would load a real paired-data
  file in this document's format, call `computeCalibrationSummary`, print the
  section 6 checklist, and exit non-zero if any threshold fails. Writing that
  script now, with nothing to run it on, would be untested scaffolding —
  the deliberate stop-line for this milestone.

## 8. Honest limits

- **Text-only stimuli.** This protocol (and the product) benchmarks and
  simulates text framings only. The SSR paper's image-stimulus setting
  performed mildly better than its text setting — a limitation carried
  forward, not one this calibration effort resolves.
- **Per-engine populations, not one calibration.** Per D-080, each
  generation engine is a distinct synthetic population. A `calibrated: true`
  anchor set benchmarked against one engine says nothing about another
  engine's calibration status; the flag is a property of an anchor set
  version, but the acceptance decision behind it must be re-earned per
  engine before that engine's studies can be described as calibrated in any
  report language beyond the shared boolean.
- **Construct validity, not behavior prediction.** Even a `calibrated: true`
  anchor set only means the five-point purchase-intent construct's mean
  shift correlates with a human panel's mean shift on the same construct. It
  is never a claim about real-world buying behavior, and reports must
  continue to frame every simulation figure as a Likert-scale shift, never
  as a probability of purchase, a promised increase, or a rate of return
  (C-14 — the same forbidden-phrase list `RESONANCE_TEMPLATE_FORBIDDEN_PHRASES`
  already enforces on study-pack copy applies to this document's own prose,
  verified by `src/core/calibration-protocol.test.ts`).
- **No invented uncertainty intervals.** Section 5's harness reports point
  estimates only (correlation, mean absolute error, mean distance) — no
  confidence interval is fabricated around any of them (D-023's rule against
  invented intervals applies here exactly as it does everywhere else in this
  product).
