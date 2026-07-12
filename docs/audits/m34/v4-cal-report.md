# framing-protocol.v4 — CAL-1 / CAL-2 (Insta360 dev data)

> 2026-07-11T04:03:10.487Z · brand Insta 360 · 70 extractions · $0.6692 (cap $3)
> Calibration only — no scoring, no eligibility. Insta360 is development data.

## Extraction states
- ok: 58
- malformed: 12

## CAL-1 — span budget (admission spans, per scope)
proposed N_max = 60
- `insta360|deepseek|ungrounded`: dedup'd spans **771** (total 771, dropped/offset-unsupported 6) — **OVER BUDGET**
- `insta360|openai|ungrounded`: dedup'd spans **648** (total 649, dropped/offset-unsupported 9) — **OVER BUDGET**

**Recommendation:** AT LEAST ONE SCOPE EXCEEDS 60 — tighten extractor or raise budget with rationale (never to admit an overflow scope)

## CAL-2 — prompt-wording steering (top-dimension concentration)
Admission mean top-dimension share: **0.306** · Probe mean (known-steered): **0.409**
- `a1` (admission): top=offering share=0.404 entropy=2.215 n=203
- `a2` (admission): top=differentiator share=0.297 entropy=2.494 n=313
- `a3` (admission): top=offering share=0.274 entropy=2.474 n=351
- `a4` (admission): top=offering share=0.287 entropy=2.552 n=320
- `a5` (admission): top=offering share=0.266 entropy=2.461 n=233
- `p_offering` (probe): top=offering share=0.427 entropy=2.201 n=288
- `p_audience` (probe): top=audience share=0.391 entropy=2.288 n=128

**Recommendation:** no bare admission prompt steers as hard as the probes — wording holds

## Next
Freeze requires lead confirmation of the calibrated N_max and any CAL-2 rewording, then
`framing-protocol.v4.json` flips `status:"frozen"` + `frozenAt`. Only then may controls,
the clause ablation, gold, and held-outs be scored (§12).
